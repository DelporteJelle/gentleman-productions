import { neon } from "@neondatabase/serverless";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

const sql = neon(process.env.DATABASE_URL!);

export async function POST(req: Request) {
  try {
    const { username, password } = await req.json();
    if (!username || !password) {
      return new Response("Missing credentials", { status: 400 });
    }

    // Rate limiting: Max 5 attempts per 15 minutes per IP
    const clientIp = getClientIp(req);
    const rateLimit = checkRateLimit(`login:${clientIp}`, 5, 15 * 60 * 1000);

    if (!rateLimit.allowed) {
      const retryAfter = Math.ceil((rateLimit.resetAt - Date.now()) / 1000);
      return new Response("Too many login attempts. Please try again later.", {
        status: 429,
        headers: {
          "Retry-After": retryAfter.toString(),
          "X-RateLimit-Limit": "5",
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": new Date(rateLimit.resetAt).toISOString(),
        },
      });
    }

    // Query user from database
    const result =
      await sql`SELECT * FROM users WHERE username = ${username.toLowerCase()}`;
    const user = result[0];
    if (!user) {
      // Use generic message to prevent username enumeration
      return new Response("Invalid credentials", { status: 401 });
    }

    // Compare password
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return new Response("Invalid credentials", { status: 401 });
    }

    // Create JWT with role support
    const token = jwt.sign(
      {
        id: user.uuid,
        username: user.username,
        role: user.role || "user", // Default to 'user' if no role set
      },
      process.env.JWT_SECRET!,
      { expiresIn: "7d" },
    );

    // Set cookie with secure options
    const isProduction = process.env.NODE_ENV === "production";
    const cookieOptions = [
      `token=${token}`,
      "HttpOnly",
      "Path=/",
      "Max-Age=604800", // 7 days
      "SameSite=Strict", // Changed from Lax to Strict for better CSRF protection
      isProduction ? "Secure" : "",
    ]
      .filter(Boolean)
      .join("; ");

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        "Set-Cookie": cookieOptions,
        "Content-Type": "application/json",
        // Security headers
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    return new Response("Internal Server Error", { status: 500 });
  }
}
