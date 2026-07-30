"use client";

import { useState } from "react";
import Link from "next/link";
import type { SavedOrderWithView } from "./useSavedOrders";
import ContactNote from "./ContactNote";
import styles from "./SavedOrders.module.css";

function formatSeats(labels: string[]): string {
  return labels.join(", ");
}

function minutesLeft(expiresAt: string): number {
  return Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 60000));
}

export default function SavedOrderCard({
  order,
  onForget,
}: {
  order: SavedOrderWithView;
  onForget: (orderId: string) => void;
}) {
  const { saved, view, isLoading } = order;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [override, setOverride] = useState<"cancelled" | "unknown" | null>(null);

  async function handleResume() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/tickets/orders/${saved.orderId}/resume`, { method: "POST" });
      const data = await res.json();
      if (res.status === 429) {
        setError("Te veel pogingen. Probeer het over enkele minuten opnieuw.");
      } else if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      } else if (data.state === "paid") {
        window.location.href = `/event/${saved.eventUuid}/ticket/${saved.dateUuid}/confirm?order=${saved.orderId}`;
        return;
      } else if (data.state === "cancelled") {
        setOverride("cancelled");
      } else {
        setOverride("unknown");
      }
    } catch {
      setError("Er ging iets mis. Probeer het opnieuw.");
    }
    setBusy(false);
  }

  if (isLoading && !view) {
    return <div className={styles.card}>Je bestelling wordt geladen…</div>;
  }
  if (!view) return null;

  const seats = formatSeats(view.seatLabels.length ? view.seatLabels : saved.seatLabels);
  const header = (
    <>
      <p className={styles.eyebrow}>{view.eventTitle}</p>
      {seats && <p className={styles.seats}>Plaats(en) {seats}</p>}
    </>
  );

  // A resume call that has already told us the outcome outranks the cached
  // query, which will not have refetched yet.
  const state = override === "cancelled" ? "cancelled" : view.state;
  const resumable = override === null && view.state === "pending" && view.resumable;

  if (state === "cancelled") {
    return (
      <div className={styles.card}>
        {header}
        <h2 className={styles.title}>Je reservering is verlopen</h2>
        <p className={styles.copy}>
          Je plaatsen zijn weer vrijgegeven. Kies opnieuw je plaatsen om verder te gaan.
        </p>
        <Link
          href={`/event/${saved.eventUuid}/ticket/${saved.dateUuid}`}
          className={styles.primaryBtn}
        >
          Kies opnieuw
        </Link>
        <ContactNote orderId={saved.orderId} />
        <button type="button" className={styles.dismissBtn} onClick={() => onForget(saved.orderId)}>
          Verbergen
        </button>
      </div>
    );
  }

  // `state` folds the "cancelled" override over view.state, so state === "paid"
  // already implies view.state === "paid" (override never produces "paid").
  // TypeScript can't see that through the separately-typed `state` variable,
  // so the second check here is purely for narrowing — it changes no behavior.
  if (state === "paid" && view.state === "paid") {
    if (!view.hasTickets) {
      return (
        <div className={styles.card}>
          {header}
          <h2 className={styles.title}>Er is iets misgelopen</h2>
          <p className={styles.copy}>
            Je betaling is gelukt, maar er ging iets mis bij het toewijzen van je plaatsen. We nemen
            binnen het uur contact met je op &mdash; betaal alsjeblieft niet opnieuw.
          </p>
          <ContactNote orderId={saved.orderId} />
        </div>
      );
    }
    return (
      <div className={styles.card}>
        {header}
        <h2 className={styles.title}>Je tickets zijn bevestigd</h2>
        <p className={styles.copy}>
          Check je mailbox &mdash; je tickets met QR-code zijn onderweg. Geen mail gekregen? Check
          je spamfolder of download ze hieronder.
        </p>
        <a href={`/api/tickets/orders/${saved.orderId}/pdf`} className={styles.primaryBtn}>
          Download je tickets (PDF)
        </a>
      </div>
    );
  }

  if (!resumable) {
    return (
      <div className={styles.card}>
        {header}
        <h2 className={styles.title}>Je betaling wordt nog gecontroleerd</h2>
        <p className={styles.copy}>
          Als je betaling gelukt is, ontvang je je tickets zo per mail.
        </p>
        <ContactNote orderId={saved.orderId} />
      </div>
    );
  }

  const left = minutesLeft(view.expiresAt);
  return (
    <div className={styles.card}>
      {header}
      <h2 className={styles.title}>Je hebt een lopende bestelling</h2>
      <p className={styles.copy}>
        Je plaatsen staan nog {left} minuut{left === 1 ? "" : "en"} voor je klaar. Rond je betaling
        af van &euro;{(view.totalAmount / 100).toFixed(2)}.
      </p>
      {error && <p className={styles.error}>{error}</p>}
      <button type="button" className={styles.primaryBtn} disabled={busy} onClick={handleResume}>
        {busy ? "Bezig…" : "Verder betalen"}
      </button>
    </div>
  );
}
