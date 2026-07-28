import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

/**
 * Server-component guard for admin-only pages under /private.
 *
 * Applied per route segment rather than on app/private/layout.tsx, because
 * CREATE_ONLY accounts legitimately use /private/about and /private/posts.
 */
export async function requireAdminPage(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/");
}
