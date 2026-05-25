import { getDb } from "@/lib/server/api";

export interface SeoEvent {
  uuid: string;
  title: string;
  description: string | null;
  display_image: string | null;
  dates: Array<{
    start_time: string;
    end_time: string;
    price?: number;
    external_link?: string;
  }>;
  eventlocation: {
    location?: string;
    city?: string;
    street?: string;
    country?: string;
  } | null;
  tickets_open: boolean;
}

const isAbsoluteUrl = (s: string | null | undefined): s is string =>
  !!s && /^https?:\/\//i.test(s);

export const SITE_URL = "https://gentlemanproductions.be";

export async function fetchEventForSeo(
  uuid: string,
): Promise<SeoEvent | null> {
  try {
    const sql = getDb();
    const rows = await sql`SELECT * FROM events WHERE uuid = ${uuid};`;
    if (!rows.length) return null;
    return rows[0] as unknown as SeoEvent;
  } catch (err) {
    console.error("SEO: failed to fetch event", err);
    return null;
  }
}

export async function fetchAllEventsForSeo(): Promise<SeoEvent[]> {
  try {
    const sql = getDb();
    const rows = await sql`SELECT * FROM events;`;
    return rows as unknown as SeoEvent[];
  } catch (err) {
    console.error("SEO: failed to fetch events", err);
    return [];
  }
}

function getEventDateRange(event: SeoEvent): { start?: Date; end?: Date } {
  if (!event.dates?.length) return {};
  const starts = event.dates.map((d) => new Date(d.start_time).getTime());
  const ends = event.dates.map((d) =>
    new Date(d.end_time || d.start_time).getTime(),
  );
  return {
    start: new Date(Math.min(...starts)),
    end: new Date(Math.max(...ends)),
  };
}

export function isUpcoming(event: SeoEvent): boolean {
  const { end } = getEventDateRange(event);
  if (!end) return false;
  return end.getTime() >= Date.now();
}

export function buildEventJsonLd(event: SeoEvent) {
  const { start, end } = getEventDateRange(event);
  const url = `${SITE_URL}/event/${event.uuid}`;
  const image = isAbsoluteUrl(event.display_image)
    ? event.display_image
    : `${SITE_URL}/GP-name.svg`;

  const place = event.eventlocation
    ? {
        "@type": "Place",
        name:
          event.eventlocation.location ||
          event.eventlocation.city ||
          "Onbekende locatie",
        address: {
          "@type": "PostalAddress",
          streetAddress: event.eventlocation.street || undefined,
          addressLocality: event.eventlocation.city || "Merelbeke",
          addressCountry: event.eventlocation.country || "BE",
        },
      }
    : {
        "@type": "Place",
        name: "Merelbeke",
        address: {
          "@type": "PostalAddress",
          addressLocality: "Merelbeke",
          addressCountry: "BE",
        },
      };

  const offers = event.tickets_open
    ? {
        "@type": "Offer",
        url: `${url}/ticket`,
        availability: "https://schema.org/InStock",
        priceCurrency: "EUR",
        price: event.dates?.[0]?.price ?? 0,
      }
    : undefined;

  return {
    "@context": "https://schema.org",
    "@type": "TheaterEvent",
    name: event.title,
    description: event.description || undefined,
    startDate: start?.toISOString(),
    endDate: end?.toISOString(),
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: place,
    image: [image],
    url,
    organizer: {
      "@type": "PerformingGroup",
      name: "Gentleman Productions",
      url: SITE_URL,
    },
    performer: {
      "@type": "PerformingGroup",
      name: "Gentleman Productions",
    },
    offers,
  };
}
