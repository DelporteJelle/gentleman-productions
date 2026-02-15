"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import {
  Event,
  Post,
  BasicPost,
  HighlightedEvent,
  HighlightedPost,
  isEvent,
  isBasicPost,
  PaginatedResponse,
} from "@/types";
import { CacheKeys, saveToCache, loadFromCache, clearCache } from "@/lib/cache";
import {
  apiGet,
  apiPost,
  apiPut,
  apiDelete,
  notifySuccess,
  notifyError,
} from "@/lib/api";

// ============================================================================
// Types
// ============================================================================

interface PostsState {
  posts: Post[];
  highlight: HighlightedPost | null;
  loading: boolean;
  error: string | null;
}

interface PostsContextValue extends PostsState {
  // Post operations
  fetchPosts: (skipCache?: boolean) => Promise<void>;
  fetchPostById: (id: string) => Promise<Post | null>;
  removePost: (uuid: string) => Promise<void>;

  // Event-specific operations
  createEvent: (event: Event) => Promise<void>;
  updateEvent: (uuid: string, event: Event) => Promise<void>;

  // BasicPost-specific operations
  createBasicPost: (post: BasicPost) => Promise<void>;
  updateBasicPost: (uuid: string, post: BasicPost) => Promise<void>;

  // Highlight operations
  fetchHighlight: (skipCache?: boolean) => Promise<void>;
  setHighlight: (postUuid: string, validDate?: string) => Promise<void>;
  clearHighlight: () => Promise<void>;

  // Computed values
  events: Event[];
  basicPosts: BasicPost[];
}

// ============================================================================
// Context
// ============================================================================

const PostsContext = createContext<PostsContextValue | undefined>(undefined);

// ============================================================================
// API Functions
// ============================================================================

const PostsAPI = {
  async fetchAll(page = 1, limit = 100): Promise<PaginatedResponse<Post>> {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    return apiGet<PaginatedResponse<Post>>(`/api/posts?${params}`);
  },

  async fetchById(id: string): Promise<Post> {
    return apiGet<Post>(`/api/events/${id}`);
  },

  async delete(uuid: string): Promise<void> {
    await apiDelete(`/api/posts?uuid=${uuid}`);
  },
};

const EventsAPI = {
  async create(event: Event): Promise<Event> {
    return apiPost<Event, Event>("/api/events", event);
  },

  async update(uuid: string, event: Event): Promise<Event> {
    return apiPut<Event, Event>(`/api/events/${uuid}`, event);
  },
};

const BasicPostsAPI = {
  async create(post: BasicPost): Promise<BasicPost> {
    return apiPost<BasicPost, BasicPost>("/api/basic-posts", post);
  },

  async update(uuid: string, post: BasicPost): Promise<BasicPost> {
    return apiPut<BasicPost, BasicPost>(`/api/basic-posts/${uuid}`, post);
  },
};

const HighlightAPI = {
  async fetch(): Promise<HighlightedPost[]> {
    return apiGet<HighlightedPost[]>("/api/highlight");
  },

  async set(eventUuid: string, validDate: string): Promise<HighlightedPost> {
    return apiPut<HighlightedPost, { event_uuid: string; valid_date: string }>(
      "/api/highlight",
      {
        event_uuid: eventUuid,
        valid_date: validDate,
      }
    );
  },

  async clear(): Promise<void> {
    await apiDelete("/api/highlight");
  },
};

// ============================================================================
// Provider Component
// ============================================================================

export const PostsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [state, setState] = useState<PostsState>({
    posts: [],
    highlight: null,
    loading: false,
    error: null,
  });

  // Helper to update state partially
  const updateState = useCallback((updates: Partial<PostsState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  // ============================================================================
  // Post Operations
  // ============================================================================

  const fetchPosts = useCallback(
    async (skipCache = false) => {
      updateState({ loading: true, error: null });

      try {
        // Try cache first if not skipping
        if (!skipCache) {
          const cached = loadFromCache<Post[]>(CacheKeys.POSTS);
          if (cached) {
            updateState({ posts: cached, loading: false });
            return;
          }
        }

        // Fetch from API
        const response = await PostsAPI.fetchAll();
        saveToCache(CacheKeys.POSTS, response.data);
        updateState({ posts: response.data, loading: false });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to fetch posts";
        updateState({ error: message, loading: false });
        notifyError("Error", message);
      }
    },
    [updateState],
  );

  const fetchPostById = useCallback(
    async (id: string): Promise<Post | null> => {
      // Check if already in state
      const existing = state.posts.find((post) => post.uuid === id);
      if (existing) return existing;

      updateState({ loading: true, error: null });

      try {
        const post = await PostsAPI.fetchById(id);

        // Add to posts array
        setState((prev) => ({
          ...prev,
          posts: [...prev.posts, post],
          loading: false,
        }));

        return post;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to fetch post";
        updateState({ error: message, loading: false });
        return null;
      }
    },
    [state.posts, updateState],
  );

  const removePost = useCallback(
    async (uuid: string) => {
      updateState({ loading: true, error: null });

      try {
        await PostsAPI.delete(uuid);
        notifySuccess("Success", "Post deleted successfully");

        // Update state directly and save to cache
        setState((prev) => {
          const updatedPosts = prev.posts.filter((p) => p.uuid !== uuid);
          saveToCache(CacheKeys.POSTS, updatedPosts);
          return {
            ...prev,
            posts: updatedPosts,
            loading: false,
          };
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to delete post";
        updateState({ error: message, loading: false });
        notifyError("Error", message);
      }
    },
    [updateState],
  );

  // ============================================================================
  // Event Operations
  // ============================================================================

  const createEvent = useCallback(
    async (event: Event) => {
      updateState({ loading: true, error: null });

      try {
        const createdEvent = await EventsAPI.create(event);
        notifySuccess("Success", "Event created successfully");

        // Update state directly and save to cache
        setState((prev) => {
          const updatedPosts = [...prev.posts, createdEvent];
          saveToCache(CacheKeys.POSTS, updatedPosts);
          return {
            ...prev,
            posts: updatedPosts,
            loading: false,
          };
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to create event";
        updateState({ error: message, loading: false });
        notifyError("Error", message);
      }
    },
    [updateState],
  );

  const updateEvent = useCallback(
    async (uuid: string, event: Event) => {
      updateState({ loading: true, error: null });

      try {
        const updatedEvent = await EventsAPI.update(uuid, event);
        notifySuccess("Success", "Event updated successfully");

        // Update state directly and save to cache
        setState((prev) => {
          const updatedPosts = prev.posts.map((p) =>
            p.uuid === uuid ? updatedEvent : p
          );
          saveToCache(CacheKeys.POSTS, updatedPosts);
          return {
            ...prev,
            posts: updatedPosts,
            loading: false,
          };
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to update event";
        updateState({ error: message, loading: false });
        notifyError("Error", message);
      }
    },
    [updateState],
  );

  // ============================================================================
  // BasicPost Operations
  // ============================================================================

  const createBasicPost = useCallback(
    async (post: BasicPost) => {
      updateState({ loading: true, error: null });

      try {
        const createdPost = await BasicPostsAPI.create(post);
        notifySuccess("Success", "Post created successfully");

        // Update state directly and save to cache
        setState((prev) => {
          const updatedPosts = [...prev.posts, createdPost];
          saveToCache(CacheKeys.POSTS, updatedPosts);
          return {
            ...prev,
            posts: updatedPosts,
            loading: false,
          };
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to create post";
        updateState({ error: message, loading: false });
        notifyError("Error", message);
      }
    },
    [updateState],
  );

  const updateBasicPost = useCallback(
    async (uuid: string, post: BasicPost) => {
      updateState({ loading: true, error: null });

      try {
        const updatedPost = await BasicPostsAPI.update(uuid, post);
        notifySuccess("Success", "Post updated successfully");

        // Update state directly and save to cache
        setState((prev) => {
          const updatedPosts = prev.posts.map((p) =>
            p.uuid === uuid ? updatedPost : p
          );
          saveToCache(CacheKeys.POSTS, updatedPosts);
          return {
            ...prev,
            posts: updatedPosts,
            loading: false,
          };
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to update post";
        updateState({ error: message, loading: false });
        notifyError("Error", message);
      }
    },
    [updateState],
  );

  // ============================================================================
  // Highlight Operations
  // ============================================================================

  const fetchHighlight = useCallback(
    async (skipCache = false) => {
      updateState({ loading: true, error: null });

      try {
        // Try cache first if not skipping
        if (!skipCache) {
          const cached = loadFromCache<HighlightedPost>(CacheKeys.HIGHLIGHT);
          if (cached) {
            updateState({ highlight: cached, loading: false });
            return;
          }
        }

        // Fetch from API
        const data = await HighlightAPI.fetch();
        const highlight = data[0] || null;

        if (highlight) {
          saveToCache(CacheKeys.HIGHLIGHT, highlight);
        }
        updateState({ highlight, loading: false });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to fetch highlight";
        updateState({ error: message, loading: false });
      }
    },
    [updateState],
  );

  const setHighlight = useCallback(
    async (eventUuid: string, validDate?: string) => {
      updateState({ loading: true, error: null });

      // Default to 1 year from now if no date provided
      const date =
        validDate ||
        new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

      try {
        const updatedHighlight = await HighlightAPI.set(eventUuid, date);
        notifySuccess("Success", "Highlight updated successfully");

        // Update state and cache directly
        saveToCache(CacheKeys.HIGHLIGHT, updatedHighlight);
        updateState({ highlight: updatedHighlight, loading: false });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to update highlight";
        updateState({ error: message, loading: false });
        notifyError("Error", message);
      }
    },
    [updateState],
  );

  const clearHighlight = useCallback(async () => {
    updateState({ loading: true, error: null });

    try {
      await HighlightAPI.clear();
      notifySuccess("Success", "Highlight cleared successfully");

      // Update state and cache directly
      clearCache(CacheKeys.HIGHLIGHT);
      updateState({ highlight: null, loading: false });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to clear highlight";
      updateState({ error: message, loading: false });
      notifyError("Error", message);
    }
  }, [updateState]);

  // ============================================================================
  // Computed Values
  // ============================================================================

  // Filter posts by type - useful for getting only events
  const events = useMemo(() => state.posts.filter(isEvent), [state.posts]);

  // Filter posts by type - useful for getting only basic posts
  const basicPosts = useMemo(
    () => state.posts.filter(isBasicPost),
    [state.posts],
  );

  // ============================================================================
  // Effects
  // ============================================================================

  // Initial data fetch
  useEffect(() => {
    fetchPosts();
    fetchHighlight();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ============================================================================
  // Context Value
  // ============================================================================

  const value: PostsContextValue = useMemo(
    () => ({
      // State
      posts: state.posts,
      highlight: state.highlight,
      loading: state.loading,
      error: state.error,

      // Post operations
      fetchPosts,
      fetchPostById,
      removePost,

      // Event operations
      createEvent,
      updateEvent,

      // BasicPost operations
      createBasicPost,
      updateBasicPost,

      // Highlight operations
      fetchHighlight,
      setHighlight,
      clearHighlight,

      // Computed
      events,
      basicPosts,

      // Legacy compatibility aliases
      highlightPost: state.highlight,
      editHighlight: setHighlight,
      deleteHighlight: clearHighlight,
      fetchEventById: fetchPostById,
      editEvent: updateEvent,
    }),
    [
      state,
      events,
      basicPosts,
      fetchPosts,
      fetchPostById,
      removePost,
      createEvent,
      updateEvent,
      createBasicPost,
      updateBasicPost,
      fetchHighlight,
      setHighlight,
      clearHighlight,
    ],
  );

  return (
    <PostsContext.Provider value={value}>{children}</PostsContext.Provider>
  );
};

// ============================================================================
// Hook
// ============================================================================

export const usePosts = (): PostsContextValue => {
  const context = useContext(PostsContext);
  if (!context) {
    throw new Error("usePosts must be used within a PostsProvider");
  }
  return context;
};
