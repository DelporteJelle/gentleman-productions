// ============================================================================
// Database Object Types
// ============================================================================

/**
 * Base interface for all database objects
 */
export interface DbObject {
  uuid: string;
  created_at: string;
  updated_at?: string;
  created_by?: string;
}

/**
 * Enum for different types of posts
 * Add new post types here as the application grows
 */
export enum DbObjectType {
  EVENT = "EVENT",
  BASIC_POST = "BASIC_POST",
}

// ============================================================================
// Post Types
// ============================================================================

/**
 * Base interface for all post types
 * All specific post types (Event, Article, etc.) should extend this
 */
export interface Post extends DbObject {
  title: string;
  post_type: DbObjectType;
  description: string;
}

/**
 * Production theme customization for events
 */
export interface ProductionTheme {
  accent1?: string;
  accent2?: string;
  bg?: string;
  tagline?: string;
}

/**
 * Event post type - extends Post with event-specific fields
 */
export interface Event extends Post {
  post_type: DbObjectType.EVENT;
  display_image: string;
  images?: string[];
  dates: EventDateEntry[];
  eventlocation?: EventLocation;
  tickets_open?: boolean;
  production_theme?: ProductionTheme;
}

/**
 * Basic post type - a simple post with an image, title, optional description and optional link
 */
export interface BasicPost extends Post {
  post_type: DbObjectType.BASIC_POST;
  display_image: string;
  link?: string;
  link_text?: string;
  date?: string;
  location?: string;
}

/**
 * Location details for an event
 */
export interface EventLocation {
  country: string;
  city: string;
  street: string;
  location?: string; // Venue name
}

/**
 * Single date entry for an event (events can have multiple dates)
 */
export interface EventDateEntry {
  uuid: string;
  start_time: string; // ISO date string
  end_time: string; // ISO date string
  timeLine: TimeLineEntry[];
  price?: number; // undefined if free
}

/**
 * Timeline entry within an event date
 */
export interface TimeLineEntry {
  time: string;
  description: string;
}

// ============================================================================
// Highlight Types
// ============================================================================

/**
 * Highlighted event reference - links to a post to feature it
 */
export interface EventHighlight {
  uuid: string;
  event_uuid: string;
  valid_date: string;
}

/**
 * Highlighted event with full event data (returned from API)
 */
export interface HighlightedEvent extends Event {
  valid_date: string;
}

/**
 * Highlighted post - can be an event or a basic post
 */
export type HighlightedPost = (Event | BasicPost) & { valid_date: string };

// ============================================================================
// About Page Types
// ============================================================================

/**
 * Team member profile
 */
export interface TeamMember extends DbObject {
  member_name: string;
  member_role: string;
  image?: string;
  email?: string;
  linkedin?: string;
  instagram?: string;
  facebook?: string;
  twitter?: string;
  website?: string;
}

/**
 * Partner/sponsor organization
 */
export interface Partner extends DbObject {
  partner_name: string;
  logo: string;
  description: string;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Generic API response with pagination
 */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Type guard to check if a post is an Event
 */
export function isEvent(post: Post): post is Event {
  return post.post_type === DbObjectType.EVENT;
}

/**
 * Type guard to check if a post is a BasicPost
 */
export function isBasicPost(post: Post): post is BasicPost {
  return post.post_type === DbObjectType.BASIC_POST;
}

/**
 * Create a new UUID - utility for creating new objects
 */
export function createUUID(): string {
  return crypto.randomUUID();
}

// ============================================================================
// Ticketing Types
// ============================================================================

export type TicketStatus = "available" | "held" | "sold";

export interface SeatTicket {
  /** null when the seat is not purchasable — the API withholds ids for sold/held seats. */
  id: string | null;
  status: TicketStatus;
  held_until: string | null;
  seat: { id: string; row: string; seat_number: number; reserved_for: string | null };
}

export interface Order {
  id: string;
  event_uuid: string;
  date_uuid: string;
  customer_name: string;
  customer_email: string;
  total_amount: number;
  status: "pending" | "paid" | "cancelled";
  mollie_payment_id: string | null;
  /** Set at checkout and re-stamped on every resume; null on rows predating the column. */
  payment_started_at: string | null;
  reserved_by_admin: boolean;
  created_at: string;
}
