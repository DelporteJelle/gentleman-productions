import { TeamMember } from "@/types";
import { Image, Stack, Text } from "@mantine/core";

export interface MemberCardProps {
  member: TeamMember;
}
export default function MemerCard({ member }: MemberCardProps) {
  return (
    <Stack
      align="center"
      gap={0}
      p={5}
      style={{
        width: "220px",
        height: "310px",
        backgroundColor: "var(--gray-800)",
        borderRadius: "10px",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "220px",
          backgroundImage: `url(${member.image ?? "/Placeholders/Person.jpg"})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          borderRadius: "5px",
        }}
      />
      <h3 style={{ margin: "0" }}>{member.member_name}</h3>

      <Text>{member.member_role}</Text>
    </Stack>
  );
}
