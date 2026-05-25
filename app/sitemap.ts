import type { MetadataRoute } from "next";
import { fetchAllEventsForSeo, SITE_URL } from "@/lib/server/seo";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const events = await fetchAllEventsForSeo();

  const eventUrls: MetadataRoute.Sitemap = events.map((event) => {
    const dates = event.dates ?? [];
    const latest = dates.length
      ? Math.max(...dates.map((d) => new Date(d.start_time).getTime()))
      : Date.now();
    return {
      url: `${SITE_URL}/event/${event.uuid}`,
      lastModified: new Date(latest),
      changeFrequency: "monthly" as const,
      priority: 0.8,
    };
  });

  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/about`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    ...eventUrls,
  ];
}
