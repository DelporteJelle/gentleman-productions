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

  // Fetch all posts
  const fetchPosts = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/posts?limit=100&page=1");
      if (!response.ok) {
        throw new Error("Failed to fetch posts");
      }

      const data = await response.json();
      setPosts(data.data);
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  }, []);

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

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  return (
    <PostsContext.Provider
      value={{ posts, setPosts, fetchPosts, fetchEventById, loading, error }}
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
