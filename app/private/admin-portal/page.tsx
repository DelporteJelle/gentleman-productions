"use client";

import { useEffect, useState } from "react";
import { Stack } from "@mantine/core";
import { LoadingScreen, ErrorScreen } from "@/components/StateScreens/StateScreens";
import styles from "./AdminPortal.module.css";

interface DateSummary {
  event_uuid: string;
  date_uuid: string;
  title: string;
  start_time: string | null;
  sold: number;
  held: number;
  available: number;
  wheelchair: number;
  blocked: number;
  total: number;
}

interface OrderSummary {
  id: string;
  customer_name: string;
  customer_email: string;
  total_amount: number;
  status: string;
  created_at: string;
  event_uuid: string;
  event_title: string;
}

interface ReservedSeat {
  ticket_id: string;
  seat_label: string;
  event_title: string;
  start_time: string | null;
  reserved_at: string;
}

interface SummaryResponse {
  dates: DateSummary[];
  orders: OrderSummary[];
  reservedSeats: ReservedSeat[];
}

function formatStartTime(startTime: string | null): string {
  if (!startTime) return "Unknown date";
  const date = new Date(startTime);
  if (isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function badgeClass(status: string): string {
  switch (status) {
    case "paid":
      return styles.badgePaid;
    case "cancelled":
      return styles.badgeCancelled;
    default:
      return styles.badgePending;
  }
}

export default function TicketsSummaryPage() {
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [releasing, setReleasing] = useState<string | null>(null);
  const [rechecking, setRechecking] = useState<string | null>(null);

  async function handleRecheck(order: OrderSummary) {
    setRechecking(order.id);
    try {
      const res = await fetch(`/api/tickets/admin/orders/${order.id}/recheck`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        window.alert(body.error ?? "Could not recheck this order.");
        return;
      }
      setData((prev) =>
        prev && {
          ...prev,
          orders: prev.orders.map((o) => (o.id === order.id ? { ...o, status: body.status ?? o.status } : o)),
        },
      );
      if (body.status === "pending") {
        window.alert("Mollie still shows this payment as pending — nothing to update yet.");
      }
    } finally {
      setRechecking(null);
    }
  }

  async function handleRelease(seat: ReservedSeat) {
    const confirmed = window.confirm(
      `Releasing seat ${seat.seat_label} will make it available again. Its QR code will stop working immediately if you've already shared it. Continue?`
    );
    if (!confirmed) return;

    setReleasing(seat.ticket_id);
    try {
      const res = await fetch(`/api/tickets/admin/reserved/${seat.ticket_id}/release`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        window.alert(body.error ?? "Could not release this seat.");
        return;
      }
      setData((prev) => prev && { ...prev, reservedSeats: prev.reservedSeats.filter((s) => s.ticket_id !== seat.ticket_id) });
    } finally {
      setReleasing(null);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(false);
      try {
        const res = await fetch("/api/tickets/summary");
        if (!res.ok) throw new Error("Failed to load summary");
        const json = (await res.json()) as SummaryResponse;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <LoadingScreen />;
  if (error || !data) return <ErrorScreen message="Could not load the ticket summary." />;

  return (
    <Stack align="center" p="lg">
      <h1>Ticket Summary</h1>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Dates</h2>
        {data.dates.length === 0 ? (
          <p className={styles.empty}>No ticketed dates yet.</p>
        ) : (
          <div className={styles.dateList}>
            {data.dates.map((d) => (
              <div key={`${d.event_uuid}-${d.date_uuid}`} className={styles.dateRow}>
                <span>
                  <span className={styles.dateRowTitle}>{d.title}</span>
                  {" · "}
                  <span className={styles.dateRowMeta}>{formatStartTime(d.start_time)}</span>
                </span>
                <span className={styles.dateRowStats}>
                  {d.sold} sold · {d.available} available · {d.wheelchair} wheelchair · {d.total} total
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Recent Orders</h2>
        {data.orders.length === 0 ? (
          <p className={styles.empty}>No orders yet.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Event</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Placed</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.orders.map((o) => (
                  <tr key={o.id}>
                    <td>
                      {o.customer_name}
                      <br />
                      <span className={styles.dateRowMeta}>{o.customer_email}</span>
                    </td>
                    <td>{o.event_title}</td>
                    <td>€{(o.total_amount / 100).toFixed(2)}</td>
                    <td>
                      <span className={`${styles.badge} ${badgeClass(o.status)}`}>
                        {o.status}
                      </span>
                    </td>
                    <td>{new Date(o.created_at).toLocaleString("en-GB")}</td>
                    <td>
                      {o.status === "pending" && (
                        <button
                          type="button"
                          className={styles.actionBtn}
                          disabled={rechecking === o.id}
                          onClick={() => handleRecheck(o)}
                        >
                          {rechecking === o.id ? "Checking…" : "Recheck payment"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Reserved for giveaway</h2>
        {data.reservedSeats.length === 0 ? (
          <p className={styles.empty}>No seats currently reserved for giveaway.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Seat</th>
                  <th>Reserved</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.reservedSeats.map((s) => (
                  <tr key={s.ticket_id}>
                    <td>{s.event_title}</td>
                    <td>{s.seat_label}</td>
                    <td>{new Date(s.reserved_at).toLocaleString("en-GB")}</td>
                    <td>
                      <a
                        className={styles.actionBtn}
                        href={`/api/tickets/admin/reserved/${s.ticket_id}/pdf`}
                      >
                        Download QR
                      </a>
                      <button
                        type="button"
                        className={styles.releaseBtn}
                        disabled={releasing === s.ticket_id}
                        onClick={() => handleRelease(s)}
                      >
                        {releasing === s.ticket_id ? "Releasing…" : "Release"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </Stack>
  );
}
