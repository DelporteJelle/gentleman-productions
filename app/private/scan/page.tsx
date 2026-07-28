"use client";

import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import styles from "./Scan.module.css";

interface ScanResult {
  result: "valid" | "already_scanned" | "wrong_date" | "invalid";
  message: string;
  seat?: string;
  event?: string;
  scanned_at?: string;
  ticket_date?: string | null;
}

interface Performance {
  event_uuid: string;
  date_uuid: string;
  title: string;
  start_time: string | null;
}

const STORAGE_KEY = "gp.scanner.dateUuid";

function formatPerformance(p: Performance): string {
  if (!p.start_time) return `${p.title} — date unknown`;
  const d = new Date(p.start_time);
  if (Number.isNaN(d.getTime())) return `${p.title} — date unknown`;
  return `${p.title} — ${d.toLocaleString("en-GB", {
    weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  })}`;
}

export default function ScanPage() {
  const [performances, setPerformances] = useState<Performance[]>([]);
  const [dateUuid, setDateUuid] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const processingRef = useRef(false);
  // Read at decode time so changing the performance does not need a restart.
  const dateUuidRef = useRef("");

  useEffect(() => {
    dateUuidRef.current = dateUuid;
    if (dateUuid) localStorage.setItem(STORAGE_KEY, dateUuid);
  }, [dateUuid]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/tickets/summary")
      .then((res) => {
        if (!res.ok) throw new Error("Could not load performances");
        return res.json();
      })
      .then((data: { dates: Performance[] }) => {
        if (cancelled) return;
        const sorted = [...(data.dates ?? [])].sort((a, b) =>
          (a.start_time ?? "").localeCompare(b.start_time ?? ""),
        );
        setPerformances(sorted);
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored && sorted.some((p) => p.date_uuid === stored)) setDateUuid(stored);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load the performance list. Reload the page.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const hasDate = Boolean(dateUuid);

  useEffect(() => {
    if (!hasDate) return;

    let cancelled = false;
    const scanner = new Html5Qrcode("qr-reader");
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
          if (processingRef.current) return;
          processingRef.current = true;

          try {
            const res = await fetch("/api/tickets/scan", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token: decodedText, dateUuid: dateUuidRef.current }),
            });
            const data = (await res.json()) as ScanResult;
            setResult(data);
          } catch {
            setResult({ result: "invalid", message: "Scanner offline — check the connection" });
          }
          setScanning(false);

          setTimeout(() => {
            setResult(null);
            setScanning(true);
            processingRef.current = false;
          }, 3000);
        },
        () => {},
      )
      .then(() => {
        // The effect was torn down while start() was still in flight
        // (StrictMode double-mount, or the operator navigated away).
        if (cancelled) {
          scanner.stop().catch(() => {});
          return;
        }
        setScanning(true);
      })
      .catch(() => {
        if (!cancelled) setError("Camera access denied. Please allow camera permissions and reload.");
      });

    return () => {
      cancelled = true;
      scannerRef.current = null;
      // stop() throws synchronously if start() has not yet reached SCANNING,
      // so a bare .catch() is not enough.
      try {
        scanner.stop().catch(() => {});
      } catch {
        /* never started; the cancelled flag handles it when start() settles */
      }
    };
  }, [hasDate]);

  const bgClass = !result
    ? styles.idle
    : result.result === "valid"
      ? styles.valid
      : result.result === "already_scanned"
        ? styles.alreadyScanned
        : result.result === "wrong_date"
          ? styles.wrongDate
          : styles.invalid;

  const icon =
    result?.result === "valid" ? "✅"
    : result?.result === "already_scanned" ? "⚠️"
    : result?.result === "wrong_date" ? "📅"
    : "❌";

  return (
    <main className={`${styles.page} ${bgClass}`}>
      <p className={styles.eyebrow}>Gentleman Productions</p>
      <h1 className={styles.title}>Door Scanner</h1>

      {error && <p className={styles.error}>{error}</p>}

      {!result && (
        <div className={styles.picker}>
          <label htmlFor="performance" className={styles.pickerLabel}>
            Performance being scanned
          </label>
          <select
            id="performance"
            className={styles.select}
            value={dateUuid}
            onChange={(e) => setDateUuid(e.target.value)}
          >
            {!dateUuid && <option value="">Select a performance…</option>}
            {performances.map((p) => (
              <option key={p.date_uuid} value={p.date_uuid}>
                {formatPerformance(p)}
              </option>
            ))}
          </select>
        </div>
      )}

      <div id="qr-reader" className={`${styles.reader} ${result || !hasDate ? styles.readerHidden : ""}`} />

      {!hasDate && !error && (
        <p className={styles.hint}>Choose the performance above to start scanning.</p>
      )}
      {hasDate && scanning && !result && <p className={styles.hint}>Point camera at QR code</p>}

      {result && (
        <div className={styles.result}>
          <div className={styles.resultIcon}>{icon}</div>
          <h2 className={styles.resultMessage}>{result.message}</h2>
          {result.seat && <p className={styles.resultSeat}>Seat {result.seat}</p>}
          {result.result === "wrong_date" && (
            <p className={styles.resultDetail}>
              This ticket is for{" "}
              {result.ticket_date
                ? new Date(result.ticket_date).toLocaleString("en-GB", {
                    weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
                  })
                : "another performance"}
              {result.event ? ` (${result.event})` : ""}. Send them to that performance — this ticket
              has not been used up.
            </p>
          )}
          {result.result === "already_scanned" && result.scanned_at && (
            <p className={styles.resultScannedAt}>
              Scanned at {new Date(result.scanned_at).toLocaleTimeString()}
            </p>
          )}
          <p className={styles.resultResuming}>Resuming in 3 seconds...</p>
        </div>
      )}
    </main>
  );
}
