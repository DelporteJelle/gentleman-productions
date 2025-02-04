import { Partner } from "@/types";
import { Image, Stack, Text } from "@mantine/core";

interface props {
  partner: Partner;
}
export default function PartnerCard({ partner }: props) {
  return (
    <Stack
      align="center"
      m={30}
      gap={0}
      p={5}
      style={{
        width: "320px",
        height: "220px",
        // backgroundColor: "var(--gray-800)",
        borderRadius: "10px",
      }}
    >
      <Image src={partner.logo} alt={partner.name} h="150px" />
      <h3 style={{ margin: "0" }}>{partner.name}</h3>

      <Text>{partner.description}</Text>
    </Stack>
  );
}
