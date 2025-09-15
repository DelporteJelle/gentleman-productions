import { cookies } from "next/headers";
import jwt from "jsonwebtoken";
import { redirect } from "next/navigation";

export default function EditLayout({ children }: { children: React.ReactNode }) {
  // Check for JWT token in cookies
  const token = cookies().get("token")?.value;
  try {
    jwt.verify(token || "", process.env.JWT_SECRET!);
  } catch {
    redirect("/login");
  }
  return <>{children}</>;
}
