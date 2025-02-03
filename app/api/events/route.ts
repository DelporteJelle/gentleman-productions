import { Event } from "@/types";
import { NextResponse } from "next/server";
import mockdata from '@/mockdata/events.json';


export async function GET() {
  return NextResponse.json(mockdata);
}
