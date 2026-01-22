import { cookies } from "next/headers";
import jwt from "jsonwebtoken";
import { redirect } from "next/navigation";

interface TokenPayload {
  id: string;
  username: string;
  role: string;
}

export default async function PrivateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Check for JWT token in cookies
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;

  if (!token) {
    redirect("/login");
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as TokenPayload;
    // Token is valid, user can access private routes
    // You can use decoded.role here for role-based access control
  } catch {
    redirect("/login");
  }

  return <>{children}</>;
}
