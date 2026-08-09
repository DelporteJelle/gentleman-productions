import { getDb, jsonResponse, errorResponse, requireRole, parseBody, verifyAuth } from "@/lib/server/api";
import { validateGenerateInput, generateCodes, listCodes } from "@/lib/server/ticketCodes";

export async function GET(request: Request) {
  const authError = requireRole(request, ["ADMIN"]);
  if (authError) return authError;

  try {
    return jsonResponse({ codes: await listCodes(getDb()) });
  } catch (err) {
    console.error("Listing ticket codes failed:", err);
    return errorResponse("Kon de codes niet laden.", 500);
  }
}

export async function POST(request: Request) {
  const authError = requireRole(request, ["ADMIN"]);
  if (authError) return authError;

  try {
    const parsed = validateGenerateInput(await parseBody<unknown>(request));
    if (!parsed.ok) return errorResponse(parsed.error, 400);

    const user = verifyAuth(request);
    const created = await generateCodes(getDb(), parsed.value, user?.username ?? null);
    return jsonResponse({ codes: created });
  } catch (err) {
    console.error("Generating ticket codes failed:", err);
    return errorResponse("Kon de codes niet aanmaken. Probeer opnieuw.", 500);
  }
}
