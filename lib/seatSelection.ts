import { ROWS, getRowSeats } from "@/lib/venue";
import type { SeatTicket, SeatKind } from "@/types";

export type SeatRef = { row: string; seatNum: number };
type Cell = {
  id: string | null;
  status: string;
  seat_kind: SeatKind;
  wheelchair_group_id: string | null;
  held_until: string | null;
};
export type TicketIndex = { ticketById: Record<string, SeatRef>; seatMap: Record<string, Cell> };

export function buildIndex(tickets: SeatTicket[]): TicketIndex {
  const seatMap: Record<string, Cell> = {};
  const ticketById: Record<string, SeatRef> = {};
  for (const t of tickets) {
    seatMap[`${t.seat.row}-${t.seat.seat_number}`] = {
      id: t.id, status: t.status, seat_kind: t.seat_kind,
      wheelchair_group_id: t.wheelchair_group_id, held_until: t.held_until,
    };
    if (t.id) ticketById[t.id] = { row: t.seat.row, seatNum: t.seat.seat_number };
  }
  return { seatMap, ticketById };
}

export function effectiveStatus(t: SeatTicket): "available" | "held" | "sold" | "wheelchair" | "blocked" {
  // seat_kind wins over status, deliberately. An anchor can legitimately be
  // sold (spec 2), and it must still render as a taken wheelchair place rather
  // than as an ordinary red seat.
  if (t.seat_kind) return t.seat_kind === "wheelchair" ? "wheelchair" : "blocked";
  if (t.status === "held" && t.held_until && new Date(t.held_until) < new Date()) return "available";
  return t.status as "available" | "held" | "sold";
}

// BFS: find the largest connected group of seats, return their ticket IDs
function largestConnected(index: TicketIndex, ids: string[]): string[] {
  if (ids.length === 0) return [];
  const seatToId: Record<string, string> = {};
  for (const id of ids) {
    const s = index.ticketById[id];
    if (s) seatToId[`${s.row}-${s.seatNum}`] = id;
  }
  const unvisited = new Set(Object.keys(seatToId));
  const components: string[][] = [];
  while (unvisited.size > 0) {
    const start = unvisited.values().next().value as string;
    const component: string[] = [];
    const queue = [start];
    unvisited.delete(start);
    while (queue.length > 0) {
      const key = queue.shift() as string;
      component.push(key);
      const di = key.indexOf('-');
      const row = key.substring(0, di);
      const num = parseInt(key.substring(di + 1));
      const ri = ROWS.indexOf(row);
      for (const n of [
        `${row}-${num - 1}`, `${row}-${num + 1}`,
        ri > 0 ? `${ROWS[ri - 1]}-${num}` : null,
        ri < ROWS.length - 1 ? `${ROWS[ri + 1]}-${num}` : null,
      ]) {
        if (n && unvisited.has(n)) { unvisited.delete(n); queue.push(n) }
      }
    }
    components.push(component);
  }
  const best = components.reduce((a, b) => a.length >= b.length ? a : b);
  return best.map(k => seatToId[k]);
}

function getStatus(index: TicketIndex, row: string, seatNum: number | null): string {
  if (seatNum === null) return 'gap';
  const t = index.seatMap[`${row}-${seatNum}`];
  if (!t) return 'gap';
  if (t.seat_kind) return t.seat_kind === 'wheelchair' ? 'wheelchair' : 'blocked';
  if (t.status === 'held' && t.held_until && new Date(t.held_until) < new Date()) return 'available';
  return t.status;
}

// {row: [seatNums sorted]} for current selection
function selectionByRow(index: TicketIndex, selected: string[]): Record<string, number[]> {
  const byRow: Record<string, number[]> = {};
  for (const id of selected) {
    const s = index.ticketById[id];
    if (!s) continue;
    if (!byRow[s.row]) byRow[s.row] = [];
    byRow[s.row].push(s.seatNum);
  }
  for (const r in byRow) byRow[r].sort((a, b) => a - b);
  return byRow;
}

// Place `count` consecutive available seats in `row` starting at `startSeat`
function placeSeats(index: TicketIndex, row: string, startSeat: number, count: number): SeatRef[] {
  const rowSeats = getRowSeats(row).filter((s): s is number => s !== null);
  const startIdx = rowSeats.indexOf(startSeat);
  if (startIdx === -1) return [];
  const result: SeatRef[] = [];
  for (let i = startIdx; i < rowSeats.length && result.length < count; i++) {
    const s = rowSeats[i];
    if (result.length > 0 && s !== result[result.length - 1].seatNum + 1) break;
    if (getStatus(index, row, s) !== 'available') break;
    result.push({ row, seatNum: s });
  }
  return result;
}

export function isSelectable(index: TicketIndex, selected: string[], multiRow: boolean, row: string, seatNum: number, isAdmin = false): boolean {
  const status = getStatus(index, row, seatNum);
  if (status === 'sold' || status === 'held' || status === 'wheelchair' || status === 'blocked') return false;

  const ticketId = index.seatMap[`${row}-${seatNum}`]?.id;
  if (ticketId && selected.includes(ticketId)) return true;

  if (status !== 'available') return false;
  if (isAdmin) return true;
  if (selected.length === 0) return true;

  const byRow = selectionByRow(index, selected);
  const selRows = Object.keys(byRow).sort((a, b) => ROWS.indexOf(a) - ROWS.indexOf(b));
  const minRowIdx = ROWS.indexOf(selRows[0]);
  const maxRowIdx = ROWS.indexOf(selRows[selRows.length - 1]);
  const ri = ROWS.indexOf(row);

  if (!multiRow) {
    if (row !== selRows[0]) return false;
    const nums = byRow[row];
    return seatNum === nums[0] - 1 || seatNum === nums[nums.length - 1] + 1;
  }

  if (byRow[row]) {
    const nums = byRow[row];
    return seatNum === nums[0] - 1 || seatNum === nums[nums.length - 1] + 1;
  }

  if (ri === minRowIdx - 1 || ri === maxRowIdx + 1) {
    const borderingRow = ri === minRowIdx - 1 ? selRows[0] : selRows[selRows.length - 1];
    const bNums = byRow[borderingRow];
    return seatNum >= bNums[0] - 1 && seatNum <= bNums[bNums.length - 1] + 1;
  }

  return false;
}

export function toggleSeat(index: TicketIndex, selected: string[], multiRow: boolean, row: string, seatNum: number, isAdmin = false): string[] {
  const ticket = index.seatMap[`${row}-${seatNum}`];
  if (!ticket || !ticket.id || !isSelectable(index, selected, multiRow, row, seatNum, isAdmin)) return selected;

  const ticketId = ticket.id;

  if (isAdmin) {
    return selected.includes(ticketId)
      ? selected.filter((id) => id !== ticketId)
      : [...selected, ticketId];
  }

  const byRow = selectionByRow(index, selected);
  const selRows = Object.keys(byRow).sort((a, b) => ROWS.indexOf(a) - ROWS.indexOf(b));
  const minRowIdx = selRows.length ? ROWS.indexOf(selRows[0]) : -1;
  const maxRowIdx = selRows.length ? ROWS.indexOf(selRows[selRows.length - 1]) : -1;
  const ri = ROWS.indexOf(row);

  // DESELECT: trim shorter side, then drop any newly disconnected seats
  if (selected.includes(ticketId)) {
    const rowNums = byRow[row] || [];
    const idx = rowNums.indexOf(seatNum);
    const left = rowNums.slice(0, idx);
    const right = rowNums.slice(idx + 1);
    const keep = left.length <= right.length ? right : left;
    const keptIds = keep.map(n => index.seatMap[`${row}-${n}`]?.id).filter((v): v is string => Boolean(v));
    const otherIds = selected.filter(id => index.ticketById[id]?.row !== row);
    return largestConnected(index, [...otherIds, ...keptIds]);
  }

  if (selected.length === 0) return [ticketId];

  // SINGLE ROW: extend or move
  if (!multiRow) {
    const nums = byRow[selRows[0]];
    if (row === selRows[0] && (seatNum === nums[0] - 1 || seatNum === nums[nums.length - 1] + 1)) {
      return [...selected, ticketId];
    } else {
      const newSeats = placeSeats(index, row, seatNum, selected.length);
      return newSeats.map(({ row: r, seatNum: s }) => index.seatMap[`${r}-${s}`]?.id).filter((v): v is string => Boolean(v));
    }
  }

  // MULTI ROW: extend within existing row or add new adjacent row
  if (byRow[row]) {
    const nums = byRow[row];
    if (seatNum === nums[0] - 1 || seatNum === nums[nums.length - 1] + 1)
      return [...selected, ticketId];
  } else if (ri === minRowIdx - 1 || ri === maxRowIdx + 1) {
    return [...selected, ticketId];
  }

  return selected;
}

/**
 * Every seat belonging to one wheelchair place, ordered by row then seat.
 *
 * Resolved through `seatMap` (keyed by coordinate) rather than `ticketById`,
 * because floor seats have no ticket id — the seats API withholds it for any
 * row that is not 'available'. On a multi-row place most members are floor
 * seats, so an id-based lookup would find almost nothing.
 */
export function groupMembers(index: TicketIndex, groupId: string): SeatRef[] {
  const out: SeatRef[] = [];
  for (const key in index.seatMap) {
    if (index.seatMap[key].wheelchair_group_id !== groupId) continue;
    const di = key.indexOf('-');
    out.push({ row: key.substring(0, di), seatNum: parseInt(key.substring(di + 1)) });
  }
  return out.sort((a, b) =>
    a.row === b.row ? a.seatNum - b.seatNum : ROWS.indexOf(a.row) - ROWS.indexOf(b.row));
}
