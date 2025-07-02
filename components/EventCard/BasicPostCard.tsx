import React from "react";
import { Card, Button, Group, Text, CloseButton } from "@mantine/core";
import { Post } from "@/types";
import { usePosts } from "@/app/contexts/PostsContext";

interface BasicPostCardProps {
  post: Post;
  // onEdit: (uuid: string) => void;
  // onRemove: (uuid: string) => void;
}

const BasicPostCard: React.FC<BasicPostCardProps> = ({
  post,
  // onEdit,
  // onRemove,
}) => {
  const { editHighlight } = usePosts();

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder w={500}>
      {/* <CloseButton
        style={{
          position: "absolute",
          top: 10,
          right: 10,
        }}
        color="red"
        onClick={() => onRemove(post.uuid)}
      /> */}
      <h2>{post.title}</h2>
      <Group>
        {/* <Button color="yellow" size="xs" onClick={() => onRemove(post.uuid)}>
          Edit
        </Button>
        <Button
          size="xs"
          color="yellow"
          onClick={() => editHighlight(post.uuid, undefined)}
        >
          Set as highlight
        </Button> */}
      </Group>
    </Card>
  );
};

export default BasicPostCard;
