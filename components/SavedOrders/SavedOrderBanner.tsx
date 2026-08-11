"use client";

import { useState } from "react";
import { useSavedOrdersForDate } from "./useSavedOrders";
import SavedOrderCard from "./SavedOrderCard";
import styles from "./SavedOrders.module.css";

/**
 * Surfaces this browser's saved orders without hijacking navigation. A
 * visitor who just wants to browse is never redirected — the banner offers
 * the way back and they choose.
 */
export default function SavedOrderBanner({ dateUuid }: { dateUuid?: string }) {
  const { orders, forget } = useSavedOrdersForDate(dateUuid);
  const [dismissed, setDismissed] = useState(false);

  const visible = orders.filter((o) => o.view !== undefined);
  if (dismissed || visible.length === 0) return null;

  return (
    <section className={styles.bannerWrap} aria-label="Je bestellingen">
      {visible.map((order) => (
        <SavedOrderCard key={order.saved.orderId} order={order} onForget={forget} />
      ))}
      <button type="button" className={styles.dismissBtn} onClick={() => setDismissed(true)}>
        Sluiten
      </button>
    </section>
  );
}
