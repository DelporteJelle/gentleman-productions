"use client";
import { Event, EventDateEntry, EventLocation } from "@/types";
import styles from "./TicketCard.module.css";
import { Group, Image } from "@mantine/core";
import {
  IconCalendarFilled,
  IconCurrencyEuro,
  IconMapPinFilled,
} from "@tabler/icons-react";
import ExpandedTicketCard from "./ExpandedTicketCard/ExpandedTicketCard";

type props = {
  date: EventDateEntry;
  event: Event;
  activeCard: string | undefined;
  setActiveCard: React.Dispatch<React.SetStateAction<string | undefined>>;
};

export default function TicketCard({
  date,
  event,
  activeCard,
  setActiveCard,
}: props) {
  if (date.uuid === activeCard) {
    return <ExpandedTicketCard date={date} event={event} setActiveCard={setActiveCard} />;
  }
  return (
    <div
      // className={styles.card}
      className={`${styles.card} ${activeCard ? styles.inactive : ""}`}
      onClick={() => {
        setActiveCard(date.uuid);
      }}
    >
      <Image
        src={event.mainImage}
        alt={event.title}
        width={500}
        height={300}
        style={{ objectFit: "cover" }}
      />
      <div className={styles.content}>
        <Group justify="space-between">
          <h2 >{event.title}</h2>
          {date.price && (
            <div className={styles.price}>
              <IconCurrencyEuro />
              {date.price}
            </div>
          )}
        </Group>
        <div className="date">
          <IconCalendarFilled  />
          <span>
            {new Date(date.start).toLocaleDateString("nl-BE", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </span>
          {" - "}
          <span>
            {new Date(date.start).toLocaleTimeString("nl-BE", {
              hour: "numeric",
              minute: "numeric",
            })}
          </span>
          {"-"}
          <span>
            {new Date(date.end).toLocaleTimeString("nl-BE", {
              hour: "numeric",
              minute: "numeric",
            })}
          </span>
        </div>
        <div className="d-flex">
          <IconMapPinFilled className="me-2" />
          {event.eventLocation?.location}
        </div>
      </div>
    </div>
  );
}
