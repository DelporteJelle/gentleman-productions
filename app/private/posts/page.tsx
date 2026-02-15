"use client";

import { useEffect, useState } from "react";
import EventCard from "@/components/EventCard/EventCard"; // Adjust the path to your EventCard component
import { DbObjectType, Event, BasicPost, Post } from "@/types";
import { Button, Group, Stack, ActionIcon, Menu } from "@mantine/core";
import CreateEventModal from "@/components/Modals/CreateEventModal";
import CreateBasicPostModal from "@/components/Modals/CreateBasicPostModal";
import { DateTimePicker } from "@mantine/dates";
import BasicPostCard from "@/components/EventCard/BasicPostCard";
import { usePosts } from "@/app/contexts/PostsContext";
import {
  IconTrash,
  IconEdit,
  IconFlagStar,
  IconPlus,
  IconCalendarEvent,
  IconArticle,
} from "@tabler/icons-react";
import { Tooltip } from "@mantine/core";

export default function PostsPage() {
  const [type, setType] = useState<DbObjectType | undefined>(); // Filter type
  const [page, setPage] = useState(1); // Current page
  const [total, setTotal] = useState(0); // Total posts
  const [limit] = useState(10); // Posts per page
  const [eventModalOpened, setEventModalOpened] = useState(false);
  const [basicPostModalOpened, setBasicPostModalOpened] = useState(false);
  const [eventToEdit, setEventToEdit] = useState<Event | undefined>(undefined);
  const [basicPostToEdit, setBasicPostToEdit] = useState<
    BasicPost | undefined
  >(undefined);

  const {
    posts,
    loading,
    error,
    setHighlight,
    removePost,
    highlight,
    clearHighlight,
  } = usePosts();

  const handleEdit = (uuid: string) => {
    const post = posts.find((post) => post.uuid === uuid);
    if (!post) return;

    if (post.post_type === DbObjectType.EVENT) {
      setEventToEdit(post as Event);
      setEventModalOpened(true);
    } else if (post.post_type === DbObjectType.BASIC_POST) {
      setBasicPostToEdit(post as BasicPost);
      setBasicPostModalOpened(true);
    }
  };

  const totalPages = Math.ceil(total / limit) + 1;

  if (loading) return <p>Loading...</p>;

  return (
    <Stack align="center">
      <h1>Posts</h1>

      {/* Posts */}
      <div>
        <Group justify="center">
          {posts &&
            posts.map((post, index) => {
              return postWrapper(
                post,
                handleEdit,
                removePost,
                setHighlight,
                clearHighlight,
                highlight,
                index,
              );
            })}
        </Group>
      </div>

      {/* Create Post Buttons */}
      <Menu shadow="md" width={200}>
        <Menu.Target>
          <Button color="red" leftSection={<IconPlus size={16} />}>
            Create New Post
          </Button>
        </Menu.Target>

        <Menu.Dropdown>
          <Menu.Item
            leftSection={<IconCalendarEvent size={16} />}
            onClick={() => setEventModalOpened(true)}
          >
            Event
          </Menu.Item>
          <Menu.Item
            leftSection={<IconArticle size={16} />}
            onClick={() => setBasicPostModalOpened(true)}
          >
            Basic Post
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>

      {/* Create Event Modal */}
      <CreateEventModal
        opened={eventModalOpened}
        onClose={() => {
          setEventModalOpened(false);
          setEventToEdit(undefined);
        }}
        event={eventToEdit}
      />

      {/* Create Basic Post Modal */}
      <CreateBasicPostModal
        opened={basicPostModalOpened}
        onClose={() => {
          setBasicPostModalOpened(false);
          setBasicPostToEdit(undefined);
        }}
        basicPost={basicPostToEdit}
      />

      {/* Pagination */}
      <div>
        <button
          onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
          disabled={page === 1}
        >
          Previous
        </button>
        <span>
          Page {page} of {totalPages}
        </span>
        <button
          onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
          disabled={page === totalPages}
        >
          Next
        </button>
      </div>
    </Stack>
  );
}

const postWrapper = (
  post: Post,
  onEdit: (uuid: string) => void,
  onRemove: (uuid: string) => void,
  setHighlight: (uuid: string, value?: string) => void,
  clearHighlight: () => void,
  highlight: Post | null,
  index: number,
) => {
  const isHighlighted = highlight?.uuid === post.uuid;

  const handleHighlightToggle = () => {
    if (isHighlighted) {
      clearHighlight();
    } else {
      setHighlight(post.uuid, undefined);
    }
  };

  return (
    <div key={post.uuid} style={{ position: "relative", margin: 8 }}>
      <div
        style={{
          position: "absolute",
          top: 20,
          right: 8,
          zIndex: 2,
          display: "flex",
          gap: 8,
        }}
      >
        <Tooltip
          label={
            isHighlighted ? "Remove highlight" : "Set this post as highlight"
          }
          position="top"
          withArrow
        >
          <ActionIcon
            color={isHighlighted ? "yellow" : "blue"}
            variant={isHighlighted ? "filled" : "light"}
            onClick={handleHighlightToggle}
          >
            <IconFlagStar size={20} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Edit post" position="top" withArrow>
          <ActionIcon
            color="yellow"
            variant="light"
            onClick={() => onEdit(post.uuid)}
          >
            <IconEdit size={20} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Delete post" position="top" withArrow>
          <ActionIcon
            color="red"
            variant="light"
            onClick={() => onRemove(post.uuid)}
          >
            <IconTrash size={20} />
          </ActionIcon>
        </Tooltip>
      </div>
      {post.post_type === DbObjectType.EVENT ? (
        <EventCard event={post as Event} index={index} />
      ) : post.post_type === DbObjectType.BASIC_POST ? (
        <BasicPostCard post={post as BasicPost} index={index} />
      ) : null}
    </div>
  );
};
