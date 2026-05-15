"use client";

import styles from "./page.module.css";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { useRouter } from "next/navigation";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ScrollToPlugin } from "gsap/ScrollToPlugin";
import EventCard from "@/components/EventCard/EventCard";
import BasicPostCard from "@/components/EventCard/BasicPostCard";
import SectionLabel from "@/components/SectionLabel/SectionLabel";
import { LoadingScreen } from "@/components/StateScreens/StateScreens";
import Countdown from "@/components/Countdown/Countdown";
import { useEffect, useState } from "react";
import { DbObjectType, Event, BasicPost, Post } from "@/types";
import { Image } from "@mantine/core";
import CanvasBackground from "@/components/Background/CanvasBackground";
import GoldShimmerCTA from "@/components/GoldShimmerCTA/GoldShimmerCTA";
import { usePosts } from "./contexts/PostsContext";
import { splitTitleAccent } from "@/lib/text";

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

function getHighlightDate(highlight: any): Date | null {
  if (!highlight) return null;
  if (highlight.post_type === DbObjectType.EVENT && highlight.dates?.length) {
    return new Date(highlight.dates[0].start_time);
  }
  if (highlight.post_type === DbObjectType.BASIC_POST && highlight.date) {
    return new Date(highlight.date);
  }
  return null;
}

export default function Home() {
  const router = useRouter();
  const { posts, loading, highlight } = usePosts();

  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    setCurrentIndex(Math.floor(Math.random() * imageURLs.length));

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
            ease: "bounce.out",
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

  const canvasTransform =
    viewportHeight > 0
      ? scrollY >= viewportHeight
        ? "translateY(0)"
        : `translateY(${viewportHeight - scrollY}px)`
      : "translateY(100%)";

  if (loading) return <LoadingScreen />;

  const showDate = getHighlightDate(highlight);
  const hasActiveHighlight =
    !!highlight && new Date(highlight.valid_date) > new Date();
  const isEventHighlight =
    hasActiveHighlight && highlight.post_type === DbObjectType.EVENT;
  const { main: titleMain, accent: titleAccent } = hasActiveHighlight
    ? splitTitleAccent(highlight.title)
    : { main: "", accent: "" };
  const venue = isEventHighlight
    ? (highlight as Event).eventlocation?.location ||
      (highlight as Event).eventlocation?.city
    : hasActiveHighlight
      ? (highlight as BasicPost).location
      : undefined;

  return (
    <div className={`${styles.main}`}>
      {/* Background image */}
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
      {/* Three.js Canvas background — scrolls with page then becomes fixed */}
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

      <div style={{ position: "relative", zIndex: 3 }}>
        {pulseVisible && (
          <div className={styles.pulse_indicator}>
            <div className={styles.ring}></div>
            <div className={styles.ring}></div>
            <div className={styles.ring}></div>
          </div>
        )}

        {/* Highlight hero */}
        <section className={styles.hero}>
          <div className={styles.heroSide}>
            <span className={styles.heroSideLine}></span>
            GENTLEMAN PRODUCTIONS · ANNO MMXXVI · MERELBEKE
            <span className={styles.heroSideLine}></span>
          </div>

          <div className={styles.heroContent}>
            {hasActiveHighlight ? (
              <>
                <h1 className={styles.heroTitle}>
                  {titleMain}
                  {titleAccent && (
                    <>
                      {" "}
                      <span className={styles.accent}>{titleAccent}</span>
                    </>
                  )}
                </h1>

                {highlight.description && (
                  <p className={styles.tagline}>
                    <span className={styles.quote}>&ldquo;</span>
                    {highlight.description}
                    <span className={styles.quote}>&rdquo;</span>
                  </p>
                )}

                {showDate && (
                  <div className={styles.dateRow}>
                    <span className={styles.dateChevron}>&#9656;</span>
                    <span className={styles.dateMain}>
                      {isEventHighlight
                        ? (highlight as Event).dates.map((d, i) => (
                            <span key={i}>
                              {new Date(d.start_time).toLocaleDateString(
                                "nl-BE",
                                {
                                  day: "numeric",
                                  month: "long",
                                  year: "numeric",
                                },
                              )}
                              {i < (highlight as Event).dates.length - 1
                                ? " — "
                                : ""}
                            </span>
                          ))
                        : showDate.toLocaleDateString("nl-BE", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          })}
                    </span>
                    {venue && (
                      <span className={styles.dateVenue}>{venue}</span>
                    )}
                  </div>
                )}

                {showDate && showDate > new Date() && (
                  <div className={styles.countdownWrap}>
                    <Countdown target={showDate} />
                  </div>
                )}

                <div className={styles.ctaRow}>
                  {(() => {
                    const isFutureEvent =
                      isEventHighlight && showDate && showDate > new Date();
                    const ctaHref = isFutureEvent
                      ? `/event/${highlight.uuid}/ticket`
                      : `/event/${highlight.uuid}`;
                    const ctaLabel = isFutureEvent
                      ? "More Info"
                      : isEventHighlight
                        ? "View Event"
                        : "Learn More";
                    return (
                      <GoldShimmerCTA onClick={() => router.push(ctaHref)}>
                        {ctaLabel}
                      </GoldShimmerCTA>
                    );
                  })()}
                </div>
              </>
            ) : (
              <h1 className={styles.heroFallback}>
                Gentleman <span className={styles.accent}>Productions</span>
              </h1>
            )}
          </div>
        </section>

        {/* Posts section */}
        <section className={styles.postsSection}>
          <SectionLabel>Past events</SectionLabel>
          <div className={styles.postsStack}>
            {posts &&
              posts
                .sort(
                  (a: Post, b: Post) =>
                    new Date(b.created_at).getTime() -
                    new Date(a.created_at).getTime(),
                )
                .map((post: Post, index: number) => (
                  <article key={post.uuid}>
                    <div className={styles.postMeta}>
                      <span className={styles.postMetaLine}></span>
                      Posted ·{" "}
                      {new Date(post.created_at).toLocaleDateString("nl-BE", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                      <span className={styles.postMetaLine}></span>
                    </div>
                    {post.post_type === DbObjectType.EVENT && (
                      <EventCard event={post as Event} index={index} />
                    )}
                    {post.post_type === DbObjectType.BASIC_POST && (
                      <BasicPostCard
                        post={post as BasicPost}
                        index={index}
                      />
                    )}
                  </article>
                ))}
          </div>
        </section>
      </div>
    </div>
  );
}
