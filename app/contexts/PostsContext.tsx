import { Event, Post } from "@/types";
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { showNotification } from "@mantine/notifications";

interface PostsContextProps {
  posts: Post[];
  highlightPost: any;
  editHighlight: (uuid: string, date: string | undefined) => void;
  deleteHighlight: () => void;
  setPosts: React.Dispatch<React.SetStateAction<Post[]>>;
  fetchPosts: () => Promise<void>;
  fetchEventById: (id: string) => Promise<Post | null>;
  loading: boolean;
  error: string | null;
  createEvent: (newEvent: Event) => Promise<void>;
  editEvent: (uuid: string, event: Event) => Promise<void>;
  removePost: (uuid: string) => Promise<void>;
}

const HIGHLIGHT_KEY = "highlightPost";
const POSTS_KEY = "posts";

const PostsContext = createContext<PostsContextProps | undefined>(undefined);

export const PostsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [highlightPost, setHighlightPost] = useState<Post | undefined>(
    undefined,
  );

  const ONE_WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000; // 1 week in milliseconds

  /* Utility function to save data to localStorage with a timestamp */
  const saveToLocalStorage = useCallback(
    (key: string, data: any) => {
      const item = {
        value: data,
        expiry: Date.now() + ONE_WEEK_IN_MS, // Current time + 1 week
      };
      localStorage.setItem(key, JSON.stringify(item));
    },
    [ONE_WEEK_IN_MS],
  );

  /* Utility function to load data from localStorage and check expiry */
  const loadFromLocalStorage = useCallback((key: string) => {
    const itemStr = localStorage.getItem(key);
    if (!itemStr) {
      return null;
    }

    const item = JSON.parse(itemStr);
    if (Date.now() > item.expiry) {
      // If the data has expired, remove it from localStorage
      localStorage.removeItem(key);
      return null;
    }

    return item.value;
  }, []);

  /* Fetch all posts */
  const fetchPosts = useCallback(
    async (skipCache = false) => {
      setLoading(true);
      setError(null);

      try {
        const page = 1;
        const limit = 100;
        const key = POSTS_KEY;
        const cachedPosts = !skipCache ? loadFromLocalStorage(key) : null;

        if (cachedPosts) {
          setPosts(cachedPosts);
          setLoading(false);
          return;
        }

        // No cache found, fetch from API
        const response = await fetch(`/api/posts?limit=${limit}&page=${page}`, {
          next: { tags: ["posts"] },
        });
        if (!response.ok) {
          throw new Error("Failed to fetch posts");
        }

        const data = await response.json();
        setPosts(data.data);
        saveToLocalStorage(key, data.data); // Save to localStorage
      } catch (err: any) {
        setError(err.message || "An error occurred");
      } finally {
        setLoading(false);
      }
    },
    [loadFromLocalStorage, saveToLocalStorage],
  );

  /* Fetch a single post by ID */
  const fetchEventById = useCallback(
    async (id: string): Promise<Post | null> => {
      const existingPost = posts.find((post) => post.uuid === id);
      if (existingPost) {
        return existingPost;
      }

      // If not found, fetch the post from the API
      try {
        setLoading(true);
        const response = await fetch(`/api/events/${id}`);
        if (!response.ok) {
          throw new Error("Failed to fetch the post");
        }

        const post = await response.json();

        // Add the fetched post to the list
        setPosts((prevPosts) => [...prevPosts, post]);

        return post;
      } catch (err: any) {
        setError(err.message || "An error occurred");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [posts],
  );

  const fetchHighlight = useCallback(
    async (skipCache = false) => {
      setLoading(true);
      setError(null);

      try {
        const cachedPost = !skipCache
          ? loadFromLocalStorage(HIGHLIGHT_KEY)
          : null;

        if (cachedPost) {
          setHighlightPost(cachedPost);
          setLoading(false);
          return;
        }

        // No cache found, fetch from API
        const response = await fetch(`/api/highlight`, {
          next: { tags: ["highlight"] },
        });
        if (!response.ok) {
          throw new Error("Failed to fetch posts");
        }

        const data = await response.json();
        setHighlightPost(data[0]);
        saveToLocalStorage(HIGHLIGHT_KEY, data[0]); // Save to localStorage
      } catch (err: any) {
        setError(err.message || "An error occurred");
      } finally {
        setLoading(false);
      }
    },
    [loadFromLocalStorage, saveToLocalStorage],
  );

  const editHighlight = useCallback(
    async (uuid: string, date: string | undefined) => {
      setLoading(true);
      setError(null);

      const valid_date = new Date();
      valid_date.setFullYear(valid_date.getFullYear() + 1);
      try {
        const response = await fetch(`/api/highlight`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            event_uuid: uuid,
            valid_date: date ? date : valid_date,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to update highlight");
        }

        showNotification({
          title: "Success",
          message: "Highlight updated successfully",
          color: "green",
        });

        // Clear cache and refetch highlight
        localStorage.removeItem(HIGHLIGHT_KEY);

        // Wait for cache invalidation and DB replication
        await new Promise((resolve) => setTimeout(resolve, 100));
        await fetchHighlight(true);
      } catch (err: any) {
        setError(err.message || "An error occurred");
      } finally {
        setLoading(false);
      }
    },
    [fetchHighlight],
  );

  const deleteHighlight = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/highlight`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete highlight");
      }

      showNotification({
        title: "Success",
        message: "Highlight deleted successfully",
        color: "green",
      });

      // Clear cache and refetch highlight
      localStorage.removeItem(HIGHLIGHT_KEY);

      // Wait for cache invalidation and DB replication
      await new Promise((resolve) => setTimeout(resolve, 100));
      await fetchHighlight(true);
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [fetchHighlight]);

  const createEvent = useCallback(
    async (newEvent: Event) => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/events", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(newEvent),
        });

        if (!response.ok) {
          throw new Error("Failed to create event");
        }

        showNotification({
          title: "Success",
          message: "Event created successfully",
          color: "green",
        });

        // Clear cache and refetch posts
        localStorage.removeItem(POSTS_KEY);

        // Wait for cache invalidation and DB replication
        await new Promise((resolve) => setTimeout(resolve, 500));
        await fetchPosts(true);
      } catch (err: any) {
        setError(err.message || "An error occurred");
      } finally {
        setLoading(false);
      }
    },
    [fetchPosts],
  );

  const editEvent = useCallback(
    async (uuid: string, event: Event) => {
      setLoading(true);
      setError(null);
      console.log(event);
      try {
        const response = await fetch(`/api/events/${uuid}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(event),
        });

        if (!response.ok) {
          throw new Error("Failed to update event");
        }

        showNotification({
          title: "Success",
          message: "Event updated successfully",
          color: "green",
        });

        // Clear cache and refetch posts
        localStorage.removeItem(POSTS_KEY);

        // Wait for cache invalidation and DB replication
        await new Promise((resolve) => setTimeout(resolve, 500));
        await fetchPosts(true);
      } catch (err: any) {
        setError(err.message || "An error occurred");
        showNotification({
          title: "Error",
          message: err.message || "Failed to update event",
          color: "red",
        });
      } finally {
        setLoading(false);
      }
    },
    [fetchPosts],
  );

  const removePost = useCallback(
    async (uuid: string) => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/posts?uuid=${uuid}`, {
          method: "DELETE",
        });

        if (!response.ok) {
          throw new Error("Failed to delete event");
        }

        showNotification({
          title: "Success",
          message: "Event deleted successfully",
          color: "green",
        });

        // Clear cache and refetch posts
        localStorage.removeItem(POSTS_KEY);

        // Wait for cache invalidation and DB replication
        await new Promise((resolve) => setTimeout(resolve, 500));
        await fetchPosts(true);
      } catch (err: any) {
        setError(err.message || "An error occurred");
      } finally {
        setLoading(false);
      }
    },
    [fetchPosts],
  );

  useEffect(() => {
    fetchPosts();
    fetchHighlight();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  useEffect(() => {
    if (error) {
      showNotification({
        title: "Error",
        message: error,
        color: "red",
      });
    }
  }, [loading, error]);

  return (
    <PostsContext.Provider
      value={{
        posts,
        setPosts,
        fetchPosts,
        fetchEventById,
        loading,
        error,
        highlightPost,
        editHighlight,
        deleteHighlight,
        createEvent,
        editEvent,
        removePost,
      }}
    >
      {children}
    </PostsContext.Provider>
  );
};

// Custom hook to use the PostsContext
export const usePosts = () => {
  const context = useContext(PostsContext);
  if (!context) {
    throw new Error("usePosts must be used within a PostsProvider");
  }
  return context;
};
