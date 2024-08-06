import { Event } from "@/types";
import { NextResponse } from "next/server";

const mockdata: Event[] = [
  {
    uuid: crypto.randomUUID(),
    title: "The Gentleman, Welcome to the upper class",
    dates: [
      {
        start: new Date("2022-12-27T18:00:00"),
        end: new Date("2022-12-27T24:00:00"),
        price: 28,
      },
    ],
    description: "Hoe het allemaal begon: charmant, sexy en stijlvol.",
    mainImage: "/Event_16.jpeg",
    images: ["/Event_16.jpeg"],
    location: {
      country: "Belgium",
      city: "Merelbeke",
      street: "Driekoningenplein 15",
      location: "Cultuurhuis Merelbeke",
    },
  },
  {
    uuid: crypto.randomUUID(),
    title: "Deal or No Deal",
    dates: [
      {
        start: new Date("2023-11-02T18:00:00"),
        end: new Date("2023-11-03T24:00:00"),
        price: 28,
      },
      {
        start: new Date("2024-11-01T18:00:00"),
        end: new Date("2024-10-31T24:00:00"),
        price: 28,
      },
    ],
    description:
      "The Gentleman keert terug naar Merelbeke met een nieuw fris verhaal vol drama en zottigheid. \nEchter, deze keer loopt het niet van een leien dakje, er is storm op komst en de oorzaak is ongekend. \nKom kijken en beleef mee wat Damon en Jowie in petto hebben.",
    mainImage: "/Event_2.jpeg",
    images: ["/Event_2.jpeg"],
    location: {
      country: "Belgium",
      city: "Merelbeke",
      street: "Driekoningenplein 15",
      location: "Cultuurhuis Merelbeke",
    },
  },
  {
    uuid: crypto.randomUUID(),
    title: "End of the line",
    dates: [
      {
        start: new Date("2024-10-31T18:00:00"),
        end: new Date("2024-11-02T24:00:00"),
        price: 28,
        external_link:
          "https://dreamdance.be/new/event/the-gentleman-end-of-the-line-1/",
      },
      {
        start: new Date("2024-11-01T18:00:00"),
        end: new Date("2024-10-31T24:00:00"),
        price: 28,
        external_link:
          "https://dreamdance.be/new/event/the-gentleman-end-of-the-line-2/",
      },
    ],
    description:
      "Het is niet al goud wat blinkt. Loopt alles goed af met Damon, Jowie en de vriendengroep? \nKom kijken, ontdek en geniet van het laatste deel van onze trilogie. \nEen spannend verhaal vol humor, straffe choreo en bekende muziek.\n\nHeb je het 1e en 2e deel niet gezien? Geen probleem, wij nemen je mee in een uniek verhaal waarin alles duidelijk wordt, zelf zonder voorkennis.",
    mainImage: "/end-of-the-line.PNG",
    images: ["/end-of-the-line.PNG"],
    location: {
      country: "Belgium",
      city: "Merelbeke",
      street: "Driekoningenplein 15",
      location: "Cultuurhuis Merelbeke",
    },
  },
];

export async function GET() {
  return NextResponse.json(mockdata);
}
