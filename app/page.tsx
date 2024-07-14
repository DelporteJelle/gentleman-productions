import styles from "./page.module.css";
import Link from "next/link";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";

import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ScrollToPlugin } from "gsap/ScrollToPlugin";
import ImageTextCard from "../components/ImageTextCard";

gsap.registerPlugin(useGSAP, ScrollTrigger, ScrollToPlugin);

const mockdata = {
  mainHighlight: {
    title: "End of the line",
    dates: [new Date(2024, 10, 30), new Date(2024, 11, 1)],
  },
  Events: [
    {
      title: "Deal or No Deal?",
      text: "The Gentleman keert terug naar Merelbeke met een nieuw fris verhaal vol drama en zottigheid. \nEchter, deze keer loopt het niet van een leien dakje, er is storm op komst en de oorzaak is ongekend. \nKom kijken en beleef mee wat Damon en Jowie in petto hebben.",
      dates: [new Date(2023, 11, 2), new Date(2023, 11, 3)],
      imageSrc: "/Event_2.jpeg",
    },
    {
      title: "The Gentleman, Welcome to the upper class",
      text: "Hoe het allemaal begon: charmant, sexy en stijlvol.",
      dates: [new Date(2022, 12, 27)],
      imageSrc: "/Event_16.jpeg",
    },

    {
      title: "End of the line",
      text: "Het is niet al goud wat blinkt. Loopt alles goed af met Damon, Jowie en de vriendengroep? \nKom kijken, ontdek en geniet van het laatste deel van onze trilogie. \nEen spannend verhaal vol humor, straffe choreo en bekende muziek.\n\nHeb je het 1e en 2e deel niet gezien? Geen probleem, wij nemen je mee in een uniek verhaal waarin alles duidelijk wordt, zelf zonder voorkennis.",
      dates: [new Date(2024, 10, 31), new Date(2024, 11, 1)],
      imageSrc: "/Event_3.jpg  ",
    },
  ],
};

export default function Home() {
  return (
    <main className={styles.main}>
      <div className={styles.hightlight}>
        <div className={styles.title}>
          {mockdata.mainHighlight.title}
          <div className={styles.line}></div>
        </div>
        <div>SAVE THE DATE</div>
        <div className={styles.date}>
          {mockdata.mainHighlight.dates.map((date, index) => (
            <span key={index}>
              {date.toLocaleDateString("nl-BE", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
              {index === 0 ? " - " : ""}
            </span>
          ))}
        </div>
        <button className="btn-red">
          <Link href={"/tickets"}>Buy tickets</Link>
        </button>
      </div>
      {/* anouncements section */}
      <div className="d-flex flex-column align-items-center">
        {/* Upcomming events */}

        <div className="d-flex flex-column align-items-center my-5">
          <div className="header">Upcomming events</div>
          {mockdata.Events.filter(
            (event) => new Date(event.dates[0]) > new Date(),
          )
            .sort(
              (a, b) =>
                new Date(a.dates[0]).getTime() - new Date(b.dates[0]).getTime(),
            )
            .map((event, index) => (
              <ImageTextCard key={index} event={event} index={index} />
            ))}
        </div>
        {/* past events */}

        <div className="d-flex flex-column align-items-center my-5">
          <div className="header">Past events</div>
          {mockdata.Events.filter(
            (event) => new Date(event.dates[0]) < new Date(),
          )
            .sort(
              (a, b) =>
                new Date(a.dates[0]).getTime() - new Date(b.dates[0]).getTime(),
            )
            .map((event, index) => (
              <ImageTextCard key={index} event={event} index={index} />
            ))}
        </div>
      </div>
    </main>
  );
}
