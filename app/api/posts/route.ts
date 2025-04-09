import { NextResponse } from "next/server";
import mockdata from "@/mockdata/events.json";

// Mock database
const mockDb = mockdata;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type"); // Filter by type
  const page = parseInt(searchParams.get("page") || "1", 10); // Pagination
  const limit = parseInt(searchParams.get("limit") || "10", 10); // Items per page

  let filteredPosts = mockDb;

  // Filter by type if provided
  if (type) {
    filteredPosts = filteredPosts.filter((post) => post.type === type);
  }

  // Pagination logic
  const startIndex = (page - 1) * limit;
  const paginatedPosts = filteredPosts.slice(startIndex, startIndex + limit);

  return NextResponse.json({
    data: paginatedPosts,
    total: filteredPosts.length,
    page,
    limit,
  });
}
