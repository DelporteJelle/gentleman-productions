"use client";

import styles from "./page.module.css";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { useRouter } from "next/navigation";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ScrollToPlugin } from "gsap/ScrollToPlugin";
import EventCard from "@/components/EventCard/EventCard";
import { useEffect, useState } from "react";
import { Event } from "@/types";
import { Stack } from "@mantine/core";

gsap.registerPlugin(useGSAP, ScrollTrigger, ScrollToPlugin);

const mockdata = {
  mainHighlight: {
    title: "End of the line",
    dates: [new Date("2024-10-31T18:00:00"), new Date("2024-11-01T18:00:00")],
  },
  // Events: [
  //   {
  //     title: "Deal or No Deal?",
  //     text: "The Gentleman keert terug naar Merelbeke met een nieuw fris verhaal vol drama en zottigheid. \nEchter, deze keer loopt het niet van een leien dakje, er is storm op komst en de oorzaak is ongekend. \nKom kijken en beleef mee wat Damon en Jowie in petto hebben.",
  //     dates: [new Date(2023, 11, 2), new Date(2023, 11, 3)],
  //     imageSrc: "/Event_2.jpeg",
  //   },
  //   {
  //     title: "The Gentleman, Welcome to the upper class",
  //     text: "Hoe het allemaal begon: charmant, sexy en stijlvol.",
  //     dates: [new Date(2022, 12, 27)],
  //     imageSrc: "/Event_16.jpeg",
  //   },

  //   {
  //     title: "End of the line",
  //     text: "Het is niet al goud wat blinkt. Loopt alles goed af met Damon, Jowie en de vriendengroep? \nKom kijken, ontdek en geniet van het laatste deel van onze trilogie. \nEen spannend verhaal vol humor, straffe choreo en bekende muziek.\n\nHeb je het 1e en 2e deel niet gezien? Geen probleem, wij nemen je mee in een uniek verhaal waarin alles duidelijk wordt, zelf zonder voorkennis.",
  //     dates: [new Date(2024, 10, 31), new Date(2024, 11, 1)],
  //     imageSrc: "/Event_3.jpg  ",
  //   },
  // ],
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
  const [events, setEvents] = useState<Event[] | undefined>(undefined);
  const [currentIndex, setCurrentIndex] = useState(
    Math.floor(Math.random() * images.length),
  );
  // Fetch data
  useEffect(() => {
    fetch("/api/events")
      .then((response) => response.json())
      .then((data) => setEvents(data))
      .catch((error) => console.error("Error fetching data:", error));

    const intervalId = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % images.length);
    }, 30000);

    return () => clearInterval(intervalId);
  }, [setEvents]);

  // Scroll effect to clarify page is scrollable
  const [pulseVisible, setPulseVisible] = useState(false);
  const [hasScrolled, setHasScrolled] = useState(false);
  useEffect(() => {
    window.addEventListener("scroll", () => {
      setHasScrolled(true);
    });

    const timer = setTimeout(() => {
      if (hasScrolled) return;
      setPulseVisible(true);

      gsap.to(window, {
        scrollTo: { y: "+=60", autoKill: false },
        duration: 0.5,
        onComplete: () => {
          gsap.to(window, {
            scrollTo: { y: "-=60", autoKill: false },
            duration: 0.5,
            ease: "bounce.out", // Bounce effect for scrolling back up
            onComplete: () => {
              setPulseVisible(false);
            },
          });
        },
      });
    }, 10000);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("scroll", () => {});
    };
  }, [hasScrolled]);

  if (!events) {
    return <div>Loading...</div>;
  }

  return (
    <div className={`${styles.main} ${styles[`background${currentIndex}`]}`}>
      {pulseVisible && (
        <div className={styles.pulse_indicator}>
          <div className={styles.ring}></div>
          <div className={styles.ring}></div>
          <div className={styles.ring}></div>
        </div>
      )}
      <div className={styles.hightlight}>
        <div className={"title"}>
          {mockdata.mainHighlight.title}
          <div className={styles.line}></div>
        </div>
        <div className="bold">SAVE THE DATE</div>
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
          Ticket info
        </button>
      </div>
      {/* anouncements section */}
      <Stack align="center" justify="center">
        {/* Upcomming events */}

        <Stack align="center" justify="center">
          <div className="header">Upcoming events</div>
          {events
            .filter((event) => new Date(event.dates[0].start) > new Date())
            .sort(
              (a, b) =>
                new Date(a.dates[0].start).getTime() -
                new Date(b.dates[0].start).getTime(),
            )
            .map((event, index) => (
              <EventCard key={index} event={event} index={index} />
            ))}
        </Stack>
        {/* past events */}

        <Stack align="center" justify="center">
          <div className="header">Past events</div>
          {events
            .filter((event) => new Date(event.dates[0].start) < new Date())
            .sort(
              (a, b) =>
                new Date(a.dates[0].start).getTime() -
                new Date(b.dates[0].start).getTime(),
            )
            .map((event, index) => (
              <EventCard key={index} event={event} index={index} />
            ))}
        </Stack>
      </Stack>
    </div>
  );
}
