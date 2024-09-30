"use client";

// Import necessary modules
import { Event } from "@/types";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Carousel } from "@mantine/carousel";
import { Group, Image, Stack } from "@mantine/core";
import styles from "./styles.module.css";
import { useRouter } from "next/navigation";

// Define the page component
const EventPage = () => {
  const router = useRouter();
  const { id } = useParams();
  const [data, setData] = useState<Event | undefined>(undefined);

  useEffect(() => {
    if (id) {
      fetch(`/api/events/${id}`)
        .then((response) => response.json())
        .then((data) => setData(data))
        .catch((error) => console.error("Error fetching data:", error));
    }
  }, [id]);

  if (!data) {
    return <div>Loading...</div>;
  }

  return (
    <div className={styles.main}>
      <div className={styles.text}>
        <div className="title" style={{ fontSize: "32px" }}>
          {data.title} <div className={styles.line} />
        </div>

        <div className="date mt-4">
          {data.dates.map((date: any, index: number) => (
            <span key={index}>
              {new Date(date.start).toLocaleDateString("nl-BE", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
              {index === 0 && data.dates.length > 1 ? " - " : ""}
            </span>
          ))}
        </div>
        <div style={{ whiteSpace: "pre-wrap" }}>{data.description}</div>
        {new Date(data.dates[0].start) > new Date() && (
          <button
            className="btn-red"
            onClick={() => {
              router.push("/tickets");
            }}
          >
            Buy tickets
          </button>
        )}
      </div>

      <Carousel
        className={styles.carousel}
        slideSize="70%"
        slideGap="md"
        loop
        withIndicators
      >
        {data.images.map((image, index) => (
          <Carousel.Slide key={index}>
            <Image
              src={image}
              alt={data.title}
              height={window.innerHeight - 200}
              style={{ objectFit: "contain" }}
            />
          </Carousel.Slide>
        ))}
      </Carousel>
    </div>
  );
};

export default EventPage;
