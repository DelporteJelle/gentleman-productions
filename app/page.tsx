"use client";

import styles from "./page.module.css";
import Link from "next/link";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { useRouter } from "next/navigation";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ScrollToPlugin } from "gsap/ScrollToPlugin";
import EventCard from "@/components/EventCard/EventCard";
import { useEffect, useState } from "react";

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

const images = [
  "/Banner_1.jpg",
  "/Banner_2.jpg",
  "/Banner_3.jpg",
  "/Banner_4.jpg",
  "/Banner_5.jpg",
  "/Banner_6.jpg",
  "/Banner_7.jpg",
  "/Banner_8.jpg",
  "/Banner_9.jpg",
  "/Banner_10.jpg",
  "/Banner_11.jpg",
];

export default function Home() {
  const router = useRouter();

  const [currentIndex, setCurrentIndex] = useState(
    Math.floor(Math.random() * images.length),
  );

  useEffect(() => {
    const intervalId = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % images.length);
    }, 30000);

    return () => clearInterval(intervalId);
  }, []);

  return (
    <main className={`${styles.main} ${styles[`background${currentIndex}`]}`}>
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
        <button
          className="btn-red"
          onClick={() => {
            router.push("/tickets");
          }}
        >
          Buy tickets
        </button>
      </div>
      {/* anouncements section */}
      <div className="d-flex flex-column align-items-center">
        {/* Upcomming events */}

        <div className="d-flex flex-column align-items-center my-5">
          <div className="header">Upcoming events</div>
          {mockdata.Events.filter(
            (event) => new Date(event.dates[0]) > new Date(),
          )
            .sort(
              (a, b) =>
                new Date(a.dates[0]).getTime() - new Date(b.dates[0]).getTime(),
            )
            .map((event, index) => (
              <EventCard key={index} event={event} index={index} />
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
              <EventCard key={index} event={event} index={index} />
            ))}
        </div>
      </div>
    </main>
  );
}
