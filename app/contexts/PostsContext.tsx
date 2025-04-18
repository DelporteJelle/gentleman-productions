import { Post } from "@/types";
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";

interface PostsContextProps {
  posts: Post[];
  highlightPost: any;
  editHighlight: (post: Post) => void;
  setPosts: React.Dispatch<React.SetStateAction<Post[]>>;
  fetchPosts: () => Promise<void>;
  fetchEventById: (id: string) => Promise<Post | null>;
  loading: boolean;
  error: string | null;
}

const PostsContext = createContext<PostsContextProps | undefined>(undefined);

export const PostsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [highlightPost, setHighlightPost] = useState<any>(undefined);

  const ONE_WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000; // 1 week in milliseconds

  // Utility function to save data to localStorage with a timestamp
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

  // Utility function to load data from localStorage and check expiry
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

  // Fetch all posts
  const fetchPosts = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const page = 1;
      const limit = 100;
      const key = `posts_page_${page}_limit_${limit}`;
      const cachedPosts = loadFromLocalStorage(key);

      if (cachedPosts) {
        setPosts(cachedPosts);
      }

      if (!cachedPosts) {
        const response = await fetch(`/api/posts?limit=${limit}&page=${page}`);
        if (!response.ok) {
          throw new Error("Failed to fetch posts");
        }

        const data = await response.json();
        setPosts(data.data);
        saveToLocalStorage(key, data.data); // Save to localStorage
      }
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [loadFromLocalStorage, saveToLocalStorage]);

  // Fetch a single post by ID
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

  const fetchHighlight = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const cachedPost = loadFromLocalStorage("highlightPost");

      if (cachedPost) {
        setPosts(cachedPost);
      }

      if (!cachedPost) {
        const response = await fetch(`/api/highlight`);
        if (!response.ok) {
          throw new Error("Failed to fetch posts");
        }

        const data = await response.json();
        console.log(data);
        setHighlightPost(data.data);
        saveToLocalStorage("highlightPost", data.data); // Save to localStorage
      }
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [loadFromLocalStorage, saveToLocalStorage]);

  const editHighlight = useCallback(async (post: Post) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/highlight`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(post),
      });

      if (!response.ok) {
        throw new Error("Failed to update highlight");
      }

      const updatedPost = await response.json();
      setHighlightPost(updatedPost);
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPosts();
    fetchHighlight();
  }, [fetchHighlight, fetchPosts]);

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
