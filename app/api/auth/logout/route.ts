export async function POST() {
  // Clear the token cookie by setting it to expire immediately
  const cookieOptions = [
    "token=",
    "HttpOnly",
    "Path=/",
    "Max-Age=0",
    "SameSite=Lax",
  ].join("; ");

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: {
      "Set-Cookie": cookieOptions,
      "Content-Type": "application/json",
    },
  });
}
