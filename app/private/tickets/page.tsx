"use client";

import { useEffect, useState } from "react";
import { Stack } from "@mantine/core";
import { LoadingScreen, ErrorScreen } from "@/components/StateScreens/StateScreens";
import styles from "./Tickets.module.css";

interface DateSummary {
  event_uuid: string;
  date_uuid: string;
  title: string;
  start_time: string | null;
  sold: number;
  held: number;
  available: number;
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

interface SummaryResponse {
  dates: DateSummary[];
  orders: OrderSummary[];
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
                  {d.sold} sold · {d.available} available · {d.total} total
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
