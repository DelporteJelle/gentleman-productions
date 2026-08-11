"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
  disabled: number;
  total: number;
  tickets_open: boolean;
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

interface CodeRow {
  id: string;
  code: string;
  kind: "wheelchair" | "free_ticket";
  label: string;
  event_uuid: string;
  created_at: string;
  state: "unused" | "in_use" | "used" | "revoked";
  order_id: string | null;
}

const CODE_STATE_LABEL: Record<CodeRow["state"], string> = {
  unused: "ongebruikt",
  in_use: "in gebruik",
  used: "gebruikt",
  revoked: "ingetrokken",
};

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

function badgeClassForCode(state: CodeRow["state"]): string {
  switch (state) {
    case "used":
      return styles.badgePaid;
    case "revoked":
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
  const [codes, setCodes] = useState<CodeRow[]>([]);
  const [codesError, setCodesError] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

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

  async function handleRevoke(row: CodeRow) {
    const confirmed = window.confirm(
      `Code ${row.code} intrekken? Hij kan daarna niet meer gebruikt worden.`,
    );
    if (!confirmed) return;

    setRevoking(row.id);
    try {
      const res = await fetch(`/api/tickets/admin/codes/${row.id}/revoke`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        window.alert(body.error ?? "Kon de code niet intrekken.");
        return;
      }
      setCodes((prev) => prev.map((c) => (c.id === row.id ? { ...c, state: "revoked" } : c)));
    } finally {
      setRevoking(null);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(false);
      setCodesError(false);

      // allSettled so a codes-request rejection (network error, etc.) can
      // never propagate into the summary's try/catch below — a codes
      // failure must not blank the whole portal.
      const [summaryResult, codesResult] = await Promise.allSettled([
        fetch("/api/tickets/summary"),
        fetch("/api/tickets/admin/codes"),
      ]);

      try {
        if (summaryResult.status === "rejected") throw summaryResult.reason;
        const res = summaryResult.value;
        if (!res.ok) throw new Error("Failed to load summary");
        const json = (await res.json()) as SummaryResponse;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setError(true);
      }

      // A code-listing failure must not blank the whole portal — the
      // summary is the page's primary content and keeps rendering above.
      try {
        if (codesResult.status === "rejected") throw codesResult.reason;
        const codesRes = codesResult.value;
        if (!codesRes.ok) throw new Error(`Failed to load codes: ${codesRes.status}`);
        const json = (await codesRes.json()) as { codes: CodeRow[] };
        if (!cancelled) setCodes(json.codes);
      } catch (err) {
        console.error("Failed to load ticket codes:", err);
        if (!cancelled) setCodesError(true);
      }

      if (!cancelled) setLoading(false);
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
              <Link
                key={`${d.event_uuid}-${d.date_uuid}`}
                href={`/event/${d.event_uuid}/ticket/${d.date_uuid}`}
                className={styles.dateRow}
              >
                <span>
                  <span className={styles.dateRowTitle}>{d.title}</span>
                  {" · "}
                  <span className={styles.dateRowMeta}>
                    {formatStartTime(d.start_time)}
                    {d.tickets_open ? "" : " · gesloten"}
                  </span>
                </span>
                <span className={styles.dateRowStats}>
                  {d.sold} sold · {d.available} available · {d.wheelchair} wheelchair
                  {Number(d.disabled) > 0 ? ` · ${d.disabled} disabled` : ""} · {d.total} total
                </span>
              </Link>
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

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Codes</h2>
        {codesError ? (
          <p className={styles.empty}>Kon de codes niet laden.</p>
        ) : codes.length === 0 ? (
          <p className={styles.empty}>Nog geen codes aangemaakt.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Type</th>
                  <th>Voor</th>
                  <th>Status</th>
                  <th>Aangemaakt</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {codes.map((c) => (
                  <tr key={c.id}>
                    <td className={styles.codeCell}>{c.code}</td>
                    <td>{c.kind === "wheelchair" ? "Rolstoelplaats" : "Gratis ticket"}</td>
                    <td>{c.label}</td>
                    <td>
                      <span className={`${styles.badge} ${badgeClassForCode(c.state)}`}>
                        {CODE_STATE_LABEL[c.state]}
                      </span>
                    </td>
                    <td>{new Date(c.created_at).toLocaleString("en-GB")}</td>
                    <td>
                      {c.state === "unused" && (
                        <button
                          type="button"
                          className={styles.releaseBtn}
                          disabled={revoking === c.id}
                          onClick={() => handleRevoke(c)}
                        >
                          {revoking === c.id ? "Bezig…" : "Intrekken"}
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
    </Stack>
  );
}
