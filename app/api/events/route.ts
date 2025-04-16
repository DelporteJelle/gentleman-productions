import { Event } from "@/types";
import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

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

export async function GET() {
  const sql = neon(process.env.DATABASE_URL!);

  try {
    const storageKey = "events_all";
    const oneWeekInMs = 7 * 24 * 60 * 60 * 1000; // 1 week in milliseconds

    // Check if data is already stored in Web Storage and not expired
    const storedData = getWithExpiry(storageKey);

    if (storedData) {
      console.log("Returning events from Web Storage");
      return NextResponse.json(storedData);
    }

    // Fetch events from the database
    const events = await sql`
      SELECT * FROM events;
    `;

    // Store the fetched data in Web Storage with a 1-week expiry
    setWithExpiry(storageKey, events, oneWeekInMs);

    console.log("Returning events from database");
    return NextResponse.json(events);
  } catch (error) {
    console.error("Error fetching events:", error);
    return NextResponse.json(
      { error: "Failed to fetch events" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  console.log("Creating event in database");

  const sql = neon(process.env.DATABASE_URL!);

  try {
    const body: Event = await request.json();

    // Insert a new post into the posts table
    await sql`
      INSERT INTO posts (
        post_uuid,
        created_at
      ) VALUES (
        ${body.uuid},
        ${body.created_at || new Date().toISOString()}
      );
    `;

    // Insert a new event into the events table
    await sql`
      INSERT INTO events (
        created_at,
        updated_at,
        created_by,
        uuid,
        title,
        post_type,
        description,
        display_image,
        images,
        eventLocation,
        dates
      ) VALUES (
        ${body.created_at || new Date().toISOString()},
        ${body.updated_at || null},
        ${body.created_by || null},
        ${body.uuid},
        ${body.title},
        ${body.post_type},
        ${body.description},
        ${body.display_image},
        ${body.images},
        ${JSON.stringify(body.eventlocation)},
        ${JSON.stringify(body.dates)}
      );
    `;

    const storageKey = "events_all";
    delete cache[storageKey];

    // Clear Web Storage to ensure stale data is not used
    if (typeof window !== "undefined") {
      localStorage.removeItem("events_all");
    }

    return NextResponse.json(
      { message: "Event created successfully" },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error creating event:", error);
    return NextResponse.json(
      { error: "Failed to create event" },
      { status: 500 },
    );
  }
}
