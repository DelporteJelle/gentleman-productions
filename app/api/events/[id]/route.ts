import { Event } from "@/types";
import { NextResponse } from "next/server";
import mockdata from '@/mockdata/events.json';



export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.pathname.split("/").pop();

  if (id) {
    const event = mockdata.find((event) => event.uuid === id);
    if (event) {
      return NextResponse.json(event);
    } else {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
  }

  return NextResponse.json({ error: "ID is required" }, { status: 400 });
}
