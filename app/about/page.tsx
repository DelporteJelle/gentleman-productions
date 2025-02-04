import Image from "next/image";
import styles from "./page.module.css";
import { Flex, Stack } from "@mantine/core";
import MemberCard from "@/components/About/MemberCard";
import PartnerCard from "@/components/About/PartnerCard";
import { Partner, TeamMember } from "@/types";

const team = [
  {
    uuid: "1",
    name: "John Doe",
    role: "Testingg",
    image: "/Placeholders/Person.jpg",
  },
  {
    uuid: "2",
    name: "John Doe",
    role: "Founder",
    image: "/Placeholders/Person.jpg",
  },

  {
    uuid: "3",
    name: "John Doe",
    role: "Founder",
    image: "/Placeholders/Person.jpg",
  },

  {
    uuid: "4",
    name: "John Doe",
    role: "Founder",
    image: "/Placeholders/Person.jpg",
  },

  {
    uuid: "5",
    name: "John Doe",
    role: "Founder",
    image: "/Placeholders/Person.jpg",
  },

  {
    uuid: "6",
    name: "John Doe",
    role: "Founder",
    image: "/Placeholders/Person.jpg",
  },

  {
    uuid: "7",
    name: "John Doe",
    role: "Founder",
    image: "/Placeholders/Person.jpg",
  },

  {
    uuid: "8",
    name: "John Doe",
    role: "Founder",
    image: "/Placeholders/Person.jpg",
  },

  {
    uuid: "9",
    name: "John Doe",
    role: "Founder",
    image: "/Placeholders/Person.jpg",
  },
];

const partners = [
  {
    uuid: "1",
    name: "Studio Regie",
    logo: "/Placeholders/Logo.svg",
    description: "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
  },
  {
    uuid: "2",
    name: "Studio Regie",
    logo: "/Placeholders/Logo.svg",
    description: "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
  },
  {
    uuid: "3",
    name: "Studio Regie",
    logo: "/Placeholders/Logo.svg",
    description: "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
  },
  {
    uuid: "4",
    name: "Studio Regie",
    logo: "/Placeholders/Logo.svg",
    description: "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
  },
  {
    uuid: "5",
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
