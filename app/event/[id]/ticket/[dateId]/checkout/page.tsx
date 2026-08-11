"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Event, SeatTicket, isEvent } from "@/types";
import { usePosts } from "@/app/contexts/PostsContext";
import { splitTitleAccent } from "@/lib/text";
import { addOrder } from "@/lib/orderStore";
import { readCodes, clearCodes, type AppliedCode } from "@/lib/codeStore";
import { computeOrderTotalCents } from "@/lib/ticketCodes";
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
  const router = useRouter();
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
  const [codes, setCodes] = useState<AppliedCode[]>([]);
  const [codeNotice, setCodeNotice] = useState<string | null>(null);

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

  useEffect(() => {
    let cancelled = false;
    const stored = readCodes(window.sessionStorage, dateId as string);
    if (stored.length === 0 || !event) return;

    const run = async () => {
      const surviving: AppliedCode[] = [];
      for (const entry of stored) {
        try {
          const res = await fetch("/api/tickets/codes/validate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ eventUuid: event.uuid, code: entry.code }),
          });
          if (res.ok) surviving.push(entry);
        } catch {
          // Network trouble is not proof the code is bad. Keep it — checkout
          // re-checks server-side and is the only authority anyway.
          surviving.push(entry);
        }
      }
      if (cancelled) return;
      setCodes(surviving);
      if (surviving.length < stored.length) {
        setCodeNotice("Eén of meer codes zijn niet meer geldig en zijn verwijderd.");
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [dateId, event]);

  if (status === "loading") return <LoadingScreen />;
  if (status === "error") return <ErrorScreen message={errorMessage} />;
  if (status === "notFound" || !event) return <NotFoundScreen />;

  const date = event.dates.find((d) => d.uuid === dateId);
  if (!date) return <NotFoundScreen />;

  const { main: titleMain, accent: titleAccent } = splitTitleAccent(event.title);
  const dateLabel = formatNL(new Date(date.start_time));
  const pricePerSeat = date.price ?? 0;
  const freeCount = codes.filter((c) => c.kind === "free_ticket").length;
  const totalCents = computeOrderTotalCents({
    seatCount: ticketIds.length,
    priceCents: Math.round(pricePerSeat * 100),
    freeCodeCount: freeCount,
  });
  const total = totalCents / 100;

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
        body: JSON.stringify({
          eventUuid: id,
          dateUuid: dateId,
          ticketIds,
          name,
          email,
          codes: codes.map((c) => c.code),
        }),
      });
      const data = await res.json();
      // No payment step exists for a fully discounted order — the server has
      // already sold the seats and sent the tickets.
      if (data.free && data.orderId) {
        addOrder(typeof window === "undefined" ? undefined : window.localStorage, {
          orderId: data.orderId,
          eventUuid: id as string,
          dateUuid: dateId as string,
          eventTitle: event!.title,
          startTime: date!.start_time,
          seatLabels: chosenSeats.map((t) => `${t.seat.row}${t.seat.seat_number}`),
          email,
          savedAt: new Date().toISOString(),
          lastKnownStatus: "pending",
          statusChangedAt: new Date().toISOString(),
        });
        clearCodes(window.sessionStorage, dateId as string);
        router.push(`/event/${id}/ticket/${dateId}/confirm?order=${data.orderId}`);
        return;
      }
      if (data.checkoutUrl) {
        // Written BEFORE the redirect, deliberately. This is the last moment
        // the browser holds the order id, the seats and the email together —
        // and if the return trip from Mollie is lost, this entry is the only
        // way the customer ever finds their payment again.
        if (data.orderId) {
          addOrder(typeof window === "undefined" ? undefined : window.localStorage, {
            orderId: data.orderId,
            eventUuid: id as string,
            dateUuid: dateId as string,
            eventTitle: event!.title,
            startTime: date!.start_time,
            seatLabels: chosenSeats.map((t) => `${t.seat.row}${t.seat.seat_number}`),
            email,
            savedAt: new Date().toISOString(),
            lastKnownStatus: "pending",
            statusChangedAt: new Date().toISOString(),
          });
        }
        clearCodes(window.sessionStorage, dateId as string);
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

          {freeCount > 0 && (
            <div className={styles.totalRow}>
              <span className={styles.totalLabel}>
                {freeCount} gratis ticket{freeCount !== 1 ? "s" : ""}
              </span>
              <span className={styles.totalValue}>
                &minus;&euro;{(freeCount * pricePerSeat).toFixed(2)}
              </span>
            </div>
          )}
          {codeNotice && <p className={styles.error}>{codeNotice}</p>}
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
            {submitting
              ? "Redirecting to payment..."
              : total === 0
                ? "Bevestig gratis tickets"
                : `Pay €${total.toFixed(2)}`}
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
