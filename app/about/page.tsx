"use client";

import Image from "next/image";
import styles from "./page.module.css";
import { Flex, Stack } from "@mantine/core";
import MemberCard from "@/components/About/MemberCard";
import PartnerCard from "@/components/About/PartnerCard";
import { Partner, TeamMember } from "@/types";
import { useEffect, useState } from "react";

export default function About() {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);

  useEffect(() => {
    // Fetch team data
    const fetchTeam = async () => {
      const response = await fetch("/api/team");
      const data = await response.json();
      setTeam(data);
    };

    // Fetch partners data
    const fetchPartners = async () => {
      const response = await fetch("/api/partners");
      const data = await response.json();
      setPartners(data);
    };

    fetchTeam();
    fetchPartners();
  }, []);

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
