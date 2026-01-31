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

const imageURLs = [
  "https://1drv.ms/i/c/09de1e7f62bf5ef8/IQSFbd-6MNcrRaiBa37gLaALATt5LWXcKeBxdeNE4Y5gia8?width=2550",
  "https://1drv.ms/i/c/09de1e7f62bf5ef8/IQQa_tmQCWyXQqecQexVlm_sAc2T-5n1GQdyBNAvWn53Gac?width=2550",
  "https://1drv.ms/i/c/09de1e7f62bf5ef8/IQTC1CjKqjpCT79VBxkYtWv4AW79ZTEsx0KBVLR7IlJk3WM?width=2550",
  "https://1drv.ms/i/c/09de1e7f62bf5ef8/IQRiqOB-Fw1fRaxp8a94tW7IAYXy4_5cD_M3UXbJ_UZ_sdg?width=2550",
  "https://1drv.ms/i/c/09de1e7f62bf5ef8/IQRnbZ9Pk_h0S42Ir3ymNXgQAdVnE8kZoEttm6VDD64KsJw?width=2550",
  "https://1drv.ms/i/c/09de1e7f62bf5ef8/IQSC9sibt3BwTb7sMlTVucr9AeD_ksICAbs6Nu1gwI_ubXY?width=2550",
  "https://1drv.ms/i/c/09de1e7f62bf5ef8/IQQ-I_YDmtHwRKkmn5kSXiWhAbgKBAk876JZ0tOVwc_ooXs?width=2550",
];

export default function Home() {
  const router = useRouter();
  const { posts, loading, error, highlight } = usePosts();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    // Initialize with random index after hydration
    setCurrentIndex(Math.floor(Math.random() * imageURLs.length));
    setIsHydrated(true);

    const intervalId = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % imageURLs.length);
    }, 60000);

    return () => clearInterval(intervalId);
  }, []);

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

  // Track scroll position for CanvasBackground parallax effect
  const [scrollY, setScrollY] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  useEffect(() => {
    // Set initial viewport height
    setViewportHeight(window.innerHeight);

    const handleResize = () => {
      setViewportHeight(window.innerHeight);
    };

    const handleScroll = () => {
      setScrollY(window.scrollY);
    };

    window.addEventListener("scroll", handleScroll);
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // Calculate canvas transform - scrolls with page until it covers viewport, then stays fixed
  const canvasTransform =
    viewportHeight > 0
      ? scrollY >= viewportHeight
        ? "translateY(0)" // Fully covering - stay fixed at top
        : `translateY(${viewportHeight - scrollY}px)` // Scroll with content
      : "translateY(100%)";

  useEffect(() => {
    console.log(highlight);
  }, [highlight]);

  if (loading) return <p>Loading events...</p>;

  return (
    <div className={`${styles.main}`}>
      {/*Background Image*/}
      <div className={styles.imageContainer}>
        <Image
          src={imageURLs[currentIndex]}
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
      {/* Canvas Background - scrolls with page then becomes fixed */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          zIndex: -1,
          transform: canvasTransform,
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
        {/**Highlight */}
        <div className={styles.hightlight}>
          <div className={styles.glass}>
            {highlight &&
            highlight.post_type === DbObjectType.EVENT &&
            highlight.valid_date &&
            new Date(highlight.valid_date) > new Date() ? (
              <>
                <div className={"title"}>
                  {highlight.title}
                  <div className={styles.line}></div>
                </div>
                <div className="bold">SAVE THE DATE</div>
                <div className={styles.date}>
                  {highlight.post_type === DbObjectType.EVENT &&
                    (highlight as Event).dates.map((date, index) => (
                      <span key={index}>
                        {new Date(date.start_time).toLocaleDateString("nl-BE", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                        {index === 0 && index != highlight.dates.length - 1
                          ? " - "
                          : ""}
                      </span>
                    ))}
                </div>
                <button
                  className="btn-red"
                  onClick={() => {
                    router.push("/event/" + highlight.uuid + "/ticket");
                  }}
                >
                  More Info
                </button>
              </>
            ) : (
              <div className={"title"}>
                Gentleman Productions
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
                  <div key={post.uuid} style={{ width: "100%" }}>
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
