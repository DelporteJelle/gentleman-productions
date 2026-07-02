import { getDb, jsonResponse, errorResponse, getPathId } from "@/lib/server/api";

export async function GET(request: Request) {
  const id = getPathId(request);
  if (!id) return errorResponse("ID is required", 400);
  const sql = getDb();
  const rows = await sql`SELECT * FROM orders WHERE id = ${id};`;
  if (rows.length === 0) return errorResponse("Order not found", 404);
  return jsonResponse(rows[0]);
}
