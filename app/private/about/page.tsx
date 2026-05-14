"use client";

import Image from "next/image";
import styles from "./page.module.css";
import { Button, Flex, Group, Stack } from "@mantine/core";
import MemberCard from "@/components/About/MemberCard";
import PartnerCard from "@/components/About/PartnerCard";
import { Partner, TeamMember } from "@/types";
import { useEffect, useState } from "react";
import { useAbout } from "@/app/contexts/AboutContext";
import CreateMemberModal from "@/components/Modals/CreateMemberModal";
import { ActionIcon } from "@mantine/core";
import { showNotification } from "@mantine/notifications";
import { IconEdit, IconTrashFilled } from "@tabler/icons-react";
import CreatePartnerModal from "@/components/Modals/CreatePartnerModal";
import { LoadingScreen } from "@/components/StateScreens/StateScreens";

export default function About() {
  const {
    teamMembers,
    partners,
    error,
    loading,
    createPartner,
    createTeamMember,
    updatePartner,
    updateTeamMember,
    deleteTeamMember,
    deletePartner,
  } = useAbout();
  const [memberModalOpened, setMemberModalOpened] = useState(false);
  const [partnerModalOpened, setPartnerModalOpened] = useState(false);

  const handleCreateMember = async (newMember: TeamMember) => {
    createTeamMember(newMember);
  };
  const handleUpdateMember = async (updatedMember: TeamMember) => {
    updateTeamMember(updatedMember);
  };
  const handleDeleteMember = async (uuid: string) => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this team member?",
    );
    if (confirmed) {
      deleteTeamMember(uuid);
    }
  };
  const handleCreatePartner = async (newPartner: Partner) => {
    createPartner(newPartner);
  };
  const handleUpdatePartner = async (updatedPartner: Partner) => {
    updatePartner(updatedPartner);
  };
  const handleDeletePartner = async (uuid: string) => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this partner?",
    );
    if (confirmed) {
      deletePartner(uuid);
    }
  };

  if (loading) return <LoadingScreen />;
  return (
    <Stack align="center">
      <h1>Meet the team</h1>
      <Group>
        <Button color="yellow" onClick={() => setMemberModalOpened(true)}>
          Create new Team Member
        </Button>
      </Group>

      <CreateMemberModal
        opened={memberModalOpened}
        onClose={() => setMemberModalOpened(false)}
        onSubmit={handleCreateMember}
      />
      <Flex wrap="wrap" justify="center" maw={1200}>
        {teamMembers &&
          teamMembers.map((member: TeamMember) => (
            <Stack key={member.uuid} gap={5} m={20}>
              <Group justify="center">
                <ActionIcon
                  color="red"
                  onClick={() => handleDeleteMember(member.uuid)}
                >
                  <IconTrashFilled />
                </ActionIcon>
                <ActionIcon color="yellow" onClick={() => {}}>
                  <IconEdit />
                </ActionIcon>
              </Group>
              <MemberCard member={member} />
            </Stack>
          ))}
      </Flex>

      <h1>Our partners</h1>
      <Group>
        <Button color="yellow" onClick={() => setPartnerModalOpened(true)}>
          Add partner
        </Button>
      </Group>

      <CreatePartnerModal
        opened={partnerModalOpened}
        onClose={() => setPartnerModalOpened(false)}
        onSubmit={handleCreatePartner}
      />

      <Flex wrap="wrap" justify="center" maw={1200}>
        {partners &&
          partners.map((partner: Partner) => (
            <Stack key={partner.uuid} gap={5} m={20}>
              <Group justify="center">
                <ActionIcon
                  color="red"
                  onClick={() => handleDeletePartner(partner.uuid)}
                >
                  <IconTrashFilled />
                </ActionIcon>
                <ActionIcon color="yellow" onClick={() => {}}>
                  <IconEdit />
                </ActionIcon>
              </Group>
              <PartnerCard partner={partner} />
            </Stack>
          ))}
      </Flex>
    </Stack>
  );
}
