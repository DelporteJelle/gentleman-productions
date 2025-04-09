import { NextResponse } from "next/server";
import team from "@/mockdata/team.json";

export async function GET() {
  return NextResponse.json(team);
}
