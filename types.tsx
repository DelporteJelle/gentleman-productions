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
  /**
   * Derived roll-up: true when at least one date is on sale. Sales are
   * controlled per date (`EventDateEntry.tickets_open`); this is written by the
   * admin form so event-level surfaces (home-page CTA, SEO) have one field to
   * read, and it doubles as the fallback for dates predating per-date sales.
   */
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
  /**
   * Per-date sales switch. `undefined` on dates written before per-date sales
   * existed — those fall back to the event-level `tickets_open`.
   */
  tickets_open?: boolean;
  /** Shown over the greyed-out card while this date is closed. */
  closed_message?: string;
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

export type TicketStatus = "available" | "held" | "sold" | "blocked" | "disabled";

/**
 * What a ticket IS, independent of what state it is in.
 * - null               — an ordinary seat.
 * - 'wheelchair'       — the single sellable ticket of a wheelchair place.
 * - 'wheelchair_floor' — a seat the place's footprint covers; never sellable.
 */
export type SeatKind = "wheelchair" | "wheelchair_floor" | null;

export interface SeatTicket {
  /**
   * The id to act on this row with, or null if there is nothing to act on.
   *
   * For every caller: present for 'available', and for a 'held' row whose
   * hold has lapsed (`held_until` in the past) — both genuinely free right
   * now. Null for 'sold', 'blocked', and a live hold.
   *
   * For an admin specifically: also present for 'disabled', so the row can
   * be re-enabled. A non-admin never sees a 'disabled' row at all — the API
   * omits it from the response entirely rather than sending it id-less.
   */
  id: string | null;
  status: TicketStatus;
  held_until: string | null;
  seat_kind: SeatKind;
  /** Shared by every member of one wheelchair place; null for ordinary seats. */
  wheelchair_group_id: string | null;
  seat: { id: string; row: string; seat_number: number };
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

export interface OrderViewBase {
  orderId: string;
  eventUuid: string;
  dateUuid: string;
  eventTitle: string;
  startTime: string | null;
  /** e.g. ["A1", "A2"] — the seats this order currently holds or has sold. */
  seatLabels: string[];
  /** Integer cents, as stored on the order. */
  totalAmount: number;
}

export type OrderView =
  | (OrderViewBase & { state: "pending"; resumable: boolean; expiresAt: string })
  | (OrderViewBase & { state: "paid"; hasTickets: boolean })
  | (OrderViewBase & { state: "cancelled" });

/** One order this browser created. Durable user data, not a cache. */
export interface SavedOrder {
  orderId: string;
  eventUuid: string;
  dateUuid: string;
  eventTitle: string;
  startTime: string | null;
  seatLabels: string[];
  email: string;
  savedAt: string;
  lastKnownStatus: "pending" | "paid" | "cancelled";
  /** When lastKnownStatus last changed — the clock the cancelled prune measures from. */
  statusChangedAt: string;
}
