"use client";

import Image from "next/image";
import styles from "./page.module.css";
import { Flex, Stack } from "@mantine/core";
import MemberCard from "@/components/About/MemberCard";
import PartnerCard from "@/components/About/PartnerCard";
import { Partner, TeamMember } from "@/types";
import { useEffect, useState } from "react";
import { useAbout } from "../contexts/AboutContext";

export default function About() {
  const { teamMembers, partners, error, loading } = useAbout();

  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error: {error}</p>;

  return (
    <Stack align="center">
      <h1>Meet the team</h1>
      <Flex wrap="wrap" justify="center" maw={1200}>
        {teamMembers &&
          teamMembers.map((member: TeamMember) => (
            <MemberCard key={member.uuid} member={member} />
          ))}
      </Flex>

      <h1>Our partners</h1>
      <Flex wrap="wrap" justify="center" maw={1200}>
        {partners &&
          partners.map((partner: Partner) => (
            <PartnerCard key={partner.uuid} partner={partner} />
          ))}
      </Flex>
    </Stack>
  );
}
