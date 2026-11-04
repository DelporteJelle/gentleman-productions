"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Group, NumberInput, Paper, Stack, Text, TextInput } from "@mantine/core";
import QRCode from "qrcode";

interface PrivateLink {
  id: string;
  active: boolean;
  expires_at: string | null;
  ticket_limit: number | null;
  allocated_tickets: number;
}

export default function PrivateTicketLinkManager({
  eventUuid,
  dateUuid,
  publicOpen,
  price,
}: {
  eventUuid: string;
  dateUuid: string;
  publicOpen: boolean;
  price?: number;
}) {
  const [link, setLink] = useState<PrivateLink | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [expiry, setExpiry] = useState("");
  const [ticketLimit, setTicketLimit] = useState<number | string>("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/tickets/admin/private-links?event_uuid=${encodeURIComponent(eventUuid)}&date_uuid=${encodeURIComponent(dateUuid)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load private link status.");
        return response.json();
      })
      .then((body) => {
        if (cancelled) return;
        setLink(body.link);
        if (body.link?.active) {
          if (body.link.ticket_limit !== null) setTicketLimit(body.link.ticket_limit);
          if (body.link.expires_at) {
            const local = new Date(body.link.expires_at);
            local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
            setExpiry(local.toISOString().slice(0, 16));
          }
        }
      })
      .catch(() => { if (!cancelled) setMessage("Could not load private link status."); });
    return () => { cancelled = true; };
  }, [eventUuid, dateUuid]);

  if (typeof price !== "number") return null;
  if (publicOpen && !link) return null;

  async function createLink() {
    if (link?.active && !window.confirm("Replacing this link will immediately disable the current URL. Continue?")) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/tickets/admin/private-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventUuid,
          dateUuid,
          expiresAt: expiry ? new Date(expiry).toISOString() : null,
          ticketLimit: ticketLimit === "" ? null : Number(ticketLimit),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not create private link.");
      setLink(body.link);
      setUrl(body.url);
      const qrData = await QRCode.toDataURL(body.url, { width: 360, margin: 2, errorCorrectionLevel: "M" });
      setQr(qrData);
      setMessage("Link created. Copy it or download the QR code now; replacing the link is required if it is lost.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create private link.");
    } finally {
      setBusy(false);
    }
  }

  async function revokeLink() {
    if (!link || !window.confirm("Revoke this private link? New buyers will no longer be able to use it.")) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/tickets/admin/private-links/${encodeURIComponent(link.id)}`, { method: "DELETE" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not revoke private link.");
      setLink(body.link);
      setUrl(null);
      setQr(null);
      setMessage("Link revoked. Existing payment sessions can still finish.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not revoke private link.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Paper withBorder p="sm" mt="sm" radius="md">
      <Stack gap="xs">
        <Text fw={600}>Private ticket link</Text>
        {link?.active ? (
          <Text size="sm">
            Active{link.expires_at ? ` until ${new Date(link.expires_at).toLocaleString("nl-BE")}` : " until revoked"}
            {link.ticket_limit === null
              ? ` · ${link.allocated_tickets} tickets reserved or sold · no limit`
              : ` · ${link.allocated_tickets} / ${link.ticket_limit} tickets reserved or sold`}
          </Text>
        ) : (
          <Text size="sm">No active private link. Buyers will need the invite URL; no account is required.</Text>
        )}

        {publicOpen && <Text size="sm">Public sales are open for this date.</Text>}

        {!publicOpen && <Group align="end" grow>
          <TextInput
            label="Optional expiry (your local time)"
            type="datetime-local"
            value={expiry}
            onChange={(event) => setExpiry(event.currentTarget.value)}
          />
          <NumberInput
            label="Optional ticket limit"
            placeholder="Unlimited"
            min={1}
            step={1}
            allowDecimal={false}
            value={ticketLimit}
            onChange={setTicketLimit}
          />
        </Group>}

        <Group>
          {!publicOpen && <Button size="xs" loading={busy} onClick={createLink}>
            {link?.active ? "Replace link and QR" : "Create link and QR"}
          </Button>}
          {link?.active && (
            <Button size="xs" color="red" variant="light" loading={busy} onClick={revokeLink}>
              Revoke
            </Button>
          )}
        </Group>

        {url && qr && (
          <Group align="center" wrap="nowrap">
            {/* QR image contains the invite token; it is shown only after creation. */}
            <img src={qr} alt="QR code for the private ticket link" width={144} height={144} />
            <Stack gap="xs">
              <Text size="sm" style={{ overflowWrap: "anywhere" }}>{url}</Text>
              <Group>
                <Button size="xs" variant="default" onClick={() => navigator.clipboard.writeText(url)}>Copy link</Button>
                <a href={qr} download={`private-tickets-${dateUuid}.png`}>
                  <Button size="xs" variant="default" component="span">Download QR</Button>
                </a>
              </Group>
            </Stack>
          </Group>
        )}

        {message && <Alert color={message.startsWith("Could not") || message.startsWith("The new") ? "red" : "blue"}>{message}</Alert>}
      </Stack>
    </Paper>
  );
}
