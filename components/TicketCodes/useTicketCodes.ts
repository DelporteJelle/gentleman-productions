"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { normalizeCode } from "@/lib/ticketCodes";
import { readCodes, writeCodes, clearCodes, type AppliedCode } from "@/lib/codeStore";

const storage = () => (typeof window === "undefined" ? undefined : window.sessionStorage);

/**
 * Owns the codes a customer has applied to this performance.
 *
 * Validation here is advisory — it decides what the UI unlocks and what the
 * price preview shows. `POST /api/tickets/checkout` re-reads and claims every
 * code server-side, so nothing this hook believes can move money.
 */
export function useTicketCodes(eventUuid: string | undefined, dateUuid: string) {
  const [applied, setApplied] = useState<AppliedCode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setApplied(readCodes(storage(), dateUuid));
  }, [dateUuid]);

  const persist = useCallback(
    (next: AppliedCode[]) => {
      setApplied(next);
      writeCodes(storage(), dateUuid, next);
    },
    [dateUuid],
  );

  const apply = useCallback(
    async (raw: string): Promise<boolean> => {
      setError(null);
      const code = normalizeCode(raw);
      if (!code) {
        setError("Deze code is niet geldig.");
        return false;
      }
      if (applied.some((a) => a.code === code)) {
        setError("Deze code is al toegevoegd.");
        return false;
      }
      if (applied.length >= 10) {
        setError("Je kan hoogstens 10 codes gebruiken.");
        return false;
      }
      if (!eventUuid) return false;

      setBusy(true);
      try {
        const res = await fetch("/api/tickets/codes/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventUuid, code }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error ?? "Deze code is niet geldig.");
          return false;
        }
        persist([...applied, { code, kind: data.kind }]);
        return true;
      } catch {
        setError("Kon de code niet controleren. Probeer opnieuw.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [applied, eventUuid, persist],
  );

  const remove = useCallback(
    (code: string) => {
      setError(null);
      persist(applied.filter((a) => a.code !== code));
    },
    [applied, persist],
  );

  const clear = useCallback(() => {
    setApplied([]);
    clearCodes(storage(), dateUuid);
  }, [dateUuid]);

  const wheelchairCount = useMemo(
    () => applied.filter((a) => a.kind === "wheelchair").length,
    [applied],
  );
  const freeCount = useMemo(
    () => applied.filter((a) => a.kind === "free_ticket").length,
    [applied],
  );

  return { applied, error, busy, apply, remove, clear, wheelchairCount, freeCount };
}
