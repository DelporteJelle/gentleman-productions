"use client";

import { Image } from "@mantine/core";
import styles from "./EventCard.module.css";
import { useRouter } from "next/navigation";
import { Event } from "@/types";
import React, { createRef, useEffect, useRef } from "react";
import { gsap } from "gsap";
import TextPlugin from "gsap/TextPlugin";
interface props {
  event: Event;
  index: any;
}

export default function ImageTextCard({ event, index }: props) {
  gsap.registerPlugin(TextPlugin);
  const router = useRouter();
  const cardRef = useRef(null);
  const titleRef = useRef(null);
  const dateRef = useRef(null);
  const descriptionRef = useRef(null);
  const btnRef = useRef(null);

  useEffect(() => {
    if (cardRef.current) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const tl = gsap.timeline();
              // tl.from(cardRef.current, { duration: 0.5, autoAlpha: 0 })
              // tl.from(
              //   titleRef.current,
              //   { duration: 0.5, autoAlpha: 0, text: "" },
              //   "+=0.1",
              // )
              //   .from(
              //     dateRef.current,
              //     { duration: 0.5, autoAlpha: 0, text: "" },
              //     "+=0.1",
              //   )
              //   .from(
              //     descriptionRef.current,
              //     { duration: 0.5, autoAlpha: 0 },
              //     "+=0.1",
              //   )
              //   .from(btnRef.current, { duration: 0.5, autoAlpha: 0 }, "+=0.1");
              tl.to(cardRef.current, { duration: 1, opacity: 1, width: "100%" }) // Expand the card
                .to(
                  titleRef.current,
                  { duration: 1, text: event.title, opacity: 1 },
                  "+0.1",
                ) // Animate the title as if being written
                .to(
                  dateRef.current,
                  {
                    duration: 2,
                    text: event.dates
                      .map((date: any) =>
                        new Date(date.start).toLocaleDateString("nl-BE", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        }),
                      )
                      .join(" - "),
                    opacity: 1,
                  },
                  "+0.5",
                ) // Then the date
                .to(
                  descriptionRef.current,
                  { duration: 2, text: event.description, opacity: 1 },
                  "+1",
                )
                .to(btnRef.current, { duration: 1, opacity: 1 }, "+=0");
              observer.unobserve(cardRef!.current!);
            }
          });
        },
        {
          threshold: 0.1,
        },
      );

      observer.observe(cardRef.current);

      // Clean up function
      return () => {
        if (cardRef.current) {
          observer.unobserve(cardRef.current);
        }
      };
    }
  }, [event.dates, event.description, event.title]);

  return (
    <div className={styles.card_wrapper}>
      <div
        ref={cardRef}
        key={index}
        className={index % 2 ? styles.card_reverse : styles.card}
        style={{ opacity: 0, transformOrigin: "center center", width: "0%" }}
      >
        <div className={styles.card_img}>
          <Image
            src={event.mainImage}
            alt={event.title}
            height={450}
            style={{ objectFit: "cover" }}
          />
        </div>
        <div className={styles.card_txt}>
          <div className="subheader" ref={titleRef}>
            {/* {event.title} */}
          </div>

          <div className="date mt-4" ref={dateRef}>
            {event.dates.map((date: any, index: number) => (
              <span key={index}>
                {index === 0 && event.dates.length > 1 ? " - " : ""}
              </span>
            ))}
          </div>
          <div style={{ whiteSpace: "pre-wrap" }} ref={descriptionRef}></div>
          {/* {new Date(event.dates[0]) > new Date() && ( */}
          <button
            ref={btnRef}
            className="btn-yellow"
            onClick={() => {
              router.push("/events/" + event.uuid);
            }}
            style={{ opacity: 0 }}
          >
            More info
          </button>
          {/* )} */}
        </div>
      </div>
    </div>
  );
}
