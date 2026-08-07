import { requireAdminPage } from "@/lib/server/requireAdminPage";

export default async function AdminPortalLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  return <>{children}</>;
}
