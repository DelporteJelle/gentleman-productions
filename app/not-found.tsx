"use client";

import { useRouter } from "next/navigation";
import { Button, Stack, Text } from "@mantine/core";

const NotFound = () => {
  const router = useRouter();

  return (
    <div>
      <Stack align="center" justify="center">
        <h1 style={{ fontSize: "4rem", margin: 0 }}>404</h1>
        <Text size="lg" style={{ textAlign: "center" }}>
          Oops! The page you are looking for does not exist.
        </Text>
        <Button variant="outline" color="red" onClick={() => router.push("/")}>
          Go Back to Home
        </Button>
      </Stack>
    </div>
  );
};

export default NotFound;
