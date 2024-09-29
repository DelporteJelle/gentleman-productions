"use client";
import TicketCard from "@/components/tickets/TicketCard";
import styles from "./styles.module.css";
import { useState } from "react";

const mockdata = {
  dates: [
    {
      uuid: crypto.randomUUID(),
      start: new Date("2024-10-31T18:00:00"),
      end: new Date("2024-10-31T24:00:00"),
      imgSrc: "/event3_end_of_the_line/Event_3.jpg",
      title: "End of the line",
      price: 28,
      place: {
        country: "Belgium",
        city: "Merelbeke",
        street: "Driekoningenplein 15",
        location: "Cultuurhuis Merelbeke",
      },
      description:
        "Het is niet al goud wat blinkt. Loopt alles goed af met Damon, Jowie en de vriendengroep? \nKom kijken, ontdek en geniet van het laatste deel van onze trilogie. \nEen spannend verhaal vol humor, straffe choreo en bekende muziek.\n\nHeb je het 1e en 2e deel niet gezien? Geen probleem, wij nemen je mee in een uniek verhaal waarin alles duidelijk wordt, zelf zonder voorkennis.",
      external_link:
        "https://dreamdance.be/new/event/the-gentleman-end-of-the-line-1/",
    },
    {
      uuid: crypto.randomUUID(),
      start: new Date("2024-11-01T18:00:00"),
      end: new Date("2024-11-02T24:00:00"),
      imgSrc: "/event3_end_of_the_line/Event_3.jpg",
      title: "End of the line",
      price: 28,
      place: {
        country: "Belgium",
        city: "Merelbeke",
        street: "Driekoningenplein 15",
        location: "Cultuurhuis Merelbeke",
      },
      description:
        "Het is niet al goud wat blinkt. Loopt alles goed af met Damon, Jowie en de vriendengroep? \nKom kijken, ontdek en geniet van het laatste deel van onze trilogie. \nEen spannend verhaal vol humor, straffe choreo en bekende muziek.\n\nHeb je het 1e en 2e deel niet gezien? Geen probleem, wij nemen je mee in een uniek verhaal waarin alles duidelijk wordt, zelf zonder voorkennis.",
      external_link:
        "https://dreamdance.be/new/event/the-gentleman-end-of-the-line-2/",
    },
  ],
};

export default function Tickets() {
  const [activeCard, setActiveCard] = useState<string | undefined>(undefined);
  return (
    <div className={styles.page}>
      {mockdata.dates.map((t) => (
        <TicketCard
          key={t.uuid}
          ticket={t}
          activeCard={activeCard}
          setActiveCard={setActiveCard}
        />
      ))}
    </div>
  );
}
