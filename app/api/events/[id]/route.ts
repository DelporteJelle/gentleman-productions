import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

// In-memory cache
const cache: { [key: string]: { value: any; expiry: number } } = {};

// Utility functions for in-memory cache with expiry
function setWithExpiry(key: string, value: any, ttl: number) {
  const now = new Date();
  cache[key] = {
    value: value,
    expiry: now.getTime() + ttl, // Current time + time-to-live (in milliseconds)
  };
}

function getWithExpiry(key: string) {
  const cachedItem = cache[key];
  if (!cachedItem) {
    return null;
  }

  const now = new Date();

  // Check if the item has expired
  if (now.getTime() > cachedItem.expiry) {
    delete cache[key]; // Remove expired item
    return null;
  }

  return cachedItem.value;
}

export async function GET(request: Request) {
  const sql = neon(process.env.DATABASE_URL!);
  const url = new URL(request.url);
  const id = url.pathname.split("/").pop();

  if (!id) {
    return NextResponse.json({ error: "ID is required" }, { status: 400 });
  }

  try {
    const cacheKey = `event_${id}`;
    const oneWeekInMs = 7 * 24 * 60 * 60 * 1000; // 1 week in milliseconds

    // Check if the event is already in the cache
    const cachedEvent = getWithExpiry(cacheKey);
    if (cachedEvent) {
      console.log("Returning event from in-memory cache");
      return NextResponse.json(cachedEvent);
    }

    // Fetch the event from the database
    const event = await sql`
      SELECT * FROM events WHERE uuid = ${id};
    `;

    if (event.length > 0) {
      // Store the fetched event in the cache with a 1-week expiry
      setWithExpiry(cacheKey, event[0], oneWeekInMs);

      console.log("Returning event from database");
      return NextResponse.json(event[0]);
    } else {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
  } catch (error) {
    console.error("Error fetching event:", error);
    return NextResponse.json(
      { error: "Failed to fetch event" },
      { status: 500 },
    );
  }
}
