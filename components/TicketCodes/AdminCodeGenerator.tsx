"use client";

import { useState } from "react";
import type { CodeKind } from "@/lib/ticketCodes";
import styles from "./TicketCodes.module.css";

export default function AdminCodeGenerator({ eventUuid }: { eventUuid: string }) {
  const [kind, setKind] = useState<CodeKind>("wheelchair");
  const [label, setLabel] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState<string[]>([]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/tickets/admin/codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // A wheelchair code unlocks one place, so the server forces this to 1
        // regardless of what is sent.
        body: JSON.stringify({ eventUuid, kind, label, quantity: kind === "wheelchair" ? 1 : quantity }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Kon de codes niet aanmaken. Probeer opnieuw.");
        return;
      }
      setGenerated((data.codes as { code: string }[]).map((c) => c.code));
      setLabel("");
    } catch {
      setError("Kon de codes niet aanmaken. Probeer opnieuw.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.panel}>
      <h3 className={styles.adminTitle}>Codes aanmaken</h3>
      <form onSubmit={submit} className={styles.adminForm}>
        <select
          className={styles.input}
          value={kind}
          onChange={(e) => setKind(e.target.value as CodeKind)}
          aria-label="Codetype"
        >
          <option value="wheelchair">Rolstoelplaats</option>
          <option value="free_ticket">Gratis ticket</option>
        </select>
        <input
          type="text"
          className={styles.input}
          placeholder="Voor wie? (bv. Jan Peeters)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          required
        />
        {kind === "free_ticket" && (
          <input
            type="number"
            className={styles.qtyInput}
            min={1}
            max={50}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            aria-label="Aantal"
          />
        )}
        <button type="submit" className={styles.applyBtn} disabled={busy || label.trim().length === 0}>
          {busy ? "Bezig…" : "Aanmaken"}
        </button>
      </form>

      {error && <p className={styles.error}>{error}</p>}

      {generated.length > 0 && (
        <div className={styles.generated}>
          <p className={styles.generatedHint}>
            Kopieer deze codes nu — je vindt ze later ook in het adminportaal.
          </p>
          <ul className={styles.generatedList}>
            {generated.map((code) => (
              <li key={code} className={styles.generatedCode}>
                <code>{code}</code>
                <button
                  type="button"
                  className={styles.copyBtn}
                  onClick={() => navigator.clipboard?.writeText(code)}
                >
                  Kopieer
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
