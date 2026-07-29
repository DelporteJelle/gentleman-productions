import { requireRolePage } from "@/lib/server/requireAdminPage";

export default async function AboutLayout({ children }: { children: React.ReactNode }) {
  await requireRolePage(["ADMIN", "CREATE_ONLY"]);
  return <>{children}</>;
}
