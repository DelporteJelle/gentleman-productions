import { getCurrentUser } from "@/lib/auth";
import TicketDatesClient from "./TicketDatesClient";

export default async function TicketsPage() {
  const user = await getCurrentUser();
  const isAdmin = user?.role === "ADMIN";
  return <TicketDatesClient isAdmin={isAdmin} />;
}
