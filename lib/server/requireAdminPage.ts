import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

/**
 * Server-component guard for role-restricted pages under /private.
 *
 * Applied per route segment rather than on app/private/layout.tsx, because
 * different roles legitimately reach different subtrees (e.g. CREATE_ONLY
 * accounts use /private/about and /private/posts; SCANNER accounts use
 * /private/scan).
 */
export async function requireRolePage(allowedRoles: string[]): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!allowedRoles.includes(user.role)) redirect("/");
}

/** Convenience wrapper for the common admin-only case. */
export async function requireAdminPage(): Promise<void> {
  return requireRolePage(["ADMIN"]);
}
