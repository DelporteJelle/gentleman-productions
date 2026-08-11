export const ROWS = ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P"];

export function getRowSeats(row: string): (number | null)[] {
  if (row === "P")
    return [
      ...Array.from({ length: 13 }, (_, i) => i + 1),
      null, null, null, null, null, null, null, null, null,
      ...Array.from({ length: 7 }, (_, i) => i + 23),
    ];
  const count = ["A","B","C","D","E"].includes(row) ? 22
    : ["F","G","H","I","J"].includes(row) ? 25
    : ["K","L","M","N","O"].includes(row) ? 27 : 0;
  return Array.from({ length: count }, (_, i) => i + 1);
}

export function venueSeats(): { row: string; seat_number: number }[] {
  const out: { row: string; seat_number: number }[] = [];
  for (const row of ROWS) {
    for (const seat of getRowSeats(row)) {
      if (seat === null) continue;
      out.push({ row, seat_number: seat });
    }
  }
  return out;
}
