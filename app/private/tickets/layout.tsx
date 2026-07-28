import { requireAdminPage } from "@/lib/server/requireAdminPage";

export default async function TicketsLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  return <>{children}</>;
}
