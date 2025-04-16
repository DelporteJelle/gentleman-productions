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
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type"); // Filter by post_type
  const page = parseInt(searchParams.get("page") || "1", 10); // Pagination
  const limit = parseInt(searchParams.get("limit") || "10", 10); // Items per page

  try {
    const oneWeekInMs = 7 * 24 * 60 * 60 * 1000; // 1 week in milliseconds
    const storageKey = `posts_${type || "all"}_page_${page}_limit_${limit}`;

    // Check if data is already stored in the in-memory cache and not expired
    const storedData = getWithExpiry(storageKey);

    if (storedData) {
      console.log("Returning posts from in-memory cache");
      return NextResponse.json(storedData);
    }

    // Base query to fetch events
    let query = sql`
      SELECT 
        posts.created_at AS post_created_at,
        events.*
      FROM posts
      JOIN events ON posts.post_uuid = events.uuid
    `;

    // Apply filter if a specific post_type is provided
    if (type) {
      query = sql`
        ${query}
        WHERE events.post_type = ${type}
      `;
    }

    // Add ordering, pagination, and limits
    query = sql`
      ${query}
      ORDER BY posts.created_at DESC
      LIMIT ${limit} OFFSET ${(page - 1) * limit}
    `;

    // Execute the query
    const posts = await query;

    // Get the total count of events
    const totalQuery = type
      ? sql`SELECT COUNT(*) FROM events WHERE post_type = ${type};`
      : sql`SELECT COUNT(*) FROM events;`;

    const total = await totalQuery;

    const responseData = {
      data: posts,
      total: total[0].count,
      page,
      limit,
    };

    // Store the fetched data in the in-memory cache with a 1-week expiry
    setWithExpiry(storageKey, responseData, oneWeekInMs);

    console.log("Returning posts from database");
    return NextResponse.json(responseData);
  } catch (error) {
    console.error("Error fetching events:", error);
    return NextResponse.json(
      { error: "Failed to fetch events" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const sql = neon(process.env.DATABASE_URL!);

  try {
    const { searchParams } = new URL(request.url);
    const uuid = searchParams.get("uuid");

    if (!uuid) {
      return NextResponse.json(
        { error: "Missing 'uuid' parameter" },
        { status: 400 },
      );
    }

    // Delete the post (and cascade delete the linked event due to ON DELETE CASCADE)
    await sql`
      DELETE FROM posts
      WHERE post_uuid = ${uuid};
    `;

    // Clear the in-memory cache to ensure stale data is not used
    Object.keys(cache).forEach((key) => {
      if (key.startsWith("posts_")) {
        delete cache[key];
      }
    });

    return NextResponse.json(
      { message: "Post and linked entry deleted successfully" },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error deleting post:", error);
    return NextResponse.json(
      { error: "Failed to delete post" },
      { status: 500 },
    );
  }
}
