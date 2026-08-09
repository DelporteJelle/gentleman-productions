"use client";

import { useState } from "react";
import type { AppliedCode } from "@/lib/codeStore";
import styles from "./TicketCodes.module.css";

export default function CodeEntryPanel({
  applied,
  error,
  busy,
  onApply,
  onRemove,
}: {
  applied: AppliedCode[];
  error: string | null;
  busy: boolean;
  onApply: (raw: string) => Promise<boolean>;
  onRemove: (code: string) => void;
}) {
  const [value, setValue] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || value.trim().length === 0) return;
    if (await onApply(value)) setValue("");
  }

  return (
    <div className={styles.panel}>
      <h3 className={styles.entryTitle}>Codes</h3>
      <p className={styles.entryHint}>
        Heb je een code gekregen? Geef ze hier in.
      </p>

      <form onSubmit={submit} className={styles.form}>
        <input
          type="text"
          className={styles.input}
          placeholder="GP-XXXXX-XXXXX"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          aria-label="Code"
        />
        <button type="submit" className={styles.applyBtn} disabled={busy || value.trim().length === 0}>
          {busy ? "Bezig…" : "Toepassen"}
        </button>
      </form>

      {error && <p className={styles.error}>{error}</p>}

      {applied.length > 0 && (
        <ul className={styles.chips}>
          {applied.map((a) => (
            <li key={a.code} className={styles.chip}>
              <span className={styles.chipKind}>
                {a.kind === "wheelchair" ? "Rolstoel" : "Gratis ticket"}
              </span>
              <span className={styles.chipCode}>{a.code}</span>
              <button
                type="button"
                className={styles.chipRemove}
                onClick={() => onRemove(a.code)}
                aria-label={`Verwijder code ${a.code}`}
              >
                &times;
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
