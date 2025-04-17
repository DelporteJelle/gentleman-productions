"use client";

import styles from "./page.module.css";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { useRouter } from "next/navigation";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ScrollToPlugin } from "gsap/ScrollToPlugin";
import EventCard from "@/components/EventCard/EventCard";
import { useEffect, useRef, useState } from "react";
import { DbObjectType, Event, EventHighlight, Post } from "@/types";
import { Group, Image, Stack, Text } from "@mantine/core";
import { createRoot } from "react-dom/client";
import { Canvas } from "@react-three/fiber";
import CanvasBackground from "@/components/Background/CanvasBackground";
import { IconCalendarWeek } from "@tabler/icons-react";
import { usePosts } from "./contexts/PostsContext";

gsap.registerPlugin(useGSAP, ScrollTrigger, ScrollToPlugin);

const images = [
  "Banner_2.jpg",
  "Banner_4.jpg",
  "Banner_6.jpg",
  "Banner_7.jpg",
  "Banner_8.jpg",
  "Banner_9.jpg",
  "Banner_11.jpg",
];

export default function Home() {
  const router = useRouter();
  const { posts, loading, error, fetchPosts } = usePosts();

  const [currentIndex, setCurrentIndex] = useState(
    Math.floor(Math.random() * images.length),
  );

  const [highlight, setHighlight] = useState<EventHighlight | undefined>(
    undefined,
  );
  const [highlightEvent, setHighlightEvent] = useState<Post | undefined>(
    undefined,
  );

  // Fetch data
  useEffect(() => {
    // fetch("/api/events")
    //   .then((response) => response.json())
    //   .then((data) => setEvents(data))
    //   .catch((error) => console.error("Error fetching data:", error));

    fetch("/api/highlight")
      .then((response) => response.json())
      .then((data) => setHighlight(data))
      .catch((error) => console.error("Error fetching highlight:", error));

    const intervalId = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % images.length);
    }, 60000);

    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (highlight && posts) {
      const highlightedEvent = posts.find(
        (event: Post) => event.uuid === highlight.event_uuid,
      );
      setHighlightEvent(highlightedEvent);
    }
  }, [highlight, posts]);

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

  if (loading) return <p>Loading events...</p>;
  if (error) return <p>Error: {error}</p>;

  return (
    <div className={`${styles.main}`}>
      {/*Background Image*/}
      <div className={styles.imageContainer}>
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
      </div>
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
          <div className={styles.glass}>
            {highlight &&
            highlightEvent &&
            highlight?.valid_date &&
            new Date(highlight.valid_date) > new Date() ? (
              <>
                <div className={"title"}>
                  {highlightEvent.title}
                  <div className={styles.line}></div>
                </div>
                <div className="bold">SAVE THE DATE</div>
                <div className={styles.date}>
                  {highlightEvent.post_type === DbObjectType.EVENT &&
                    (highlightEvent as Event).dates.map((date, index) => (
                      <span key={index}>
                        {new Date(date.start_time).toLocaleDateString("nl-BE", {
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
            ) : (
              <div className={"title"}>
                Gentlemen Productions
                <div className={styles.line}></div>
              </div>
            )}
          </div>
        </div>
        {/* anouncements section */}
        <Stack align="center" justify="center">
          {/*events */}

          <Stack align="center" justify="center">
            {posts &&
              posts
                .sort(
                  (a: Post, b: Post) =>
                    new Date(b.created_at).getTime() -
                    new Date(a.created_at).getTime(),
                )
                .map((post: Post, index: number) => (
                  <div key={post.uuid}>
                    <Group
                      justify={"center"}
                      mt={200}
                      style={{ position: "relative" }}
                    >
                      <Group
                        style={{
                          position: "relative",
                          top: "0px",
                        }}
                      >
                        <IconCalendarWeek size={25} />

                        <div>
                          <div className="gray-600">Posted at</div>
                          <div className="date fs14">
                            {new Date(post.created_at).toLocaleDateString(
                              "nl-BE",
                              {
                                day: "numeric",
                                month: "long",
                                year: "numeric",
                              },
                            )}
                          </div>
                        </div>
                      </Group>
                    </Group>
                    {post.post_type === DbObjectType.EVENT && (
                      <EventCard event={post as Event} index={index} />
                    )}
                  </div>
                ))}
          </Stack>
        </Stack>
      </div>
    </div>
  );
}
