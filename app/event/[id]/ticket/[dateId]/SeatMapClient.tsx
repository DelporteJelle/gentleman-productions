"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Event, SeatTicket, isEvent } from "@/types";
import { usePosts } from "@/app/contexts/PostsContext";
import { splitTitleAccent } from "@/lib/text";
import { ROWS, getRowSeats } from "@/lib/venue";
import {
  buildIndex,
  effectiveStatus,
  isSelectable,
  toggleSeat,
  groupMembers,
  placeStatus,
  anchorTicketId,
  disabledTicketIds,
} from "@/lib/seatSelection";
import {
  formatPlaceLabel,
  buildRowCells,
  segmentSpan,
  type PlaceCell,
} from "@/lib/wheelchairPlaces";
import CanvasBackground from "@/components/Background/CanvasBackground";
import SectionLabel from "@/components/SectionLabel/SectionLabel";
import SavedOrderBanner from "@/components/SavedOrders/SavedOrderBanner";
import {
  LoadingScreen,
  ErrorScreen,
  NotFoundScreen,
} from "@/components/StateScreens/StateScreens";
import AdminCodeGenerator from "@/components/TicketCodes/AdminCodeGenerator";
import CodeEntryPanel from "@/components/TicketCodes/CodeEntryPanel";
import { useTicketCodes } from "@/components/TicketCodes/useTicketCodes";
import { writeCodes } from "@/lib/codeStore";
import codeStyles from "@/components/TicketCodes/TicketCodes.module.css";
import styles from "./SeatMap.module.css";

type Status = "loading" | "ready" | "notFound" | "error";

// Per-seat fill colors — literal replacements for the reference `theme.seatX` tokens.
const SEAT = {
  available: "#1a7a40",
  selected: "#c9a84c",
  held: "#f59e0b",
  sold: "#ef4444",
  wheelchair: "#3b82f6",
  disabled: "#4b5563",
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

  const [placeBusy, setPlaceBusy] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);

  const codes = useTicketCodes(event?.uuid, dateId as string);
  // The unlocked wheelchair anchor is tracked separately from `selected`.
  // That array carries the contiguity rules; a wheelchair place is exempt from
  // them, and threading an exemption flag through isSelectable/toggleSeat
  // would put a special case inside logic that is currently uniform.
  const [wheelchairTicketId, setWheelchairTicketId] = useState<string | null>(null);

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

  // A removed code must not leave an unlocked place stranded. With no
  // wheelchair code left, checkout would reject the anchor ticket anyway, and
  // handlePlaceClick's non-admin branch guards on `wheelchairCount === 0`
  // before it ever reaches the toggle-off logic — so without this, clicking
  // the place after the code is gone does nothing and only a reload recovers.
  useEffect(() => {
    if (codes.wheelchairCount === 0) setWheelchairTicketId(null);
  }, [codes.wheelchairCount]);

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
      // Unreachable in normal operation — every member of a place is drawn by
      // getPlaceRunStyle instead. Kept as a fallback so a member that somehow
      // escaped its run shows up blue rather than vanishing.
      background = `linear-gradient(180deg, #60a5fa 0%, ${SEAT.wheelchair} 50%, #1d4ed8 100%)`;
    } else if (statusValue === "disabled") {
      // Admin-only: a customer never receives a disabled seat, so this is a
      // slab of grey for the person who can put it back, not a chair for sale.
      background = `linear-gradient(180deg, #6b7280 0%, ${SEAT.disabled} 50%, #374151 100%)`;
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

    return {
      background,
      // "gap" covers both a coordinate with no ticket at all (never
      // provisioned) and one the client holds no ticket for because it is
      // 'disabled' and withheld by the API — either way there is nothing
      // there, so it must read the same as a true aisle gap: no
      // not-allowed cursor singling it out from an empty seam in the row.
      cursor:
        selectable
          ? "pointer"
          : statusValue === "available" || statusValue === "gap"
            ? "default"
            : "not-allowed",
      opacity,
      boxShadow,
      transform: isSelected ? "scale(1.15)" : "scale(1)",
      zIndex: isSelected ? 1 : 0,
    };
  }

  function groupAt(row: string | null, seatNum: number | null): string | null {
    if (row === null || seatNum === null) return null;
    return index.seatMap[`${row}-${seatNum}`]?.wheelchair_group_id ?? null;
  }

  /**
   * One piece of a wheelchair place.
   *
   * Sized to the largest box that cannot touch a neighbouring seat.
   * Horizontally that is its own columns plus the gaps BETWEEN them, leaving
   * the 3px separating it from whatever sits either side. Vertically it grows
   * by the 4px row gap only where the same place continues below — the row gap
   * carried by `.seat` means that is a plain height increase, no negative
   * margin involved.
   *
   * Edges that continue into another piece lose their border and their corner
   * rounding, which is what actually makes the pieces read as one object. An
   * `outline` cannot do this: it has no per-side control, so it drew a line
   * through every seam.
   */
  function getPlaceCellStyle(cell: PlaceCell): React.CSSProperties {
    const anchorId = anchorTicketId(index, cell.groupId);
    const state = placeStatus(index, cell.groupId);
    const taken = state === "held" || state === "sold";
    // Admin selects a place by putting its anchor into `selected`, exactly as
    // for any other seat; a code-holder marks it via wheelchairTicketId.
    const chosen = anchorId !== null &&
      (anchorId === wheelchairTicketId || (isAdmin && selected.includes(anchorId)));
    const active = cell.groupId === hoverGroup || chosen;
    const { seats, gaps } = segmentSpan(cell.seatNums.length, cell.isRunEnd);

    // A taken place keeps its wheelchair shape and glyph but takes the colour
    // of its state, so it reads the same way a held or sold seat does.
    const fill = chosen
      ? SEAT.selected
      : state === "sold"
        ? SEAT.sold
        : state === "held"
          ? SEAT.held
          : SEAT.wheelchair;
    const edge = chosen
      ? "#f0dca0"
      : state === "sold"
        ? "rgba(248,113,113,0.75)"
        : state === "held"
          ? "rgba(251,191,36,0.75)"
          : active
            ? "#bfdbfe"
            : "rgba(96,165,250,0.55)";
    const border = `2px solid ${edge}`;
    const radius = "8px";

    return {
      width: `calc(${seats} * var(--seat-w) + ${gaps} * var(--seat-gap))`,
      // Cancels the flex gap the extra gap-unit above accounts for, so a split
      // run occupies exactly what an unsplit one would.
      marginRight: cell.isRunEnd ? undefined : "calc(-1 * var(--seat-gap))",
      height: cell.continuesDown ? "calc(var(--seat-h) + var(--row-gap))" : "var(--seat-h)",
      marginBottom: cell.continuesDown ? 0 : "var(--row-gap)",

      borderTop: cell.continuesUp ? "none" : border,
      borderBottom: cell.continuesDown ? "none" : border,
      borderLeft: cell.isRunStart ? border : "none",
      borderRight: cell.isRunEnd ? border : "none",

      borderTopLeftRadius: cell.isRunStart && !cell.continuesUp ? radius : 0,
      borderTopRightRadius: cell.isRunEnd && !cell.continuesUp ? radius : 0,
      borderBottomLeftRadius: cell.isRunStart && !cell.continuesDown ? radius : 0,
      borderBottomRightRadius: cell.isRunEnd && !cell.continuesDown ? radius : 0,

      // Flat, not a gradient: a vertical gradient restarts in every row and
      // would band a place spanning rows into stripes.
      boxShadow: cell.continuesDown ? undefined : "0 2px 5px rgba(0,0,0,0.3)",
      cursor:
        taken || (!isAdmin && codes.wheelchairCount === 0) ? "not-allowed" : "pointer",
      background: fill,
    };
  }

  function handleSeatClick(row: string, seatNum: number | null) {
    if (seatNum === null) return;
    setSelectedGroupId(null);
    setSelected((prev) => toggleSeat(index, prev, multiRow, row, seatNum, isAdmin));
  }

  /** A place is acted on as a whole, via its anchor — the only member the API
   *  gives an id for. */
  function handlePlaceClick(groupId: string) {
    // A held or sold place is nobody's to take: not a code-holder's, and not
    // an admin's to give away or dissolve. The server refuses both, and the
    // API withholds the anchor id anyway — refusing here stops the UI offering
    // an action that can only fail.
    if (placeStatus(index, groupId) !== "available") return;

    const anchorId = anchorTicketId(index, groupId);
    if (!anchorId) return;

    if (!isAdmin) {
      // A validated wheelchair code unlocks exactly one place.
      if (codes.wheelchairCount === 0) return;
      setWheelchairTicketId((prev) => (prev === anchorId ? null : anchorId));
      return;
    }
    // The anchor joins `selected` like any other seat, so the existing
    // giveaway flow reserves a place with no special case — on its own or
    // alongside ordinary seats. `selectedGroupId` additionally tracks which
    // place the revert action would dissolve, which is only ever one.
    setPlaceError(null);
    setSelected((prev) =>
      prev.includes(anchorId) ? prev.filter((id) => id !== anchorId) : [...prev, anchorId],
    );
    setSelectedGroupId((prev) => (prev === groupId ? null : groupId));
  }

  /** Ticket ids that are wheelchair anchors, for telling a place apart from an
   *  ordinary seat inside `selected`. */
  function anchorIds(): Set<string> {
    const out = new Set<string>();
    for (const key in index.seatMap) {
      const cell = index.seatMap[key];
      if (cell.seat_kind === "wheelchair" && cell.id) out.add(cell.id);
    }
    return out;
  }

  function placeLabel(groupId: string): string {
    return formatPlaceLabel(
      groupMembers(index, groupId).map((s) => ({ row: s.row, seat_number: s.seatNum })),
    );
  }

  async function refreshSeats() {
    const res = await fetch(`/api/tickets/seats?date_uuid=${dateId}`);
    if (!res.ok) throw new Error("Failed to reload seat availability");
    setTickets((await res.json()) as SeatTicket[]);
  }

  async function handleCreatePlace() {
    if (selected.length === 0) return;
    const members = selected
      .map((ticketId) => index.ticketById[ticketId])
      .filter((s): s is { row: string; seatNum: number } => Boolean(s))
      .map((s) => ({ row: s.row, seat_number: s.seatNum }));

    const confirmed = window.confirm(
      `Van ${members.length} stoel${members.length === 1 ? "" : "en"} (${formatPlaceLabel(members)}) ` +
        `één rolstoelplaats maken? Deze stoelen zijn daarna niet meer los te koop.`
    );
    if (!confirmed) return;

    setPlaceBusy(true);
    setPlaceError(null);
    try {
      const res = await fetch("/api/tickets/admin/wheelchair-places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventUuid: event!.uuid, dateUuid: dateId, ticketIds: selected }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPlaceError(data.error ?? "Kon de rolstoelplaats niet aanmaken. Probeer opnieuw.");
        return;
      }
      await refreshSeats();
      setSelected([]);
    } catch {
      setPlaceError("Kon de rolstoelplaats niet aanmaken. Probeer opnieuw.");
    } finally {
      setPlaceBusy(false);
    }
  }

  async function handleRevertPlace() {
    if (!selectedGroupId) return;
    const memberCount = groupMembers(index, selectedGroupId).length;

    const confirmed = window.confirm(
      `Rolstoelplaats ${placeLabel(selectedGroupId)} terugzetten naar ${memberCount} gewone ` +
        `stoel${memberCount === 1 ? "" : "en"}?`
    );
    if (!confirmed) return;

    setPlaceBusy(true);
    setPlaceError(null);
    try {
      const res = await fetch(`/api/tickets/admin/wheelchair-places/${selectedGroupId}/revert`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPlaceError(data.error ?? "Kon de rolstoelplaats niet terugzetten. Probeer opnieuw.");
        return;
      }
      await refreshSeats();
      setSelectedGroupId(null);
    } catch {
      setPlaceError("Kon de rolstoelplaats niet terugzetten. Probeer opnieuw.");
    } finally {
      setPlaceBusy(false);
    }
  }

  /** Take seats out of service, or put them back. Shares `placeBusy` /
   *  `placeError` with the wheelchair actions — same family of admin room
   *  configuration, same busy semantics, two fewer pieces of state. */
  async function handleSeatAvailability(action: "disable" | "enable") {
    if (selected.length === 0) return;

    setPlaceBusy(true);
    setPlaceError(null);
    try {
      const res = await fetch(`/api/tickets/admin/seats/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventUuid: event!.uuid, dateUuid: dateId, ticketIds: selected }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPlaceError(data.error ?? "Kon de stoelen niet aanpassen. Probeer opnieuw.");
        return;
      }
      await refreshSeats();
      setSelected([]);
    } catch {
      setPlaceError("Kon de stoelen niet aanpassen. Probeer opnieuw.");
    } finally {
      setPlaceBusy(false);
    }
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

  // An admin's `selected` can hold ordinary seats, wheelchair anchors and
  // disabled seats at once; a customer's holds only seats, with any place
  // tracked separately.
  const anchorIdSet = anchorIds();
  const disabledIdSet = disabledTicketIds(index);
  const selectedPlaces = selected.filter((id) => anchorIdSet.has(id));
  const selectedDisabled = selected.filter((id) => disabledIdSet.has(id));
  const seatCount = selected.length - selectedPlaces.length - selectedDisabled.length;
  const placeCount = selectedPlaces.length + (wheelchairTicketId ? 1 : 0);

  const selectionParts: string[] = [];
  if (seatCount > 0) selectionParts.push(`${seatCount} seat${seatCount > 1 ? "s" : ""}`);
  if (placeCount > 0)
    selectionParts.push(`${placeCount} rolstoelplaats${placeCount > 1 ? "en" : ""}`);
  if (selectedDisabled.length > 0)
    selectionParts.push(`${selectedDisabled.length} uitgeschakeld`);

  // Converting seats into a place needs ordinary seats only — an anchor means
  // the admin picked an existing place and a disabled seat is not 'available',
  // both of which the server would refuse. Reverting applies to exactly one
  // place and nothing else.
  const canCreatePlace =
    seatCount > 0 && selectedPlaces.length === 0 && selectedDisabled.length === 0;
  const canRevertPlace =
    selectedGroupId !== null && selected.length === 1 && selectedPlaces.length === 1;

  // Disabling and enabling are opposite actions, so a mixed selection offers
  // neither: one button silently acting on a subset of what is highlighted is
  // worse than no button at all.
  //
  // Byte-identical to canCreatePlace above, but coincidentally, not by rule:
  // they answer independent questions (turn a selection into a place vs.
  // take it out of service) that both currently reduce to "plain seats only."
  // If either rule ever diverges, do not merge them into one constant.
  const canDisableSeats =
    seatCount > 0 && selectedPlaces.length === 0 && selectedDisabled.length === 0;
  const canEnableSeats = selected.length > 0 && selectedDisabled.length === selected.length;

  const legend: { color: string; label: string; dim?: boolean }[] = [
    { color: SEAT.available, label: "Selectable" },
    { color: SEAT.available, label: "Not selectable", dim: true },
    { color: SEAT.selected, label: "Selected" },
    { color: SEAT.held, label: "On hold" },
    { color: SEAT.sold, label: "Sold" },
    { color: SEAT.wheelchair, label: "Wheelchair place" },
  ];
  // Described only for the person who can see one.
  if (isAdmin) legend.push({ color: SEAT.disabled, label: "Uitgeschakeld" });

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

      <p className={codeStyles.notice}>
        wil je een rolstoel plaats reserveren, mail naar{" "}
        <a href="mailto:gentlemanproductions.official@gmail.com">
          gentlemanproductions.official@gmail.com
        </a>
        , heb je een code gekregen, geef deze onderaan de pagina in.
      </p>

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
          {legend.map(({ color, label, dim }) => (
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
              {[...ROWS].reverse().map((row) => {
                // Rows render reversed (P at the top), so the row drawn below
                // this one is the previous entry in ROWS.
                const rowIdx = ROWS.indexOf(row);
                const rowAbove = rowIdx < ROWS.length - 1 ? ROWS[rowIdx + 1] : null;
                const rowBelow = rowIdx > 0 ? ROWS[rowIdx - 1] : null;

                const cells = buildRowCells(
                  getRowSeats(row),
                  (n) => groupAt(row, n),
                  (n) => groupAt(rowAbove, n),
                  (n) => groupAt(rowBelow, n),
                );

                return (
                  <div key={row} className={styles.seatRow}>
                    <span className={styles.rowLabel}>{row}</span>
                    {cells.map((cell, idx) => {
                      if (cell.kind === "seat") {
                        // A coordinate the client holds no ticket for — never
                        // provisioned, or 'disabled' and withheld by the API
                        // — gets no tooltip, same as a true aisle gap. The
                        // class stays styles.seat (not styles.seatGap) so the
                        // cell keeps its own reserved dimensions and the row
                        // stays aligned; only the hover affordance changes.
                        const hasTicket =
                          cell.seatNum !== null &&
                          Boolean(ticketsByCoord[`${row}-${cell.seatNum}`]);
                        return (
                          <div
                            key={idx}
                            className={cell.seatNum === null ? styles.seatGap : styles.seat}
                            onClick={() => handleSeatClick(row, cell.seatNum)}
                            title={hasTicket ? `${row}${cell.seatNum}` : ""}
                            style={getSeatStyle(row, cell.seatNum)}
                          />
                        );
                      }

                      // Only the piece holding the anchor gets the mark, so a
                      // place spanning rows still shows exactly one.
                      const hasAnchor = cell.seatNums.some(
                        (n) => index.seatMap[`${row}-${n}`]?.seat_kind === "wheelchair",
                      );
                      return (
                        <div
                          key={idx}
                          className={styles.placeSeat}
                          onClick={() => handlePlaceClick(cell.groupId)}
                          onMouseEnter={() => setHoverGroup(cell.groupId)}
                          onMouseLeave={() => setHoverGroup(null)}
                          title={`Rolstoelplaats ${placeLabel(cell.groupId)}`}
                          style={getPlaceCellStyle(cell)}
                        >
                          {hasAnchor && (
                            <span className={styles.wheelchairGlyph} aria-hidden="true">&#9855;</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
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

      {isAdmin && <AdminCodeGenerator eventUuid={event.uuid} />}

      <CodeEntryPanel
        applied={codes.applied}
        error={codes.error}
        busy={codes.busy}
        onApply={codes.apply}
        onRemove={codes.remove}
      />

      <div className={styles.bottomBar}>
        <div className={styles.bottomBarInfo}>
          <div className={styles.selectionCount}>
            {selectionParts.length === 0
              ? "No seats selected"
              : `${selectionParts.join(" + ")} selected`}
          </div>
          {(selected.length > 0 || wheelchairTicketId) && (
            <div className={styles.priceLine}>
              €{price.toFixed(2)} per seat
              {codes.freeCount > 0 && ` · ${codes.freeCount} gratis`}
            </div>
          )}
        </div>
        <div className={styles.bottomBarActions}>
          {reserveError && <span className={styles.reserveError}>{reserveError}</span>}
          {placeError && <span className={styles.reserveError}>{placeError}</span>}
          {selected.length > 0 && (
            <button
              type="button"
              className={styles.clearBtn}
              onClick={() => setSelected([])}
            >
              Clear
            </button>
          )}
          {isAdmin && canDisableSeats && (
            <button
              type="button"
              className={styles.disableBtn}
              disabled={placeBusy}
              onClick={() => handleSeatAvailability("disable")}
            >
              {placeBusy ? "Bezig…" : "Schakel stoelen uit"}
            </button>
          )}
          {isAdmin && canEnableSeats && (
            <button
              type="button"
              className={styles.enableBtn}
              disabled={placeBusy}
              onClick={() => handleSeatAvailability("enable")}
            >
              {placeBusy ? "Bezig…" : "Schakel stoelen in"}
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              className={styles.reserveBtn}
              disabled={selected.length === 0 || reserving || selectedDisabled.length > 0}
              onClick={handleReserve}
            >
              {reserving ? "Reserving…" : "Reserve for giveaway"}
            </button>
          )}
          {isAdmin && canCreatePlace && (
            <button
              type="button"
              className={styles.placeBtn}
              disabled={placeBusy}
              onClick={handleCreatePlace}
            >
              {placeBusy ? "Bezig…" : "Maak rolstoelplaats"}
            </button>
          )}
          {isAdmin && canRevertPlace && (
            <button
              type="button"
              className={styles.placeRevertBtn}
              disabled={placeBusy}
              onClick={handleRevertPlace}
            >
              {placeBusy ? "Bezig…" : "Zet terug naar gewone stoelen"}
            </button>
          )}
          <button
            type="button"
            className={styles.continueBtn}
            disabled={
              (selected.length === 0 && !wheelchairTicketId) || selectedDisabled.length > 0
            }
            onClick={() => {
              const all = [...selected, ...(wheelchairTicketId ? [wheelchairTicketId] : [])];
              if (all.length === 0) return;
              writeCodes(window.sessionStorage, dateId as string, codes.applied);
              router.push(`/event/${id}/ticket/${dateId}/checkout?tickets=${all.join(",")}`);
            }}
          >
            {selected.length > 0 || wheelchairTicketId ? "Continue →" : "Select seats"}
          </button>
        </div>
      </div>
      </>
      )}
    </div>
  );
}
