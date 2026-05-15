"use client";

import { Image } from "@mantine/core";
import styles from "./EventCard.module.css";
import { useRouter } from "next/navigation";
import { Event } from "@/types";
import { splitTitleAccent } from "@/lib/text";
import React, { useEffect, useRef, useState } from "react";
import { IconPhotoOff } from "@tabler/icons-react";

interface Props {
  event: Event;
  index: number;
}

const ROMANS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
function actLabel(index: number): string {
  return `Act ${index < ROMANS.length ? ROMANS[index] : index + 1}`;
}

export default function EventCard({ event, index }: Props) {
  const router = useRouter();
  const cardRef = useRef<HTMLDivElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      if (!imageLoaded) setImageError(true);
    }, 10_000);
    return () => clearTimeout(t);
  }, [imageLoaded]);

  useEffect(() => {
    if (!cardRef.current) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setVisible(true);
            obs.unobserve(e.target);
          }
        });
      },
      { threshold: 0.15 },
    );
    obs.observe(cardRef.current);
    return () => obs.disconnect();
  }, []);

  const { main, accent } = splitTitleAccent(event.title);
  const location =
    event.eventlocation?.location || event.eventlocation?.city;

  return (
    <div className={styles.cardWrapper}>
      <div
        ref={cardRef}
        className={`${index % 2 ? styles.reverse : ""} ${styles.card} ${visible ? styles.visible : ""}`}
      >
        <div className={styles.spotlightFrame}>
          <div className={styles.frameInner}>
            {!imageLoaded && !imageError && (
              <div className={styles.imageSkeleton} />
            )}
            {imageError ? (
              <div className={styles.imageError}>
                <IconPhotoOff size={64} stroke={1.5} />
                <p>Image not available</p>
              </div>
            ) : (
              <Image
                src={event.display_image}
                alt={event.title}
                className={styles.frameImg}
                style={{
                  opacity: imageLoaded ? 1 : 0,
                  transition: "opacity 0.4s ease",
                }}
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageError(true)}
              />
            )}
          </div>
        </div>

        <div className={styles.cardText}>
          <div className={styles.actNum}>
            Event
          </div>

          <h2 className={styles.cardTitle}>
            {main}
            {accent && (
              <>
                {" "}
                <span className={styles.it}>{accent}</span>
              </>
            )}
          </h2>

          <div className={styles.cardInfo}>
            {event.dates.map((d, i) => (
              <React.Fragment key={i}>
                {i > 0 && (
                  <span className={styles.cardInfoSep}>&#9670;</span>
                )}
                <span>
                  {new Date(d.start_time).toLocaleDateString("nl-BE", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </span>
              </React.Fragment>
            ))}
            {location && (
              <>
                <span className={styles.cardInfoSep}>&#9670;</span>
                <span>{location}</span>
              </>
            )}
          </div>

          {event.description && (
            <p className={styles.cardDesc}>{event.description}</p>
          )}

          <a
            className={styles.cardCta}
            onClick={() => router.push("/event/" + event.uuid)}
            style={{ cursor: "pointer" }}
          >
            View Event
            <span className={styles.cardCtaArrow}>&rarr;</span>
          </a>
        </div>
      </div>
    </div>
  );
}
