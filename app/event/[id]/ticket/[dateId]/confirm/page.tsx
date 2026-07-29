"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import styles from "./Confirm.module.css";

function ConfirmContent() {
  const { id } = useParams();
  const searchParams = useSearchParams();
  const orderId = searchParams.get("order");
  const [status, setStatus] = useState<string | null>(null);
  const [hasTickets, setHasTickets] = useState(true);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      if (cancelled) return;
      attempts++;
      try {
        const res = await fetch(`/api/tickets/orders/${orderId}`);
        const data = (await res.json()) as { status?: string; has_tickets?: boolean };
        if (cancelled) return;
        if (data.status && data.status !== "pending") {
          // Default to true so an older/partial response never downgrades a
          // genuine success into the "we lost your seats" message.
          setHasTickets(data.has_tickets !== false);
          setStatus(data.status);
          return;
        }
      } catch {
        // Network hiccup — keep polling until the attempt budget runs out.
      }
      if (cancelled) return;
      if (attempts >= 20) {
        setTimedOut(true);
        return;
      }
      timer = setTimeout(poll, 1500);
    };

    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [orderId]);

  if (!status && !timedOut) {
    return (
      <main className={styles.page}>
        <p className={styles.status}>Confirming your payment...</p>
      </main>
    );
  }

  // Paid, but fulfilment could not assign any seat (they lapsed and were taken
  // by a later order). Saying "You're in!" here would be a lie, and telling
  // them the seats were released would invite a second payment.
  if (status === "paid" && !hasTickets) {
    return (
      <main className={styles.page}>
        <p className={styles.eyebrow}>Gentleman Productions</p>
        <h1 className={styles.title}>We need to sort something out</h1>
        <p className={styles.copy}>
          Your payment went through, but we hit a problem assigning your seats. We&rsquo;ll contact
          you within the hour &mdash; please don&rsquo;t pay again.
        </p>
        <Link href={`/event/${id}`} className={styles.backLink}>
          &larr; Back to event
        </Link>
      </main>
    );
  }

  if (status === "paid") {
    return (
      <main className={styles.page}>
        <p className={styles.eyebrow}>Gentleman Productions</p>
        <h1 className={styles.title}>You&rsquo;re in!</h1>
        <p className={styles.copy}>
          Your tickets are confirmed. Check your email — a ticket with your QR code is on its way.
        </p>
      </main>
    );
  }

  if (status === "cancelled") {
    return (
      <main className={styles.page}>
        <p className={styles.eyebrow}>Gentleman Productions</p>
        <h1 className={styles.title}>Payment not completed</h1>
        <p className={styles.copy}>Your seats have been released. You can go back and try again.</p>
        <Link href={`/event/${id}`} className={styles.backLink}>
          &larr; Back to event
        </Link>
      </main>
    );
  }

  // Still pending: the payment may well have succeeded and simply not been
  // confirmed yet. Never claim the seats were released here.
  return (
    <main className={styles.page}>
      <p className={styles.eyebrow}>Gentleman Productions</p>
      <h1 className={styles.title}>Still confirming</h1>
      <p className={styles.copy}>
        Your payment is being confirmed. If it went through, your tickets will arrive by email
        shortly — you don&rsquo;t need to pay again. Contact us if nothing arrives within an hour.
      </p>
      <Link href={`/event/${id}`} className={styles.backLink}>
        &larr; Back to event
      </Link>
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
