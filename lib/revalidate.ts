import { revalidatePath, revalidateTag } from "next/cache";

/**
 * Revalidate cached data after updates
 * Call this after creating, updating, or deleting posts/highlights
 */
export function revalidatePostsCache() {
  // Revalidate the home page
  revalidatePath("/");

  // Revalidate API routes
  revalidatePath("/api/posts");
  revalidatePath("/api/highlight");
}

/**
 * Revalidate specific event page
 */
export function revalidateEventCache(eventId: string) {
  revalidatePath(`/event/${eventId}`);
}
