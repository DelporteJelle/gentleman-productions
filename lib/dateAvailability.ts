import type { Event, EventDateEntry } from "@/types";

/**
 * Sales are controlled per date, but the customer UI needs the same rule the
 * server enforces — hence a client-safe module rather than `lib/server/`.
 */

export const DEFAULT_CLOSED_MESSAGE = "Tickets nog niet beschikbaar";

/**
 * The per-date switch, falling back to the event-level flag for dates written
 * before per-date sales existed. Those dates carry no `tickets_open` of their
 * own, so the old event-wide boolean stays their source of truth until an admin
 * next saves the event.
 */
export function isDateTicketsOpen(event: Event, date: EventDateEntry): boolean {
  return (date.tickets_open ?? event.tickets_open ?? false) === true;
}

/**
 * A date is on sale only when its sales switch is on and it carries a numeric
 * price. Written as a type predicate so callers that go on to charge for the
 * date (checkout) get `price: number` without re-checking.
 */
export function isDateOpen(
  event: Event,
  date: EventDateEntry,
): date is EventDateEntry & { price: number } {
  return isDateTicketsOpen(event, date) && typeof date.price === "number";
}

/** The message shown over a closed date, with a generic fallback. */
export function closedMessageFor(date: EventDateEntry): string {
  return date.closed_message?.trim() || DEFAULT_CLOSED_MESSAGE;
}
