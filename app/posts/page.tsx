"use client";

import { useEffect, useState } from "react";
import EventCard from "@/components/EventCard/EventCard"; // Adjust the path to your EventCard component
import { DbObjectType, Event, Post } from "@/types";
import { Button, Stack } from "@mantine/core";
import CreateEventModal from "@/components/Modals/CreateEventModal";

export default function PostsPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [type, setType] = useState<DbObjectType | undefined>(); // Filter type
  const [page, setPage] = useState(1); // Current page
  const [total, setTotal] = useState(0); // Total posts
  const [limit] = useState(10); // Posts per page
  const [modalOpened, setModalOpened] = useState(false); // Modal state

  useEffect(() => {
    // Fetch posts from the API
    const fetchPosts = async () => {
      const response = await fetch(
        `/api/posts?type=${type ?? ""}&page=${page}&limit=${limit}`,
      );
      const data = await response.json();
      setPosts(data.data);
      setTotal(data.total);
    };

    fetchPosts();
  }, [type, page, limit]);

  const totalPages = Math.ceil(total / limit);

  const handleCreateEvent = (newEvent: Event) => {
    // Add the new event to the database (mocked here)
    setPosts((prev) => [newEvent, ...prev]); // Add the new event to the list
  };

  return (
    <Stack align="center">
      <h1>Posts</h1>

      {/* Filter */}
      <div>
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
          {/* Add more types here */}
        </select>
      </div>

      {/* Posts */}
      <div>
        {posts.map((post, index) => {
          if (post.type === DbObjectType.EVENT) {
            return (
              <EventCard key={post.uuid} index={index} event={post as Event} />
            );
          }
        })}
      </div>

      {/* Create Post Button */}
      <Button color="red" onClick={() => setModalOpened(true)}>
        Create New Post
      </Button>

      {/* Create Event Modal */}
      <CreateEventModal
        opened={modalOpened}
        onClose={() => setModalOpened(false)}
        onCreate={handleCreateEvent}
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
