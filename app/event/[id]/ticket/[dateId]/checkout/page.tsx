"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Event, SeatTicket, isEvent } from "@/types";
import { usePosts } from "@/app/contexts/PostsContext";
import { splitTitleAccent } from "@/lib/text";
import CanvasBackground from "@/components/Background/CanvasBackground";
import {
  LoadingScreen,
  ErrorScreen,
  NotFoundScreen,
} from "@/components/StateScreens/StateScreens";
import styles from "./Checkout.module.css";

type Status = "loading" | "ready" | "notFound" | "error";

function formatNL(d: Date): string {
  return d.toLocaleDateString("nl-BE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function CheckoutContent() {
  const { id, dateId } = useParams();
  const searchParams = useSearchParams();
  const { fetchPostById } = usePosts();

  const ticketIds = useMemo(
    () => searchParams.get("tickets")?.split(",").filter(Boolean) || [],
    [searchParams],
  );

  const [event, setEvent] = useState<Event | null>(null);
  const [seats, setSeats] = useState<SeatTicket[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (ticketIds.length === 0) {
      setStatus("notFound");
      return;
    }
    setStatus("loading");
    setEvent(null);
    setSeats([]);
    setErrorMessage(undefined);

    const run = async () => {
      try {
        const [fetched, seatsRes] = await Promise.all([
          fetchPostById(id as string),
          fetch(`/api/tickets/seats?date_uuid=${dateId}`),
        ]);
        if (cancelled) return;
        if (!fetched || !isEvent(fetched)) {
          setStatus("notFound");
          return;
        }
        const dateEntry = fetched.dates.find((d) => d.uuid === dateId);
        if (!dateEntry) {
          setStatus("notFound");
          return;
        }
        if (!seatsRes.ok) {
          throw new Error("Failed to load seat details");
        }
        const seatData: SeatTicket[] = await seatsRes.json();
        if (cancelled) return;
        setEvent(fetched);
        setSeats(seatData);
        setStatus("ready");
      } catch (e) {
        if (cancelled) return;
        setErrorMessage(e instanceof Error ? e.message : String(e));
        setStatus("error");
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [id, dateId, fetchPostById, ticketIds]);

  if (status === "loading") return <LoadingScreen />;
  if (status === "error") return <ErrorScreen message={errorMessage} />;
  if (status === "notFound" || !event) return <NotFoundScreen />;

  const date = event.dates.find((d) => d.uuid === dateId);
  if (!date) return <NotFoundScreen />;

  const { main: titleMain, accent: titleAccent } = splitTitleAccent(event.title);
  const dateLabel = formatNL(new Date(date.start_time));
  const pricePerSeat = date.price ?? 0;
  const total = pricePerSeat * ticketIds.length;

  const chosenSeats = seats
    .filter((t) => t.id !== null && ticketIds.includes(t.id))
    .sort((a, b) =>
      a.seat.row === b.seat.row
        ? a.seat.seat_number - b.seat.seat_number
        : a.seat.row.localeCompare(b.seat.row),
    );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError("");
    try {
      const res = await fetch("/api/tickets/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventUuid: id, dateUuid: dateId, ticketIds, name, email }),
      });
      const data = await res.json();
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        setSubmitError(data.error || "Something went wrong. Please try again.");
        setSubmitting(false);
      }
    } catch {
      setSubmitError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.canvasLayer}>
        <CanvasBackground />
      </div>

      <section className={styles.hero} aria-label="Checkout">
        <div className={styles.heroSide} aria-hidden="true">
          <span className={styles.heroSideLine}></span>
          SECURE CHECKOUT · GENTLEMAN PRODUCTIONS
          <span className={styles.heroSideLine}></span>
        </div>

        <Link href={`/event/${id}/ticket/${dateId}`} className={styles.backLink}>
          &larr; Back to seats
        </Link>

        <div className={styles.heroContent}>
          <p className={styles.eyebrow}>Confirm your order</p>
          <h1 className={styles.title}>
            {titleMain}
            {titleAccent && (
              <>
                {" "}
                <span className={styles.titleAccent}>{titleAccent}</span>
              </>
            )}
          </h1>
          <div className={styles.dateRow}>
            <span className={styles.dateChevron}>&#9656;</span>
            <span className={styles.dateMain}>{dateLabel}</span>
          </div>
        </div>
      </section>

      <div className={styles.contentWrap}>
        <div className={styles.card}>
          <div className={styles.cardTitle}>{event.title}</div>
          <div className={styles.cardMeta}>{dateLabel}</div>

          <div className={styles.seatChips}>
            {chosenSeats.map((t) => (
              <span key={t.id} className={styles.seatChip}>
                {t.seat.row}
                {t.seat.seat_number}
              </span>
            ))}
          </div>

          <div className={styles.totalRow}>
            <span className={styles.totalLabel}>
              {ticketIds.length} ticket{ticketIds.length !== 1 ? "s" : ""} &times; &euro;
              {pricePerSeat.toFixed(2)}
            </span>
            <span className={styles.totalValue}>&euro;{total.toFixed(2)}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <input
            type="text"
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className={styles.input}
          />
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className={styles.input}
          />
          {submitError && <p className={styles.error}>{submitError}</p>}
          <button type="submit" disabled={submitting} className={styles.payBtn}>
            {submitting ? "Redirecting to payment..." : `Pay €${total.toFixed(2)}`}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <CheckoutContent />
    </Suspense>
  );
}
