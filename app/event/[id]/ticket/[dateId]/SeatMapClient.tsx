"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Event, SeatTicket, isEvent } from "@/types";
import { usePosts } from "@/app/contexts/PostsContext";
import { splitTitleAccent } from "@/lib/text";
import { ROWS, getRowSeats } from "@/lib/venue";
import { buildIndex, effectiveStatus, isSelectable, toggleSeat } from "@/lib/seatSelection";
import CanvasBackground from "@/components/Background/CanvasBackground";
import SectionLabel from "@/components/SectionLabel/SectionLabel";
import SavedOrderBanner from "@/components/SavedOrders/SavedOrderBanner";
import {
  LoadingScreen,
  ErrorScreen,
  NotFoundScreen,
} from "@/components/StateScreens/StateScreens";
import styles from "./SeatMap.module.css";

type Status = "loading" | "ready" | "notFound" | "error";

// Per-seat fill colors — literal replacements for the reference `theme.seatX` tokens.
const SEAT = {
  available: "#1a7a40",
  selected: "#c9a84c",
  held: "#f59e0b",
  sold: "#ef4444",
  wheelchair: "#3b82f6",
};

function formatNL(d: Date): string {
  return d.toLocaleDateString("nl-BE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export default function SeatMapClient({ isAdmin }: { isAdmin: boolean }) {
  const { id, dateId } = useParams();
  const router = useRouter();
  const { fetchPostById } = usePosts();

  const [event, setEvent] = useState<Event | null>(null);
  const [tickets, setTickets] = useState<SeatTicket[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);

  const [selected, setSelected] = useState<string[]>([]);
  const [multiRow, setMultiRow] = useState(false);

  // Highlights every member of a place at once. A place spanning rows draws as
  // one run per row, so without this a multi-row place reads as several
  // unrelated things.
  const [hoverGroup, setHoverGroup] = useState<string | null>(null);
  // A place is selected as a whole, by group id — NOT through `selected`, which
  // is keyed by ticket id. Floor seats have no id (the API withholds it for
  // anything not 'available'), and on a multi-row place most members are floor
  // seats, so an id-based selection would find almost none of them.
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const [reserving, setReserving] = useState(false);
  const [reserveError, setReserveError] = useState<string | null>(null);

  const seatGridRef = useRef<HTMLDivElement>(null);
  const [scrollLeft, setScrollLeft] = useState(false);
  const [scrollRight, setScrollRight] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setEvent(null);
    setTickets([]);
    setErrorMessage(undefined);

    const run = async () => {
      try {
        const [fetched, seatsRes] = await Promise.all([
          fetchPostById(id as string),
          fetch(`/api/tickets/seats?date_uuid=${dateId}`),
        ]);
        if (cancelled) return;
        if (!fetched || !isEvent(fetched)) {
          setStatus("notFound");
          return;
        }
        const dateEntry = fetched.dates.find((d) => d.uuid === dateId);
        if (!dateEntry) {
          setStatus("notFound");
          return;
        }
        if (!seatsRes.ok) {
          throw new Error("Failed to load seat availability");
        }
        const seatData: SeatTicket[] = await seatsRes.json();
        if (cancelled) return;
        setEvent(fetched);
        setTickets(seatData);
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
  }, [id, dateId, fetchPostById]);

  const index = useMemo(() => buildIndex(tickets), [tickets]);
  const ticketsByCoord = useMemo(() => {
    const map: Record<string, SeatTicket> = {};
    for (const t of tickets) map[`${t.seat.row}-${t.seat.seat_number}`] = t;
    return map;
  }, [tickets]);

  // Drives the left/right fade hints so it's obvious the grid can be swiped
  // to reveal seats that don't fit on a phone-width screen.
  useEffect(() => {
    const el = seatGridRef.current;
    if (!el) return;

    const update = () => {
      setScrollLeft(el.scrollLeft > 4);
      setScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
    };
    update();

    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [tickets]);

  if (status === "loading") return <LoadingScreen />;
  if (status === "error") return <ErrorScreen message={errorMessage} />;
  if (status === "notFound" || !event) return <NotFoundScreen />;

  const date = event.dates.find((d) => d.uuid === dateId);
  if (!date) return <NotFoundScreen />;

  const { main: titleMain, accent: titleAccent } = splitTitleAccent(event.title);
  const dateLabel = formatNL(new Date(date.start_time));
  const price = date.price ?? 0;

  function getSeatStyle(row: string, seatNum: number | null): React.CSSProperties {
    if (seatNum === null) return {};
    const cell = index.seatMap[`${row}-${seatNum}`];
    const ticket = ticketsByCoord[`${row}-${seatNum}`];
    const statusValue = ticket ? effectiveStatus(ticket) : "gap";
    const ticketId = cell?.id;
    const isSelected = Boolean(ticketId && selected.includes(ticketId));
    const selectable = ticketId ? isSelectable(index, selected, multiRow, row, seatNum, isAdmin) : false;

    let background: string;
    if (isSelected) {
      background = `linear-gradient(180deg, #d4b05a 0%, ${SEAT.selected} 50%, #a8832e 100%)`;
    } else if (statusValue === "held") {
      background = `linear-gradient(180deg, #fbbf24 0%, ${SEAT.held} 50%, #b45309 100%)`;
    } else if (statusValue === "sold") {
      background = `linear-gradient(180deg, #f87171 0%, ${SEAT.sold} 50%, #991b1b 100%)`;
    } else if (statusValue === "wheelchair" || statusValue === "blocked") {
      // Anchor and floor share one fill so the place reads as a single object;
      // the glyph and the shared outline are what distinguish them.
      background = `linear-gradient(180deg, #60a5fa 0%, ${SEAT.wheelchair} 50%, #1d4ed8 100%)`;
    } else if (statusValue === "available") {
      background = `linear-gradient(180deg, #22924a 0%, ${SEAT.available} 50%, #0f5c2a 100%)`;
    } else {
      background = "transparent";
    }

    const opacity =
      statusValue === "gap"
        ? 0
        : statusValue === "available" && !selectable && !isSelected
          ? 0.28
          : 1;

    const boxShadow = isSelected
      ? `0 0 10px 2px rgba(201,168,76,0.45), inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 0 rgba(0,0,0,0.3)`
      : statusValue === "available"
        ? `inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.35), 0 2px 4px rgba(0,0,0,0.4)`
        : `inset 0 1px 0 rgba(255,255,255,0.05), inset 0 -1px 0 rgba(0,0,0,0.3), 0 1px 3px rgba(0,0,0,0.3)`;

    const groupId = cell?.wheelchair_group_id ?? null;
    const groupActive = groupId !== null && (groupId === hoverGroup || groupId === selectedGroupId);

    return {
      background,
      cursor: selectable
        ? "pointer"
        : groupId && isAdmin
          ? "pointer"
          : statusValue === "available"
            ? "default"
            : "not-allowed",
      opacity,
      boxShadow,
      transform: isSelected ? "scale(1.15)" : "scale(1)",
      zIndex: isSelected ? 1 : 0,
      outline: groupId ? `2px solid ${groupActive ? "#bfdbfe" : "rgba(96,165,250,0.5)"}` : undefined,
      outlineOffset: groupId ? "-2px" : undefined,
    };
  }

  function handleSeatClick(row: string, seatNum: number | null) {
    if (seatNum === null) return;
    setSelected((prev) => toggleSeat(index, prev, multiRow, row, seatNum, isAdmin));
  }

  async function handleReserve() {
    if (selected.length === 0) return;
    setReserving(true);
    setReserveError(null);
    try {
      const res = await fetch("/api/tickets/admin/reserve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventUuid: event!.uuid, dateUuid: dateId, ticketIds: selected }),
      });
      const data = await res.json();
      if (!res.ok) {
        setReserveError(data.error ?? "Could not reserve the selected seats.");
        setReserving(false);
        return;
      }
      const seatLabels = selected
        .map((ticketId) => index.ticketById[ticketId])
        .filter((s): s is { row: string; seatNum: number } => Boolean(s))
        .map((s) => `${s.row}${s.seatNum}`);
      router.push(
        `/event/${id}/ticket/${dateId}/reserved?order=${data.orderId}&seats=${encodeURIComponent(seatLabels.join(","))}`
      );
    } catch {
      setReserveError("Could not reserve the selected seats. Please try again.");
      setReserving(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.canvasLayer}>
        <CanvasBackground />
      </div>

      <section className={styles.hero} aria-label="Seat selection">
        <div className={styles.heroSide} aria-hidden="true">
          <span className={styles.heroSideLine}></span>
          RESERVE YOUR SEAT · GENTLEMAN PRODUCTIONS
          <span className={styles.heroSideLine}></span>
        </div>

        <Link href={`/event/${event.uuid}/ticket`} className={styles.backLink}>
          &larr; Back to dates
        </Link>

        <div className={styles.heroContent}>
          <p className={styles.eyebrow}>Select your seats</p>
          <h1 className={styles.title}>
            {titleMain}
            {titleAccent && (
              <>
                {" "}
                <span className={styles.titleAccent}>{titleAccent}</span>
              </>
            )}
          </h1>
          <div className={styles.dateRow}>
            <span className={styles.dateChevron}>&#9656;</span>
            <span className={styles.dateMain}>{dateLabel}</span>
          </div>
        </div>
      </section>

      <SavedOrderBanner dateUuid={dateId as string} />

      <SectionLabel>Choose Your Seats</SectionLabel>

      {tickets.length === 0 ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>Seats aren&rsquo;t available for this date yet.</p>
          <p className={styles.emptySub}>
            Ticket sales for this performance haven&rsquo;t been set up. Please check back soon.
          </p>
        </div>
      ) : (
      <>
      <div className={styles.mapWrap}>
        <div className={styles.legend}>
          {[
            { color: SEAT.available, label: "Selectable" },
            { color: SEAT.available, label: "Not selectable", dim: true },
            { color: SEAT.selected, label: "Selected" },
            { color: SEAT.held, label: "On hold" },
            { color: SEAT.sold, label: "Sold" },
            { color: SEAT.wheelchair, label: "Wheelchair place" },
          ].map(({ color, label, dim }) => (
            <div key={label} className={styles.legendItem}>
              <div
                className={styles.legendDot}
                style={{ background: color, opacity: dim ? 0.28 : 1 }}
              />
              {label}
            </div>
          ))}
        </div>

        {isAdmin ? (
          <div className={styles.toggleWrap}>
            <span className={styles.adminModeLabel}>Admin mode — pick any seats freely</span>
          </div>
        ) : (
          <div className={styles.toggleWrap}>
            <label
              className={styles.toggle}
              style={{ borderColor: multiRow ? "var(--gold)" : undefined }}
            >
              <div
                onClick={() => {
                  setMultiRow(!multiRow);
                  if (multiRow) setSelected([]);
                }}
                className={styles.switch}
                style={{ background: multiRow ? "var(--gold)" : undefined }}
              >
                <div
                  className={styles.switchKnob}
                  style={{ left: multiRow ? 19 : 3 }}
                />
              </div>
              <span
                className={styles.toggleLabel}
                style={{ color: multiRow ? "var(--gold)" : undefined }}
              >
                Multiple rows
              </span>
            </label>
          </div>
        )}

        <p className={styles.scrollHint}>&larr; Swipe to see all seats &rarr;</p>

        <div
          className={styles.seatGridScroll}
          data-scroll-left={scrollLeft}
          data-scroll-right={scrollRight}
        >
          <div className={styles.seatGrid} ref={seatGridRef}>
            <div className={styles.seatGridInner}>
              {[...ROWS].reverse().map((row) => (
                <div key={row} className={styles.seatRow}>
                  <span className={styles.rowLabel}>{row}</span>
                  {getRowSeats(row).map((seatNum, idx) => {
                    const cell = seatNum === null ? undefined : index.seatMap[`${row}-${seatNum}`];
                    const groupId = cell?.wheelchair_group_id ?? null;
                    return (
                      <div
                        key={idx}
                        className={seatNum === null ? styles.seatGap : styles.seat}
                        onClick={() => handleSeatClick(row, seatNum)}
                        onMouseEnter={() => setHoverGroup(groupId)}
                        onMouseLeave={() => setHoverGroup(null)}
                        title={seatNum !== null ? `${row}${seatNum}` : ""}
                        style={getSeatStyle(row, seatNum)}
                      >
                        {cell?.seat_kind === "wheelchair" && (
                          <span className={styles.wheelchairGlyph} aria-hidden="true">&#9855;</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.stageWrap}>
          <div className={styles.stage}>
            <span className={styles.stageLabel}>&#9670; Stage &#9670;</span>
          </div>
          <div className={styles.stageGlow} />
        </div>
      </div>

      <div className={styles.bottomBar}>
        <div className={styles.bottomBarInfo}>
          <div className={styles.selectionCount}>
            {selected.length === 0
              ? "No seats selected"
              : `${selected.length} seat${selected.length > 1 ? "s" : ""} selected`}
          </div>
          {selected.length > 0 && (
            <div className={styles.priceLine}>€{price.toFixed(2)} per seat</div>
          )}
        </div>
        <div className={styles.bottomBarActions}>
          {reserveError && <span className={styles.reserveError}>{reserveError}</span>}
          {selected.length > 0 && (
            <button
              type="button"
              className={styles.clearBtn}
              onClick={() => setSelected([])}
            >
              Clear
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              className={styles.reserveBtn}
              disabled={selected.length === 0 || reserving}
              onClick={handleReserve}
            >
              {reserving ? "Reserving…" : "Reserve for giveaway"}
            </button>
          )}
          <button
            type="button"
            className={styles.continueBtn}
            disabled={selected.length === 0}
            onClick={() =>
              selected.length > 0 &&
              router.push(`/event/${id}/ticket/${dateId}/checkout?tickets=${selected.join(",")}`)
            }
          >
            {selected.length > 0 ? "Continue →" : "Select seats"}
          </button>
        </div>
      </div>
      </>
      )}
    </div>
  );
}
