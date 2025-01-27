"use client";

import {
  IconArrowBadgeRightFilled,
  IconCalendarFilled,
  IconClockFilled,
  IconClockHour4Filled,
  IconCurrencyEuro,
  IconLocationFilled,
  IconMapPinFilled,
} from "@tabler/icons-react";
import styles from "./ExpandedTicketCard.module.css";
import { Avatar, Group, Image, Stack, Text, Timeline } from "@mantine/core";
import { Event, EventDateEntry } from "@/types";

type props = {
  event: Event;
  date: EventDateEntry;
  setActiveCard: React.Dispatch<React.SetStateAction<string | undefined>>;
};

export default function ExpandedTicketCard({ event, date, setActiveCard }: props) {
  return (
    <div
      className={styles.card}
      onClick={() => {
        setActiveCard(date.uuid);
      }}
    >
      <Image
        src={event.mainImage}
        alt={event.title}
        width={800}
        height={300}
        style={{ objectFit: "cover" }}
      />
      <div className={styles.content}>
        <Group justify="space-between">
          <h2>{event.title}</h2>
          {date.price && (
            <div className={styles.price}>
              <IconCurrencyEuro />
              {date.price}
            </div>
          )}
        </Group>

        <div>
          <h3>Description</h3>
          <Text c="white">{event.description}</Text>
        </div>

        <Group justify="space-around" mt={20}>
          {/* Event timeline */}
          <Stack justify="flex-start">
            <h3 >Event timeline</h3>
            <Timeline bulletSize={30} autoContrast active={10} color="yellow">
              <Timeline.Item
                bullet={<IconCalendarFilled color="white" />}
                title="Start datum"
              >
                <Text c="white" size="sm">
                  {new Date(date.start).toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  })}
                </Text>
              </Timeline.Item>
              {date.timeLine && date.timeLine.map((t) => (
                <Timeline.Item
                  key={t.time}
                  title={t.time}
                  bullet={<IconClockFilled color="white" />}
                >
                  <Text c="white" size="sm">{t.description}</Text>
                </Timeline.Item>
              ))}
            </Timeline>
          </Stack>
          {/* Event location */}
          <Stack>
            <h3>Event Location</h3>
            <Timeline
              bulletSize={30}
              autoContrast
              lineWidth={0}
              active={10}
              color="yellow"
            >
              {event.eventLocation && Object.entries(event.eventLocation).map(([key, value]) => (
                <Timeline.Item
                  bullet={<IconArrowBadgeRightFilled color="white" />}
                  key={key}
                  title={key.charAt(0).toUpperCase() + key.slice(1)}
                >
                  <Text c="white" size="sm">
                    {value as string}
                  </Text>
                </Timeline.Item>
              ))}
            </Timeline>
          </Stack>
        </Group>

        <Group justify="center" mt={20}>
          <button
            className="btn-red"
            onClick={() => {
              const urlWithHash = `${date.external_link}`;
              window.open(urlWithHash, "_blank");
            }}
          >
            {date.price ? "Buy tickets here" : "More info"}
          </button>
        </Group>
      </div>
    </div>
  );
}
