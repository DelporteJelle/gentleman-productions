import type { Metadata } from "next";
import HomeClient from "./HomeClient";
import {
  fetchAllEventsForSeo,
  isUpcoming,
  buildEventJsonLd,
  SITE_URL,
} from "@/lib/server/seo";

const HOME_DESCRIPTION =
  "Gentleman Productions is een dans- en theaterproductiehuis uit Merelbeke. Ontdek onze komende voorstellingen en het verhaal achter onze jaarlijkse productie.";

export const metadata: Metadata = {
  title: "Gentleman Productions — Dans- & theaterproductie in Merelbeke",
  description: HOME_DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    title: "Gentleman Productions — Dans- & theaterproductie in Merelbeke",
    description: HOME_DESCRIPTION,
    url: SITE_URL,
    type: "website",
  },
};

export const revalidate = 3600;

export default async function Page() {
  const events = await fetchAllEventsForSeo();
  const upcoming = events.filter(isUpcoming);
  const eventJsonLd = upcoming.map(buildEventJsonLd);

  return (
    <>
      {eventJsonLd.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(eventJsonLd),
          }}
        />
      )}
      <HomeClient />
    </>
  );
}
