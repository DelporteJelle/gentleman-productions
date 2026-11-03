"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function PrivateTicketRedeem() {
  const router = useRouter();
  const [message, setMessage] = useState("Opening your private ticket link…");

  useEffect(() => {
    let cancelled = false;
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
    window.history.replaceState(null, "", window.location.pathname);

    if (!token) {
      setMessage("This private ticket link is incomplete. Please open the link you received again.");
      return;
    }

    fetch("/api/tickets/private-access/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "This private ticket link is invalid or has expired.");
        if (cancelled) return;
        router.replace(`/event/${encodeURIComponent(body.eventUuid)}/ticket/${encodeURIComponent(body.dateUuid)}`);
      })
      .catch((error: unknown) => {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "Could not open this private ticket link.");
      });

    return () => { cancelled = true; };
  }, [router]);

  return (
    <main style={{ minHeight: "70vh", display: "grid", placeItems: "center", padding: 24, textAlign: "center" }}>
      <p role="status">{message}</p>
    </main>
  );
}
