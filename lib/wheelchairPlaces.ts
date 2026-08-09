import { ROWS } from "@/lib/venue";

/**
 * Pure helpers for wheelchair places, shared by the browser and the API
 * routes. Kept out of `lib/server/` deliberately: the seat map needs the label
 * for its confirm dialog and revert button, and `lib/server/*` modules pull in
 * the Neon driver.
 */

export interface PlaceSeat {
  row: string;
  seat_number: number;
}

/** Unknown rows sort last, never first — a bogus row must not win the anchor. */
function rowIndex(row: string): number {
  const i = ROWS.indexOf(row);
  return i === -1 ? Number.MAX_SAFE_INTEGER : i;
}

function compareSeats(a: PlaceSeat, b: PlaceSeat): number {
  const ra = rowIndex(a.row);
  const rb = rowIndex(b.row);
  return ra === rb ? a.seat_number - b.seat_number : ra - rb;
}

/**
 * The one member of a place that becomes the sellable ticket: lowest row in
 * venue order, then lowest seat number. Deterministic regardless of the order
 * the database returned the claimed rows in, and stable across rows so a place
 * spanning D and E always anchors in D.
 */
export function pickAnchor<T extends PlaceSeat>(members: T[]): T | null {
  if (members.length === 0) return null;
  return [...members].sort(compareSeats)[0];
}

/**
 * Human label for a place, derived from its members — there is no label
 * column. Members are grouped by row, each row collapsed into contiguous
 * ranges, rows joined in venue order:
 *   D1–D9              a single-row place
 *   D1–D4 · E1–E4      a place spanning rows
 *   D1–D2, D7          a scattered place
 */
export function formatPlaceLabel(members: PlaceSeat[]): string {
  if (members.length === 0) return "";

  const byRow = new Map<string, number[]>();
  for (const m of members) {
    const list = byRow.get(m.row);
    if (list) list.push(m.seat_number);
    else byRow.set(m.row, [m.seat_number]);
  }

  const rows = [...byRow.keys()].sort((a, b) => rowIndex(a) - rowIndex(b));

  return rows
    .map((row) => {
      const nums = [...new Set(byRow.get(row)!)].sort((a, b) => a - b);
      const ranges: string[] = [];
      let start = nums[0];
      let prev = nums[0];
      for (let i = 1; i < nums.length; i++) {
        if (nums[i] !== prev + 1) {
          ranges.push(start === prev ? `${row}${start}` : `${row}${start}–${row}${prev}`);
          start = nums[i];
        }
        prev = nums[i];
      }
      ranges.push(start === prev ? `${row}${start}` : `${row}${start}–${row}${prev}`);
      return ranges.join(", ");
    })
    .join(" · ");
}

/** An ordinary seat, or an aisle gap when seatNum is null. */
export interface SeatCell {
  kind: "seat";
  seatNum: number | null;
}

/**
 * One drawn piece of a wheelchair place: a horizontal run of its members,
 * possibly split where the place's shape changes vertically.
 */
export interface PlaceCell {
  kind: "place";
  groupId: string;
  seatNums: number[];
  /** The same place occupies every one of these columns in the row above/below. */
  continuesUp: boolean;
  continuesDown: boolean;
  /** Leftmost / rightmost piece of its horizontal run. */
  isRunStart: boolean;
  isRunEnd: boolean;
}

export type RowCell = SeatCell | PlaceCell;

type GroupLookup = (seatNum: number) => string | null;

/**
 * Lay out one row as drawable cells, collapsing each wheelchair place into as
 * few pieces as possible so it reads as a single seat rather than a line of
 * them.
 *
 * Two rules shape the result:
 *
 * A run breaks at anything that is not the same place — an ordinary seat, an
 * aisle gap, another place. A scattered place must never swallow the on-sale
 * seat between two of its members, which would make that seat invisible and
 * unclickable.
 *
 * A run is then split wherever its vertical continuation changes, so the drawn
 * shape is the largest one that stays inside the place's own seats. Given
 * E1–E9 sitting above D1–D4, the E run splits into E1–E4 (which bridges the
 * row gap down to D) and E5–E9 (which must not, because the 4px beneath it
 * fronts ordinary seats).
 */
export function buildRowCells(
  seatNums: (number | null)[],
  groupOf: GroupLookup,
  groupAbove: GroupLookup,
  groupBelow: GroupLookup,
): RowCell[] {
  const out: RowCell[] = [];
  let i = 0;

  while (i < seatNums.length) {
    const seatNum = seatNums[i];
    const groupId = seatNum === null ? null : groupOf(seatNum);

    if (seatNum === null || groupId === null) {
      out.push({ kind: "seat", seatNum });
      i++;
      continue;
    }

    // Maximal horizontal run of this place.
    let runEnd = i;
    while (runEnd + 1 < seatNums.length) {
      const next = seatNums[runEnd + 1];
      if (next === null || groupOf(next) !== groupId) break;
      runEnd++;
    }

    // Split it wherever (continuesUp, continuesDown) changes.
    let segStart = i;
    while (segStart <= runEnd) {
      const first = seatNums[segStart] as number;
      const continuesUp = groupAbove(first) === groupId;
      const continuesDown = groupBelow(first) === groupId;

      let segEnd = segStart;
      while (segEnd + 1 <= runEnd) {
        const next = seatNums[segEnd + 1] as number;
        if ((groupAbove(next) === groupId) !== continuesUp) break;
        if ((groupBelow(next) === groupId) !== continuesDown) break;
        segEnd++;
      }

      out.push({
        kind: "place",
        groupId,
        seatNums: seatNums.slice(segStart, segEnd + 1) as number[],
        continuesUp,
        continuesDown,
        isRunStart: segStart === i,
        isRunEnd: segEnd === runEnd,
      });
      segStart = segEnd + 1;
    }

    i = runEnd + 1;
  }

  return out;
}

/**
 * How many seat-widths and gap-widths a piece's width must cover.
 *
 * A piece that is not the end of its run also swallows the flex gap that would
 * otherwise show as a transparent stripe through the middle of the place. The
 * caller pairs that extra gap with a negative right margin of the same size,
 * so the run's total footprint still comes to exactly n seats + (n-1) gaps —
 * identical to the individual seats it replaced, which is what keeps it from
 * encroaching on its neighbours.
 */
export function segmentSpan(span: number, isRunEnd: boolean): { seats: number; gaps: number } {
  return { seats: span, gaps: span - 1 + (isRunEnd ? 0 : 1) };
}
