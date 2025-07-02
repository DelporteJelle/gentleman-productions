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

export default function PostsPage() {
  const [type, setType] = useState<DbObjectType | undefined>(); // Filter type
  const [page, setPage] = useState(1); // Current page
  const [total, setTotal] = useState(0); // Total posts
  const [limit] = useState(10); // Posts per page
  const [modalOpened, setModalOpened] = useState(false); // Modal state

  const { posts, loading, error, setPosts, editHighlight, removePost } =
    usePosts();

  const handleEdit = (uuid: string) => {
    console.log("Edit clicked");
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
        onClose={() => setModalOpened(false)}
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
  index: number,
) => {
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
        <ActionIcon
          color="blue"
          variant="light"
          onClick={() => editHighlight(post.uuid, undefined)}
        >
          <IconFlagStar size={20} />
        </ActionIcon>
        <ActionIcon
          color="yellow"
          variant="light"
          onClick={() => onEdit(post.uuid)}
        >
          <IconEdit size={20} />
        </ActionIcon>
        <ActionIcon
          color="red"
          variant="light"
          onClick={() => onRemove(post.uuid)}
        >
          <IconTrash size={20} />
        </ActionIcon>
      </div>
      {post.post_type === DbObjectType.EVENT ? (
        <EventCard event={post as Event} index={index} />
      ) : (
        <BasicPostCard post={post as Post} />
      )}
    </div>
  );
};
