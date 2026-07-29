import { requireRolePage } from "@/lib/server/requireAdminPage";

export default async function ScanLayout({ children }: { children: React.ReactNode }) {
  await requireRolePage(["ADMIN", "SCANNER"]);
  return <>{children}</>;
}
