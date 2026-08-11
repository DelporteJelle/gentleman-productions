import { getCurrentUser } from "@/lib/auth";
import SeatMapClient from "./SeatMapClient";

export default async function SeatMapPage() {
  const user = await getCurrentUser();
  const isAdmin = user?.role === "ADMIN";
  return <SeatMapClient isAdmin={isAdmin} />;
}
