import { NextResponse } from "next/server";
import partners from "@/mockdata/partners.json";

export async function GET() {
  return NextResponse.json(partners);
}
