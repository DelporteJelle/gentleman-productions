"use client";

import { Image } from "@mantine/core";
import { Event, EventDateEntry } from "@/types";
import { splitTitleAccent } from "@/lib/text";
import styles from "./TicketDateCard.module.css";

interface TicketDateCardProps {
  date: EventDateEntry;
  event: Event;
  inactive: boolean;
  onSelect: () => void;
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
  onSelect,
}: TicketDateCardProps) {
  const { main, accent } = splitTitleAccent(event.title);
  const venue = event.eventlocation?.location ?? event.eventlocation?.city ?? "";

  return (
    <button
      type="button"
      className={`${styles.card} ${inactive ? styles.inactive : ""}`}
      onClick={onSelect}
      aria-label={`Select date ${formatDateTime(date)} for ${event.title}`}
    >
      <span className={styles.corner} aria-hidden="true" />
      <span className={`${styles.corner} ${styles.cornerBr}`} aria-hidden="true" />
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
