import Image from "next/image";
import styles from "./page.module.css";
import { Flex, Stack } from "@mantine/core";
import MemberCard from "@/components/About/MemberCard";
import PartnerCard from "@/components/About/PartnerCard";
import { Partner, TeamMember } from "@/types";

const team = [
  {
    uuid: "1",
    created_at: "2023-10-01T12:00:00Z",
    name: "John Doe",
    role: "Testingg",
    image: "/Placeholders/Person.jpg",
  },
  {
    uuid: "2",
    created_at: "2023-10-01T12:00:00Z",
    name: "John Doe",
    role: "Founder",
    image: "/Placeholders/Person.jpg",
  },

  {
    uuid: "3",
    created_at: "2023-10-01T12:00:00Z",
    name: "John Doe",
    role: "Founder",
    image: "/Placeholders/Person.jpg",
  },

  {
    uuid: "4",
    created_at: "2023-10-01T12:00:00Z",
    name: "John Doe",
    role: "Founder",
    image: "/Placeholders/Person.jpg",
  },

  {
    uuid: "5",
    created_at: "2023-10-01T12:00:00Z",
    name: "John Doe",
    role: "Founder",
    image: "/Placeholders/Person.jpg",
  },

  {
    uuid: "6",
    created_at: "2023-10-01T12:00:00Z",
    name: "John Doe",
    role: "Founder",
    image: "/Placeholders/Person.jpg",
  },

  {
    uuid: "7",
    created_at: "2023-10-01T12:00:00Z",
    name: "John Doe",
    role: "Founder",
    image: "/Placeholders/Person.jpg",
  },

  {
    uuid: "8",
    created_at: "2023-10-01T12:00:00Z",
    name: "John Doe",
    role: "Founder",
    image: "/Placeholders/Person.jpg",
  },

  {
    uuid: "9",
    created_at: "2023-10-01T12:00:00Z",
    name: "John Doe",
    role: "Founder",
    image: "/Placeholders/Person.jpg",
  },
];

const partners = [
  {
    uuid: "1",
    created_at: "2023-10-01T12:00:00Z",
    name: "Studio Regie",
    logo: "/Placeholders/Logo.svg",
    description: "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
  },
  {
    uuid: "2",
    created_at: "2023-10-01T12:00:00Z",
    name: "Studio Regie",
    logo: "/Placeholders/Logo.svg",
    description: "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
  },
  {
    uuid: "3",
    created_at: "2023-10-01T12:00:00Z",
    name: "Studio Regie",
    logo: "/Placeholders/Logo.svg",
    description: "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
  },
  {
    uuid: "4",
    created_at: "2023-10-01T12:00:00Z",
    name: "Studio Regie",
    logo: "/Placeholders/Logo.svg",
    description: "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
  },
  {
    uuid: "5",
    created_at: "2023-10-01T12:00:00Z",
    name: "Studio Regie",
    logo: "/Placeholders/Logo.svg",
    description: "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
  },
];

export default function About() {
  return (
    <Stack align="center">
      <h1>Meet the team</h1>
      <Flex wrap="wrap" justify="center" maw={1200}>
        {team.map((member: TeamMember) => (
          <MemberCard key={member.uuid} member={member} />
        ))}
      </Flex>

      <h1>Our partners</h1>
      <Flex wrap="wrap" justify="center" maw={1200}>
        {partners.map((partner: Partner) => (
          <PartnerCard key={partner.uuid} partner={partner} />
        ))}
      </Flex>
    </Stack>
  );
}
