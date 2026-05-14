"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Event } from "@/types";
import { usePosts } from "@/app/contexts/PostsContext";
import { splitTitleAccent, toRomanNumerals } from "@/lib/text";
import CanvasBackground from "@/components/Background/CanvasBackground";
import SectionLabel from "@/components/SectionLabel/SectionLabel";
import EventGallery from "@/components/EventGallery/EventGallery";
import {
  LoadingScreen,
  ErrorScreen,
  NotFoundScreen,
} from "@/components/StateScreens/StateScreens";
import styles from "./page.module.css";

function formatNL(d: Date): string {
  return d.toLocaleDateString("nl-BE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function computeDateText(dates: Event["dates"]): string {
  if (!dates || dates.length === 0) return "";
  const sorted = [...dates].sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
  );
  const first = new Date(sorted[0].start_time);
  const last = new Date(sorted[sorted.length - 1].start_time);
  if (first.toDateString() === last.toDateString()) {
    return formatNL(first);
  }
  return `${formatNL(first)} — ${formatNL(last)}`;
}

function eyebrowFor(dates: Event["dates"]): string {
  if (!dates || dates.length === 0) return "Archived";
  const year = new Date(dates[0].start_time).getFullYear();
  return `Archived · ${toRomanNumerals(year)}`;
}

export default function EventPage() {
  const router = useRouter();
  const { id } = useParams();
  const { fetchPostById, loading, error } = usePosts();
  const [event, setEvent] = useState<Event | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const fetched = await fetchPostById(id as string);
      if (cancelled) return;
      if (!fetched) {
        setNotFound(true);
      } else {
        setEvent(fetched as Event);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [id, fetchPostById]);

  if (loading) return <LoadingScreen />;
  if (error) return <ErrorScreen message={error} />;
  if (notFound || !event) return <NotFoundScreen />;

  const { main: titleMain, accent: titleAccent } = splitTitleAccent(event.title);
  const dateText = computeDateText(event.dates);
  const eyebrow = eyebrowFor(event.dates);
  const venue =
    event.eventlocation?.location || event.eventlocation?.city || "";
  const description = event.description?.trim() ?? "";
  const paragraphs = description ? description.split(/\n\s*\n/) : [];
  const images = event.images?.filter(Boolean) ?? [];

  return (
    <div>
      <div className={styles.canvasLayer}>
        <CanvasBackground />
      </div>

      <section className={styles.hero} aria-label="Production details">
        <button
          type="button"
          className={styles.backLink}
          onClick={() => router.push("/#programme")}
        >
          &larr; Back to programme
        </button>

        <div className={styles.heroContent}>
          <div className={styles.eyebrow}>{eyebrow}</div>
          <h1 className={styles.title}>
            {titleMain}
            {titleAccent && (
              <>
                {" "}
                <span className={styles.titleAccent}>{titleAccent}</span>
              </>
            )}
          </h1>
          {dateText && (
            <div className={styles.dateRow}>
              <span className={styles.dateChevron}>&#9656;</span>
              <span className={styles.dateMain}>{dateText}</span>
              {venue && <span className={styles.dateVenue}>{venue}</span>}
            </div>
          )}
        </div>
      </section>

      {paragraphs.length > 0 && (
        <section className={styles.programme} aria-label="Programme notes">
          <SectionLabel>Programme Notes</SectionLabel>
          <div className={styles.programmeBody}>
            {paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </section>
      )}

      {images.length > 0 && (
        <EventGallery images={images} title={event.title} />
      )}
    </div>
  );
}
