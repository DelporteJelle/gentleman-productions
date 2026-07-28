import { requireAdminPage } from "@/lib/server/requireAdminPage";

export default async function ScanLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  return <>{children}</>;
}
