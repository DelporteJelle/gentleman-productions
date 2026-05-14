"use client";
import TicketCard from "@/components/tickets/TicketCard";
import styles from "./styles.module.css";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useParams } from "next/navigation";
import { Event } from "@/types";
import CanvasBackground from "@/components/Background/CanvasBackground";
import { LoadingScreen } from "@/components/StateScreens/StateScreens";

export default function Tickets() {
  const [activeCard, setActiveCard] = useState<string | undefined>(undefined);
  const [event, setEvent] = useState<Event | undefined>(undefined);
  const router = useRouter();
  const { id } = useParams();

  useEffect(() => {
    fetch(`/api/events/${id}`)
      .then((response) => response.json())
      .then((data) => setEvent(data))
      .catch((error) => console.error("Error fetching data:", error));
  }, [id]);

  if (!event) {
    return <LoadingScreen />;
  }
  return (
    <>
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          zIndex: -1,
        }}
      >
        <CanvasBackground />
      </div>
      <div className={styles.page}>
        {event.dates.map((d) => (
          <TicketCard
            key={d.uuid}
            date={d}
            event={event}
            activeCard={activeCard}
            setActiveCard={setActiveCard}
          />
        ))}
      </div>
    </>
  );
}
