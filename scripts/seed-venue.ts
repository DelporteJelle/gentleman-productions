import { neon } from "@neondatabase/serverless";
import { venueSeats } from "../lib/venue";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const seats = venueSeats();
  for (const s of seats) {
    await sql`
      INSERT INTO seats ("row", seat_number, reserved_for)
      VALUES (${s.row}, ${s.seat_number}, ${s.reserved_for})
      ON CONFLICT ("row", seat_number) DO UPDATE SET reserved_for = EXCLUDED.reserved_for;
    `;
  }
  console.log(`Seeded ${seats.length} seats.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
