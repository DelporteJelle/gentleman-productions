import { neon } from "@neondatabase/serverless";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const sql = neon(process.env.DATABASE_URL!);
const saltRounds = 10;
// bcrypt.genSalt(saltRounds, function (err, salt) {
//   bcrypt.hash(password, salt, function (err, hash) {
//   });
// });

export async function POST(req: Request) {
  try {
    const { username, password } = await req.json();
    if (!username || !password) {
      return new Response("Missing credentials", { status: 400 });
    }

    // Query user from database
    const result = await sql`SELECT * FROM users WHERE username = ${username}`;
    const user = result[0];
    if (!user) {
      return new Response("User not found", { status: 401 });
    }

    // Compare password
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return new Response("Wrong password", { status: 401 });
    }

    // Create JWT
    const token = jwt.sign(
      { username: user.username, id: user.uuid },
      process.env.JWT_SECRET!,
      { expiresIn: "1h" },
    );

    // Set cookie
    return new Response(JSON.stringify({ token }), {
      status: 200,
      headers: {
        "Set-Cookie": `token=${token}; HttpOnly; Path=/; Max-Age=3600`,
        "Content-Type": "application/json",
      },
    });
  } catch (err) {
    return new Response("Internal Server Error", { status: 500 });
  }
}
