"use client";

import { Image } from "@mantine/core";
import { Event, EventDateEntry } from "@/types";
import { splitTitleAccent } from "@/lib/text";
import { closedMessageFor } from "@/lib/dateAvailability";
import styles from "./TicketDateCard.module.css";

interface TicketDateCardProps {
  date: EventDateEntry;
  event: Event;
  /** Dimmed because another date is expanded. Still selectable. */
  inactive?: boolean;
  /** Tickets aren't on sale for this date: greyed out and not selectable. */
  closed?: boolean;
  onSelect?: () => void;
}

function formatDateTime(date: EventDateEntry): string {
  const start = new Date(date.start_time);
  const end = new Date(date.end_time);
  const day = start.toLocaleDateString("nl-BE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const startHM = start.toLocaleTimeString("nl-BE", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const endHM = end.toLocaleTimeString("nl-BE", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${day} · ${startHM} – ${endHM}`;
}

export default function TicketDateCard({
  date,
  event,
  inactive,
  closed,
  onSelect,
}: TicketDateCardProps) {
  const { main, accent } = splitTitleAccent(event.title);
  const venue = event.eventlocation?.location ?? event.eventlocation?.city ?? "";
  const closedMessage = closed ? closedMessageFor(date) : "";

  return (
    <button
      type="button"
      // Disabling natively takes the card out of the tab order and swallows the
      // click, so there's no handler left to guard.
      disabled={closed}
      className={`${styles.card} ${inactive ? styles.inactive : ""} ${
        closed ? styles.closed : ""
      }`}
      onClick={onSelect}
      aria-label={
        closed
          ? `${formatDateTime(date)} for ${event.title} — ${closedMessage}`
          : `Select date ${formatDateTime(date)} for ${event.title}`
      }
    >
      <span className={styles.corner} aria-hidden="true" />
      <span className={`${styles.corner} ${styles.cornerBr}`} aria-hidden="true" />
      {closed && (
        <div className={styles.closedOverlay}>
          <span className={styles.closedText}>{closedMessage}</span>
        </div>
      )}
      <div className={styles.imageWrap}>
        <Image
          src={event.display_image}
          alt={event.title}
          width={320}
          height={190}
        />
      </div>
      <div className={styles.info}>
        <div className={styles.titleRow}>
          <h3 className={styles.title}>
            {main}
            {accent && (
              <>
                {" "}
                <span className={styles.titleAccent}>{accent}</span>
              </>
            )}
          </h3>
          {date.price != null && (
            <span className={styles.price}>€{date.price}</span>
          )}
        </div>
        <div className={styles.meta}>
          <span className={styles.chev} aria-hidden="true">&#9656;</span>
          <span>{formatDateTime(date)}</span>
        </div>
        {venue && (
          <div className={styles.meta}>
            <span className={styles.chev} aria-hidden="true">&#9656;</span>
            <span>{venue}</span>
          </div>
        )}
      </div>
    </button>
  );
}
