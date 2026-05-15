"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Event, isEvent } from "@/types";
import { usePosts } from "@/app/contexts/PostsContext";
import { splitTitleAccent } from "@/lib/text";
import CanvasBackground from "@/components/Background/CanvasBackground";
import SectionLabel from "@/components/SectionLabel/SectionLabel";
import {
  LoadingScreen,
  ErrorScreen,
  NotFoundScreen,
} from "@/components/StateScreens/StateScreens";
import TicketDateCard from "./TicketDateCard";
import TicketDateExpanded from "./TicketDateExpanded";
import styles from "./styles.module.css";

type Status = "loading" | "ready" | "notFound" | "error";

function formatNL(d: Date): string {
  return d.toLocaleDateString("nl-BE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function computeDateRange(dates: Event["dates"]): string {
  if (!dates || dates.length === 0) return "";
  const sorted = [...dates].sort(
    (a, b) =>
      new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
  );
  const first = new Date(sorted[0].start_time);
  const last = new Date(sorted[sorted.length - 1].start_time);
  if (first.toDateString() === last.toDateString()) {
    return formatNL(first);
  }
  return `${formatNL(first)} — ${formatNL(last)}`;
}

export default function TicketsPage() {
  const { id } = useParams();
  const { fetchPostById } = usePosts();
  const [event, setEvent] = useState<Event | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [activeCard, setActiveCard] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setEvent(null);
    setErrorMessage(undefined);

    const run = async () => {
      try {
        const fetched = await fetchPostById(id as string);
        if (cancelled) return;
        if (!fetched || !isEvent(fetched)) {
          setStatus("notFound");
          return;
        }
        setEvent(fetched);
        setStatus("ready");
      } catch (e) {
        if (cancelled) return;
        setErrorMessage(e instanceof Error ? e.message : String(e));
        setStatus("error");
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [id, fetchPostById]);

  if (status === "loading") return <LoadingScreen />;
  if (status === "error") return <ErrorScreen message={errorMessage} />;
  if (status === "notFound" || !event) return <NotFoundScreen />;

  const { main: titleMain, accent: titleAccent } = splitTitleAccent(event.title);
  const dateRange = computeDateRange(event.dates);
  const venue =
    event.eventlocation?.location ?? event.eventlocation?.city ?? "";

  return (
    <div>
      <div className={styles.canvasLayer}>
        <CanvasBackground />
      </div>

      <section className={styles.hero} aria-label="Ticket selection">
        <div className={styles.heroSide} aria-hidden="true">
          <span className={styles.heroSideLine}></span>
          RESERVE YOUR SEAT · GENTLEMAN PRODUCTIONS
          <span className={styles.heroSideLine}></span>
        </div>

        <Link href={`/event/${event.uuid}`} className={styles.backLink}>
          &larr; Back to event
        </Link>

        <div className={styles.heroContent}>
          <p className={styles.eyebrow}>Tickets</p>
          <h1 className={styles.title}>
            {titleMain}
            {titleAccent && (
              <>
                {" "}
                <span className={styles.titleAccent}>{titleAccent}</span>
              </>
            )}
          </h1>
          {dateRange && (
            <div className={styles.dateRow}>
              <span className={styles.dateChevron}>&#9656;</span>
              <span className={styles.dateMain}>{dateRange}</span>
              {venue && <span className={styles.dateVenue}>{venue}</span>}
            </div>
          )}
        </div>
      </section>

      <SectionLabel>Available Dates</SectionLabel>

      <div className={styles.grid}>
        {event.dates.map((d) => {
          if (d.uuid === activeCard) {
            return (
              <TicketDateExpanded
                key={d.uuid}
                date={d}
                event={event}
                onClose={() => setActiveCard(undefined)}
              />
            );
          }
          return (
            <TicketDateCard
              key={d.uuid}
              date={d}
              event={event}
              inactive={activeCard !== undefined}
              onSelect={() => setActiveCard(d.uuid)}
            />
          );
        })}
      </div>
    </div>
  );
}
