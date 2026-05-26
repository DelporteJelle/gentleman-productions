import type { Metadata } from "next";
import EventClient from "./EventClient";
import {
  fetchEventForSeo,
  buildEventJsonLd,
  SITE_URL,
} from "@/lib/server/seo";

export const revalidate = 3600;

type RouteParams = { params: Promise<{ id: string }> };

function plainDescription(raw: string | null | undefined, max = 160): string {
  if (!raw) return "";
  const collapsed = raw.replace(/\s+/g, " ").trim();
  if (collapsed.length <= max) return collapsed;
  return collapsed.slice(0, max - 1).trimEnd() + "…";
}

function dateRangeLabel(
  dates: Array<{ start_time: string; end_time: string }> | undefined,
): string {
  if (!dates?.length) return "";
  const sorted = [...dates].sort(
    (a, b) =>
      new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
  );
  const fmt = (s: string) =>
    new Date(s).toLocaleDateString("nl-BE", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  const first = fmt(sorted[0].start_time);
  const last = fmt(sorted[sorted.length - 1].start_time);
  return first === last ? first : `${first} — ${last}`;
}

export async function generateMetadata({
  params,
}: RouteParams): Promise<Metadata> {
  const { id } = await params;
  const event = await fetchEventForSeo(id);

  if (!event) {
    return {
      title: "Voorstelling niet gevonden",
      robots: { index: false, follow: false },
    };
  }

  const venue =
    event.eventlocation?.location || event.eventlocation?.city || "Merelbeke";
  const dateLabel = dateRangeLabel(event.dates);
  const description =
    plainDescription(event.description) ||
    `Dans- en theatervoorstelling van Gentleman Productions${dateLabel ? ` op ${dateLabel}` : ""}${venue ? ` in ${venue}` : ""}.`;

  const ogImage =
    event.display_image && /^https?:\/\//.test(event.display_image)
      ? event.display_image
      : `${SITE_URL}/GP-name.svg`;

  return {
    title: event.title,
    description,
    alternates: { canonical: `/event/${id}` },
    openGraph: {
      title: `${event.title} — Gentleman Productions`,
      description,
      url: `${SITE_URL}/event/${id}`,
      type: "article",
      images: [{ url: ogImage, alt: event.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${event.title} — Gentleman Productions`,
      description,
      images: [ogImage],
    },
  };
}

export default async function EventPage({ params }: RouteParams) {
  const { id } = await params;
  const event = await fetchEventForSeo(id);

  return (
    <>
      {event && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(buildEventJsonLd(event)),
          }}
        />
      )}
      <EventClient />
    </>
  );
}
