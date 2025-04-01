"use client";

import styles from "./page.module.css";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { useRouter } from "next/navigation";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ScrollToPlugin } from "gsap/ScrollToPlugin";
import EventCard from "@/components/EventCard/EventCard";
import { useEffect, useRef, useState } from "react";
import { Event, EventHighlight } from "@/types";
import { Image, Stack } from "@mantine/core";
import { createRoot } from "react-dom/client";
import { Canvas } from "@react-three/fiber";
import CanvasBackground from "@/components/Background/CanvasBackground";

gsap.registerPlugin(useGSAP, ScrollTrigger, ScrollToPlugin);

const images = [
  "Banner_1.jpg",
  "Banner_2.jpg",
  "Banner_3.jpg",
  "Banner_4.jpg",
  "Banner_5.jpg",
  "Banner_6.jpg",
  "Banner_7.jpg",
  "Banner_8.jpg",
  "Banner_9.jpg",
  "Banner_10.jpg",
  "Banner_11.jpg",
];

export default function Home() {
  const router = useRouter();
  const [events, setEvents] = useState<Event[] | undefined>(undefined);
  const [currentIndex, setCurrentIndex] = useState(
    Math.floor(Math.random() * images.length),
  );

  const [highlight, setHighlight] = useState<EventHighlight | undefined>(
    undefined,
  );
  const [highlightEvent, setHighlightEvent] = useState<Event | undefined>(
    undefined,
  );

  // Fetch data
  useEffect(() => {
    fetch("/api/events")
      .then((response) => response.json())
      .then((data) => setEvents(data))
      .catch((error) => console.error("Error fetching data:", error));

    fetch("/api/highlight")
      .then((response) => response.json())
      .then((data) => setHighlight(data))
      .catch((error) => console.error("Error fetching highlight:", error));

    const intervalId = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % images.length);
    }, 60000);

    return () => clearInterval(intervalId);
  }, [setEvents]);

  useEffect(() => {
    if (highlight && events) {
      const highlightedEvent = events.find(
        (event) => event.uuid === highlight.event_uuid,
      );
      setHighlightEvent(highlightedEvent);
    }
  }, [highlight, events]);

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
    }, 5000);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("scroll", () => {});
    };
  }, [hasScrolled]);

  //Adjust CanvasBackground position based on scroll direction
  const [canvasInFront, setCanvasInFront] = useState(false); // Track if CanvasBackground should move in front
  const [scrollY, setScrollY] = useState(0); // Track the current scroll position
  const [scrollDirection, setScrollDirection] = useState<"up" | "down" | null>(
    null,
  ); // Track scroll direction

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;

      // Determine scroll direction
      if (currentScrollY > scrollY) {
        setScrollDirection("down");
      } else if (currentScrollY < scrollY) {
        setScrollDirection("up");
      }

      setScrollY(currentScrollY);

      setCanvasInFront(currentScrollY > 500); // Adjust the threshold as needed
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [scrollY]);

  if (!events || !highlightEvent) {
    return <div>Loading...</div>;
  }

  return (
    <div className={`${styles.main}`}>
      {/*Background Image*/}
      <Image
        src={`/api/images/${images[currentIndex]}`}
        alt={"highlight"}
        style={{
          objectFit: "cover",
          position: "fixed",
          top: 0,
          left: 0,
          height: "100vh",
          width: "100%",
          zIndex: -2,
        }}
      />
      {/* Canvas Background */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          zIndex: -1, // Keep it above the background image
          transform: canvasInFront
            ? "translateY(0)" // Fully visible when scrolled down
            : scrollDirection === "up"
              ? "translateY(100%)" // Move up when scrolling up
              : "translateY(100%)", // Move down when scrolling down
          transition: "transform 0.5s ease", // Smooth transition for movement
        }}
      >
        <CanvasBackground />
      </div>
      {/* Main Content */}
      <div
        style={{
          position: "relative",
          zIndex: 3, // Ensure content is always above both the background and CanvasBackground
        }}
      >
        {pulseVisible && (
          <div className={styles.pulse_indicator}>
            <div className={styles.ring}></div>
            <div className={styles.ring}></div>
            <div className={styles.ring}></div>
          </div>
        )}
        {/**Hightlight */}
        <div className={styles.hightlight}>
          {highlight?.valid_date &&
            new Date(highlight.valid_date) > new Date() && (
              <>
                <div className={"title"}>
                  {highlightEvent.title}
                  <div className={styles.line}></div>
                </div>
                <div className="bold">SAVE THE DATE</div>
                <div className={styles.date}>
                  {highlightEvent.dates.map((date, index) => (
                    <span key={index}>
                      {new Date(date.start).toLocaleDateString("nl-BE", {
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
                    router.push("/event/" + highlightEvent.uuid + "/ticket");
                  }}
                >
                  Ticket info
                </button>
              </>
            )}
        </div>
        {/* anouncements section */}
        <Stack align="center" justify="center">
          {/* Upcomming events */}
          {events.filter((event) => new Date(event.dates[0].start) > new Date())
            .length > 0 && (
            <Stack align="center" justify="center">
              <h1>Upcoming events</h1>
              {events
                .filter((event) => new Date(event.dates[0].start) > new Date())
                .sort(
                  (a, b) =>
                    new Date(b.dates[0].start).getTime() -
                    new Date(a.dates[0].start).getTime(),
                )
                .map((event, index) => (
                  <EventCard key={index} event={event} index={index} />
                ))}
            </Stack>
          )}
          {/* past events */}

          <Stack align="center" justify="center">
            <h1>Past events</h1>
            {events
              .filter((event) => new Date(event.dates[0].start) < new Date())
              .sort(
                (a, b) =>
                  new Date(b.dates[0].start).getTime() -
                  new Date(a.dates[0].start).getTime(),
              )
              .map((event, index) => (
                <EventCard key={index} event={event} index={index} />
              ))}
          </Stack>
        </Stack>
      </div>
    </div>
  );
}
