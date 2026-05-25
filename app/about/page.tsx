import type { Metadata } from "next";
import AboutClient from "./AboutClient";

const ABOUT_DESCRIPTION =
  "Maak kennis met het team achter Gentleman Productions: de mensen, partners en het verhaal achter onze jaarlijkse dans- en theaterproductie uit Merelbeke.";

export const metadata: Metadata = {
  title: "Over ons",
  description: ABOUT_DESCRIPTION,
  alternates: { canonical: "/about" },
  openGraph: {
    title: "Over Gentleman Productions",
    description: ABOUT_DESCRIPTION,
    url: "https://gentlemanproductions.be/about",
    type: "profile",
  },
};

export default function AboutPage() {
  return <AboutClient />;
}
