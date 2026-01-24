import React from "react";
import { Card, Button, Group, Text, CloseButton } from "@mantine/core";
import { Post } from "@/types";
import { usePosts } from "@/app/contexts/PostsContext";

interface BasicPostCardProps {
  post: Post;
}

const BasicPostCard: React.FC<BasicPostCardProps> = ({ post }) => {
  const { setHighlight } = usePosts();

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder w={500}>
      <h2>{post.title}</h2>
      <Group>
        {/* Uncomment to enable highlight button */}
        {/* <Button
          size="xs"
          color="yellow"
          onClick={() => setHighlight(post.uuid)}
        >
          Set as highlight
        </Button> */}
      </Group>
    </Card>
  );
};

export default BasicPostCard;
