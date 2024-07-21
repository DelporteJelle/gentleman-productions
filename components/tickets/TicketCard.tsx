"use client";

import styles from "./TicketCard.module.css";
import { Group, Image } from "@mantine/core";
import {
  IconCalendarFilled,
  IconCurrencyEuro,
  IconMapPinFilled,
} from "@tabler/icons-react";
import ExpandedTicketCard from "./ExpandedTicketCard/ExpandedTicketCard";

type props = {
  ticket: any;
  activeCard: string | undefined;
  setActiveCard: React.Dispatch<React.SetStateAction<string | undefined>>;
};

export default function TicketCard({
  ticket,
  activeCard,
  setActiveCard,
}: props) {
  if (ticket.uuid === activeCard) {
    return <ExpandedTicketCard ticket={ticket} setActiveCard={setActiveCard} />;
  }
  return (
    <div
      // className={styles.card}
      className={`${styles.card} ${activeCard ? styles.inactive : ""}`}
      onClick={() => {
        setActiveCard(ticket.uuid);
      }}
    >
      <Image
        src={ticket.imgSrc}
        alt={ticket.title}
        width={500}
        height={300}
        style={{ objectFit: "cover" }}
      />
      <div className={styles.content}>
        <Group justify="space-between">
          <div className="subheader bold">{ticket.title}</div>
          <div className={styles.price}>
            <IconCurrencyEuro />
            {ticket.price}
          </div>
        </Group>
        <div className="date d-flex my-2 ">
          <IconCalendarFilled className="me-2" />
          <span className="mx-1">
            {ticket.start.toLocaleDateString("nl-BE", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </span>
          <span className="mx-1">
            {ticket.start.toLocaleTimeString("nl-BE", {
              hour: "numeric",
              minute: "numeric",
            })}
          </span>
          {"-"}
          <span className="mx-1">
            {ticket.end.toLocaleTimeString("nl-BE", {
              hour: "numeric",
              minute: "numeric",
            })}
          </span>
        </div>
        <div className="d-flex">
          <IconMapPinFilled className="me-2" />
          {ticket.place.location}
        </div>
      </div>
    </div>
  );
}
