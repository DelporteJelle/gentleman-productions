"use client";

import Link from "next/link";
import { useSavedOrders } from "@/components/SavedOrders/useSavedOrders";
import SavedOrderCard from "@/components/SavedOrders/SavedOrderCard";
import styles from "./MijnTickets.module.css";

export default function MijnTicketsPage() {
  const { orders, forget } = useSavedOrders();

  return (
    <main className={styles.page}>
      <p className={styles.eyebrow}>Gentleman Productions</p>
      <h1 className={styles.title}>Mijn tickets</h1>

      {orders.length === 0 ? (
        <>
          <p className={styles.copy}>
            We vinden geen bestellingen op dit toestel. Bestellingen worden lokaal bewaard, dus een
            bestelling van een andere browser of telefoon zie je hier niet.
          </p>
          <Link href="/" className={styles.backLink}>
            &larr; Terug naar de site
          </Link>
        </>
      ) : (
        <div className={styles.list}>
          {orders.map((order) => (
            <SavedOrderCard key={order.saved.orderId} order={order} onForget={forget} />
          ))}
        </div>
      )}
    </main>
  );
}
