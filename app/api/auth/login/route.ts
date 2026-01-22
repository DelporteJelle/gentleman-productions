import { neon } from "@neondatabase/serverless";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const sql = neon(process.env.DATABASE_URL!);

export async function POST(req: Request) {
  try {
    const { username, password } = await req.json();
    if (!username || !password) {
      return new Response("Missing credentials", { status: 400 });
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
      "SameSite=Lax",
      isProduction ? "Secure" : "",
    ]
      .filter(Boolean)
      .join("; ");

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        "Set-Cookie": cookieOptions,
        "Content-Type": "application/json",
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    return new Response("Internal Server Error", { status: 500 });
  }
}
