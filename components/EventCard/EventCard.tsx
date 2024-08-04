"use client";

import { Image } from "@mantine/core";
import styles from "./EventCard.module.css";
import { useRouter } from "next/navigation";
interface props {
  event: any;
  index: any;
}

export default function ImageTextCard({ event, index }: props) {
  const router = useRouter();

  return (
    <div
      key={index}
      // className={`d-flex flex-row my-5 ${index % 2 && "flex-row-reverse"}`}
      className={index % 2 ? styles.card_reverse : styles.card}
    >
      <div className={styles.card_img}>
        <Image
          src={event.imageSrc}
          alt={event.title}
          height={450}
          style={{ objectFit: "cover" }}
        />
      </div>
      <div className={styles.card_txt}>
        <div className="subheader">{event.title}</div>

        <div className="date mt-4">
          {event.dates.map((date: Date, index: number) => (
            <span key={index}>
              {date.toLocaleDateString("nl-BE", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
              {index === 0 && event.dates.length > 1 ? " - " : ""}
            </span>
          ))}
        </div>
        <div style={{ whiteSpace: "pre-wrap" }}>{event.text}</div>
        {new Date(event.dates[0]) > new Date() && (
          <button
            className="btn-yellow"
            onClick={() => {
              router.push("/tickets");
            }}
          >
            More info
          </button>
        )}
      </div>
    </div>
  );
}
