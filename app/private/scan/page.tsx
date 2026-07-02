"use client";

import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import styles from "./Scan.module.css";

interface ScanResult {
  result: "valid" | "already_scanned" | "invalid";
  message: string;
  seat?: string;
  event?: string;
  scanned_at?: string;
}

export default function ScanPage() {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const processingRef = useRef(false);

  useEffect(() => {
    const scanner = new Html5Qrcode("qr-reader");
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
          if (processingRef.current) return;
          processingRef.current = true;

          const res = await fetch("/api/tickets/scan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ticketId: decodedText }),
          });
          const data = (await res.json()) as ScanResult;
          setResult(data);
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
        setScanning(true);
      })
      .catch(() => {
        setError("Camera access denied. Please allow camera permissions and reload.");
      });

    return () => {
      scannerRef.current?.stop().catch(() => {});
    };
  }, []);

  const bgClass = !result
    ? styles.idle
    : result.result === "valid"
      ? styles.valid
      : result.result === "already_scanned"
        ? styles.alreadyScanned
        : styles.invalid;

  return (
    <main className={`${styles.page} ${bgClass}`}>
      <p className={styles.eyebrow}>Gentleman Productions</p>
      <h1 className={styles.title}>Door Scanner</h1>

      {error && <p className={styles.error}>{error}</p>}

      <div
        id="qr-reader"
        className={`${styles.reader} ${result ? styles.readerHidden : ""}`}
      />

      {scanning && !result && <p className={styles.hint}>Point camera at QR code</p>}

      {result && (
        <div className={styles.result}>
          <div className={styles.resultIcon}>
            {result.result === "valid" ? "✅" : result.result === "already_scanned" ? "⚠️" : "❌"}
          </div>
          <h2 className={styles.resultMessage}>{result.message}</h2>
          {result.seat && <p className={styles.resultSeat}>Seat {result.seat}</p>}
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
