"use client";

import { useEffect, useState } from "react";
import EventCard from "@/components/EventCard/EventCard"; // Adjust the path to your EventCard component
import { DbObjectType, Event, Post } from "@/types";
import { Button, Group, Stack, ActionIcon } from "@mantine/core";
import CreateEventModal from "@/components/Modals/CreateEventModal";
import { DateTimePicker } from "@mantine/dates";
import BasicPostCard from "@/components/EventCard/BasicPostCard";
import { usePosts } from "@/app/contexts/PostsContext";
import { IconTrash, IconEdit, IconFlagStar } from "@tabler/icons-react";
import { Tooltip } from "@mantine/core";

export default function PostsPage() {
  const [type, setType] = useState<DbObjectType | undefined>(); // Filter type
  const [page, setPage] = useState(1); // Current page
  const [total, setTotal] = useState(0); // Total posts
  const [limit] = useState(10); // Posts per page
  const [modalOpened, setModalOpened] = useState(false); // Modal state
  const [eventToEdit, setEventToEdit] = useState<Event | undefined>(undefined); // Event to edit

  const {
    posts,
    loading,
    error,
    setPosts,
    editHighlight,
    removePost,
    highlightPost,
    deleteHighlight,
  } = usePosts();

  const handleEdit = (uuid: string) => {
    const event = posts.find((post) => post.uuid === uuid) as Event;
    if (event) {
      setEventToEdit(event);
      setModalOpened(true);
    }
  };

  const totalPages = Math.ceil(total / limit) + 1;

  if (loading) return <p>Loading...</p>;

  return (
    <Stack align="center">
      <h1>Posts</h1>

      {/* Filter */}
      {/* <div>
        <label htmlFor="type">Filter by Type:</label>
        <select
          id="type"
          value={type}
          onChange={(e) => {
            setType(e.target.value as DbObjectType);
            setPage(1);
          }}
        >
          <option value="">All</option>
          {Object.values(DbObjectType).map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div> */}

      {/* Posts */}
      <div>
        <Group justify="center">
          {posts &&
            posts.map((post, index) => {
              return postWrapper(
                post,
                handleEdit,
                removePost,
                editHighlight,
                deleteHighlight,
                highlightPost,
                index,
              );
            })}
        </Group>
      </div>

      {/* Create Post Button */}
      <Button color="red" onClick={() => setModalOpened(true)}>
        Create New Post
      </Button>

      {/* Create Event Modal */}
      <CreateEventModal
        opened={modalOpened}
        onClose={() => {
          setModalOpened(false);
          setEventToEdit(undefined);
        }}
        event={eventToEdit}
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
  editHighlight: (uuid: string, value: any) => void,
  deleteHighlight: () => void,
  highlightPost: any,
  index: number,
) => {
  const isHighlighted = highlightPost?.uuid === post.uuid;
  console.log(highlightPost);
  const handleHighlightToggle = () => {
    if (isHighlighted) {
      deleteHighlight();
    } else {
      editHighlight(post.uuid, undefined);
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
      ) : (
        <BasicPostCard post={post as Post} />
      )}
    </div>
  );
};
