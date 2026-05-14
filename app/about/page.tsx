"use client";

import Image from "next/image";
import styles from "./page.module.css";
import { Flex, Group, Stack } from "@mantine/core";
import MemberCard from "@/components/About/MemberCard";
import PartnerCard from "@/components/About/PartnerCard";
import { Partner, TeamMember } from "@/types";
import { useEffect, useState } from "react";
import { useAbout } from "../contexts/AboutContext";
import CanvasBackground from "@/components/Background/CanvasBackground";
import { LoadingScreen, ErrorScreen } from "@/components/StateScreens/StateScreens";

export default function About() {
  const { teamMembers, partners, error, loading } = useAbout();

  if (loading) return <LoadingScreen />;
  if (error) return <ErrorScreen message={error} />;

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
      <Stack align="center">
        <h1>Meet the team</h1>
        <Flex wrap="wrap" justify="center" maw={1200}>
          {teamMembers &&
            teamMembers.map((member: TeamMember) => (
              <Group key={member.uuid} m={20}>
                <MemberCard member={member} />
              </Group>
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
    </>
  );
}
