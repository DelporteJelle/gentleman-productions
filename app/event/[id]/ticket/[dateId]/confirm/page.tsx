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
        <p className={styles.status}>Je betaling wordt bevestigd...</p>
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
        <h1 className={styles.title}>Er is iets misgelopen</h1>
        <p className={styles.copy}>
          Je betaling is gelukt, maar er ging iets mis bij het toewijzen van je plaatsen. We nemen
          binnen het uur contact met je op &mdash; betaal alsjeblieft niet opnieuw.
        </p>
        <Link href={`/event/${id}`} className={styles.backLink}>
          &larr; Terug naar het evenement
        </Link>
      </main>
    );
  }

  if (status === "paid") {
    return (
      <main className={styles.page}>
        <p className={styles.eyebrow}>Gentleman Productions</p>
        <h1 className={styles.title}>Je bent binnen!</h1>
        <p className={styles.copy}>
          Je tickets zijn bevestigd. Check je mailbox &mdash; je tickets met QR-code zijn onderweg.
          Dit kan een minuutje duren.
        </p>
      </main>
    );
  }

  if (status === "cancelled") {
    return (
      <main className={styles.page}>
        <p className={styles.eyebrow}>Gentleman Productions</p>
        <h1 className={styles.title}>Betaling niet voltooid</h1>
        <p className={styles.copy}>Je plaatsen zijn weer vrijgegeven. Je kan opnieuw proberen.</p>
        <Link href={`/event/${id}`} className={styles.backLink}>
          &larr; Terug naar het evenement
        </Link>
      </main>
    );
  }

  // Still pending: the payment may well have succeeded and simply not been
  // confirmed yet. Never claim the seats were released here.
  return (
    <main className={styles.page}>
      <p className={styles.eyebrow}>Gentleman Productions</p>
      <h1 className={styles.title}>Nog even geduld</h1>
      <p className={styles.copy}>
        Je betaling wordt nog bevestigd. Als deze gelukt is, ontvang je je tickets zo per mail
        &mdash; je hoeft niet opnieuw te betalen. Neem contact met ons op als er binnen het uur
        niets binnenkomt.
      </p>
      <Link href={`/event/${id}`} className={styles.backLink}>
        &larr; Terug naar het evenement
      </Link>
    </main>
  );
}

export default function ConfirmPage() {
  return (
    <Suspense
      fallback={
        <main className={styles.page}>
          <p className={styles.status}>Laden...</p>
        </main>
      }
    >
      <ConfirmContent />
    </Suspense>
  );
}
