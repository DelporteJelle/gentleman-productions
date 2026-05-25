import "../variables.css";
import "./globals.css";

import type { Metadata, Viewport } from "next";
import { ColorSchemeScript } from "@mantine/core";
import { Analytics } from "@vercel/analytics/next";

import ClientShell from "./ClientShell";

const SITE_URL = "https://gentlemanproductions.be";
const SITE_NAME = "Gentleman Productions";
const SITE_DESCRIPTION =
  "Gentleman Productions is een dans- en theaterproductiehuis uit Merelbeke. Elk jaar brengen we een nieuwe voorstelling die dans, theater en muziek samenbrengt op één podium.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Gentleman Productions — Dans- & theaterproductie in Merelbeke",
    template: "%s — Gentleman Productions",
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "Gentleman Productions",
    "dansproductie",
    "theaterproductie",
    "dansvoorstelling",
    "theatervoorstelling",
    "Merelbeke",
    "Gent",
    "Oost-Vlaanderen",
    "België",
    "dans",
    "theater",
    "podiumkunsten",
    "voorstelling",
  ],
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: "Performing Arts",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "nl_BE",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: "Gentleman Productions — Dans- & theaterproductie in Merelbeke",
    description: SITE_DESCRIPTION,
    images: [
      {
        url: "/GP-name.svg",
        width: 1200,
        height: 630,
        alt: "Gentleman Productions",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Gentleman Productions — Dans- & theaterproductie in Merelbeke",
    description: SITE_DESCRIPTION,
    images: ["/GP-name.svg"],
  },
  icons: {
    icon: "/favicon.ico",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "PerformingGroup",
  name: SITE_NAME,
  alternateName: "GP",
  url: SITE_URL,
  logo: `${SITE_URL}/GP-logo.svg`,
  image: `${SITE_URL}/GP-name.svg`,
  description: SITE_DESCRIPTION,
  email: "gentlemanproductions.official@gmail.com",
  foundingLocation: {
    "@type": "Place",
    address: {
      "@type": "PostalAddress",
      addressLocality: "Merelbeke",
      addressRegion: "Oost-Vlaanderen",
      addressCountry: "BE",
    },
  },
  address: {
    "@type": "PostalAddress",
    addressLocality: "Merelbeke",
    addressRegion: "Oost-Vlaanderen",
    addressCountry: "BE",
  },
  areaServed: {
    "@type": "AdministrativeArea",
    name: "Oost-Vlaanderen, België",
  },
  sameAs: [
    "https://www.instagram.com/gentlemanproductions_official",
    "https://www.facebook.com/gentlemanproductions.official",
    "https://www.tiktok.com/@gentlemanproductions",
  ],
};

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: SITE_URL,
  inLanguage: "nl-BE",
};

const RootLayout: React.FC<React.PropsWithChildren> = ({ children }) => {
  return (
    <html lang="nl-BE" suppressHydrationWarning>
      <head>
        <ColorSchemeScript />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationJsonLd),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(websiteJsonLd),
          }}
        />
      </head>
      <body className={"root"}>
        <ClientShell>{children}</ClientShell>
        <Analytics />
      </body>
    </html>
  );
};

export default RootLayout;
