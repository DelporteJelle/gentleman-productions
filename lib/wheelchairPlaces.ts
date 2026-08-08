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

export interface RowCell {
  /**
   * Seat numbers this cell covers, in row order. One element for an ordinary
   * seat or an aisle gap (whose seatNum is null); several for a run of one
   * wheelchair place's members.
   */
  seatNums: (number | null)[];
  /** Non-null when this cell is a run belonging to that wheelchair place. */
  groupId: string | null;
}

/**
 * Collapse consecutive members of the same wheelchair place into single cells,
 * so a place draws as one solid seat rather than a line of separate ones.
 *
 * A run breaks at anything that is not the same place: an ordinary seat, an
 * aisle gap, or a different place. That matters — a scattered place must not
 * swallow the on-sale seat sitting between two of its members, which would
 * make that seat invisible and unclickable.
 */
export function mergeRowRuns(
  cells: { seatNum: number | null; groupId: string | null }[],
): RowCell[] {
  const out: RowCell[] = [];
  for (const cell of cells) {
    const last = out[out.length - 1];
    if (cell.groupId !== null && last && last.groupId === cell.groupId) {
      last.seatNums.push(cell.seatNum);
    } else {
      out.push({ seatNums: [cell.seatNum], groupId: cell.groupId });
    }
  }
  return out;
}
