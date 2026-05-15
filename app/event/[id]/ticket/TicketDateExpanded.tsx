"use client";

import { Image } from "@mantine/core";
import { Event, EventDateEntry, EventLocation } from "@/types";
import { splitTitleAccent } from "@/lib/text";
import GoldShimmerCTA from "@/components/GoldShimmerCTA/GoldShimmerCTA";
import styles from "./TicketDateExpanded.module.css";

interface TicketDateExpandedProps {
  date: EventDateEntry;
  event: Event;
  onClose: () => void;
}

const LOCATION_FIELD_LABELS: Record<keyof EventLocation, string> = {
  country: "Country",
  city: "City",
  street: "Street",
  location: "Venue",
};

function formatLongDate(iso: string): string {
  return new Date(iso).toLocaleDateString("nl-BE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("nl-BE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatStartDate(iso: string): string {
  return new Date(iso).toLocaleDateString("nl-BE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function TicketDateExpanded({
  date,
  event,
  onClose,
}: TicketDateExpandedProps) {
  const { main, accent } = splitTitleAccent(event.title);
  const venue =
    event.eventlocation?.location ?? event.eventlocation?.city ?? "";
  const description = event.description?.trim() ?? "";
  const paragraphs = description ? description.split(/\n\s*\n/) : [];

  const locationEntries = event.eventlocation
    ? (Object.entries(event.eventlocation) as Array<
        [keyof EventLocation, string]
      >).filter(([, value]) => Boolean(value))
    : [];

  return (
    <article
      className={styles.card}
      aria-labelledby={`expanded-title-${date.uuid}`}
    >
      <span className={styles.corner} aria-hidden="true" />
      <span className={`${styles.corner} ${styles.cornerTr}`} aria-hidden="true" />
      <span className={`${styles.corner} ${styles.cornerBl}`} aria-hidden="true" />
      <span className={`${styles.corner} ${styles.cornerBr}`} aria-hidden="true" />

      <div className={styles.heroImage}>
        <Image
          src={event.display_image}
          alt={event.title}
          width={720}
          height={280}
        />
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label="Close details"
        >
          &#x2715;
        </button>
      </div>

      <div className={styles.body}>
        <div className={styles.titleRow}>
          <div>
            <h2 id={`expanded-title-${date.uuid}`} className={styles.title}>
              {main}
              {accent && (
                <>
                  {" "}
                  <span className={styles.titleAccent}>{accent}</span>
                </>
              )}
            </h2>
            <div className={styles.dateRow}>
              <span className={styles.dateChev} aria-hidden="true">&#9656;</span>
              <span>
                {formatLongDate(date.start_time)} · {formatTime(date.start_time)} – {formatTime(date.end_time)}
              </span>
              {venue && <span className={styles.dateVenue}>{venue}</span>}
            </div>
          </div>
          {date.price != null && (
            <div className={styles.priceCol}>
              <span className={styles.price}>€{date.price}</span>
            </div>
          )}
        </div>

        {paragraphs.length > 0 && (
          <div className={styles.desc}>
            {paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        )}

        <div className={styles.twoCol}>
          <div>
            <h3 className={styles.colHead}>Event Timeline</h3>
            <ul className={styles.timeline}>
              <li className={styles.timelineItem}>
                <div className={styles.timeLabel}>{formatStartDate(date.start_time)}</div>
                <div className={styles.timeDesc}>Start datum</div>
              </li>
              {date.timeLine?.map((entry) => (
                <li key={`${entry.time}-${entry.description}`} className={styles.timelineItem}>
                  <div className={styles.timeLabel}>{entry.time}</div>
                  <div className={styles.timeDesc}>{entry.description}</div>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className={styles.colHead}>Event Location</h3>
            <div className={styles.locationList}>
              {locationEntries.map(([key, value]) => (
                <div key={key} className={styles.locationItem}>
                  <span className={styles.locationIcon} aria-hidden="true">&#9656;</span>
                  <div>
                    <span className={styles.locationLabel}>
                      {LOCATION_FIELD_LABELS[key]}
                    </span>
                    <span className={styles.locationValue}>{value}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {date.price != null && date.external_link && (
          <div className={styles.ctaRow}>
            <GoldShimmerCTA
              href={date.external_link}
              target="_blank"
              rel="noopener noreferrer"
            >
              Buy Tickets
            </GoldShimmerCTA>
          </div>
        )}
      </div>
    </article>
  );
}
