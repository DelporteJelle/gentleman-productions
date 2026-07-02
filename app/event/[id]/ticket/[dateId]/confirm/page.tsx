"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import styles from "./Confirm.module.css";

type Order = {
  status: string;
  [key: string]: unknown;
};

function ConfirmContent() {
  const { id } = useParams();
  const searchParams = useSearchParams();
  const orderId = searchParams.get("order");
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) return;
    let attempts = 0;
    const interval = setInterval(async () => {
      const res = await fetch(`/api/tickets/orders/${orderId}`);
      const data = await res.json();
      attempts++;
      if (data.status !== "pending" || attempts >= 10) {
        setOrder(data);
        setLoading(false);
        clearInterval(interval);
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [orderId]);

  if (loading) {
    return (
      <main className={styles.page}>
        <p className={styles.status}>Confirming your payment...</p>
      </main>
    );
  }

  const paid = order?.status === "paid";

  return (
    <main className={styles.page}>
      <p className={styles.eyebrow}>Gentleman Productions</p>
      {paid ? (
        <>
          <h1 className={styles.title}>You&rsquo;re in!</h1>
          <p className={styles.copy}>
            Your tickets are confirmed. Check your email — a ticket with your QR code is on its
            way.
          </p>
        </>
      ) : (
        <>
          <h1 className={styles.title}>Payment not completed</h1>
          <p className={styles.copy}>
            Your seats have been released. You can go back and try again.
          </p>
          <Link href={`/event/${id}`} className={styles.backLink}>
            &larr; Back to event
          </Link>
        </>
      )}
    </main>
  );
}

export default function ConfirmPage() {
  return (
    <Suspense
      fallback={
        <main className={styles.page}>
          <p className={styles.status}>Loading...</p>
        </main>
      }
    >
      <ConfirmContent />
    </Suspense>
  );
}
