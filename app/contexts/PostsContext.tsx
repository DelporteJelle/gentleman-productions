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
  HighlightedEvent,
  isEvent,
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
  delay,
  CACHE_INVALIDATION_DELAY,
} from "@/lib/api";

// ============================================================================
// Types
// ============================================================================

interface PostsState {
  posts: Post[];
  highlight: HighlightedEvent | null;
  loading: boolean;
  error: string | null;
}

interface PostsContextValue extends PostsState {
  // Post operations
  fetchPosts: (skipCache?: boolean) => Promise<void>;
  fetchPostById: (id: string) => Promise<Post | null>;
  removePost: (uuid: string) => Promise<void>;

  // Event-specific operations (extend for other post types)
  createEvent: (event: Event) => Promise<void>;
  updateEvent: (uuid: string, event: Event) => Promise<void>;

  // Highlight operations
  fetchHighlight: (skipCache?: boolean) => Promise<void>;
  setHighlight: (eventUuid: string, validDate?: string) => Promise<void>;
  clearHighlight: () => Promise<void>;

  // Computed values
  events: Event[];
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
  async create(event: Event): Promise<{ message: string }> {
    return apiPost<{ message: string }, Event>("/api/events", event);
  },

  async update(uuid: string, event: Event): Promise<Event> {
    return apiPut<Event, Event>(`/api/events/${uuid}`, event);
  },
};

const HighlightAPI = {
  async fetch(): Promise<HighlightedEvent[]> {
    return apiGet<HighlightedEvent[]>("/api/highlight");
  },

  async set(eventUuid: string, validDate: string): Promise<void> {
    await apiPut("/api/highlight", {
      event_uuid: eventUuid,
      valid_date: validDate,
    });
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

        // Invalidate cache and refetch
        clearCache(CacheKeys.POSTS);
        await delay(CACHE_INVALIDATION_DELAY);
        await fetchPosts(true);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to delete post";
        updateState({ error: message, loading: false });
        notifyError("Error", message);
      }
    },
    [fetchPosts, updateState],
  );

  // ============================================================================
  // Event Operations
  // ============================================================================

  const createEvent = useCallback(
    async (event: Event) => {
      updateState({ loading: true, error: null });

      try {
        await EventsAPI.create(event);
        notifySuccess("Success", "Event created successfully");

        // Invalidate cache and refetch
        clearCache(CacheKeys.POSTS);
        await delay(CACHE_INVALIDATION_DELAY);
        await fetchPosts(true);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to create event";
        updateState({ error: message, loading: false });
        notifyError("Error", message);
      }
    },
    [fetchPosts, updateState],
  );

  const updateEvent = useCallback(
    async (uuid: string, event: Event) => {
      updateState({ loading: true, error: null });

      try {
        await EventsAPI.update(uuid, event);
        notifySuccess("Success", "Event updated successfully");

        // Invalidate cache and refetch
        clearCache(CacheKeys.POSTS);
        await delay(CACHE_INVALIDATION_DELAY);
        await fetchPosts(true);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to update event";
        updateState({ error: message, loading: false });
        notifyError("Error", message);
      }
    },
    [fetchPosts, updateState],
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
          const cached = loadFromCache<HighlightedEvent>(CacheKeys.HIGHLIGHT);
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
        await HighlightAPI.set(eventUuid, date);
        notifySuccess("Success", "Highlight updated successfully");

        // Invalidate cache and refetch
        clearCache(CacheKeys.HIGHLIGHT);
        await delay(CACHE_INVALIDATION_DELAY);
        await fetchHighlight(true);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to update highlight";
        updateState({ error: message, loading: false });
        notifyError("Error", message);
      }
    },
    [fetchHighlight, updateState],
  );

  const clearHighlight = useCallback(async () => {
    updateState({ loading: true, error: null });

    try {
      await HighlightAPI.clear();
      notifySuccess("Success", "Highlight cleared successfully");

      // Invalidate cache and refetch
      clearCache(CacheKeys.HIGHLIGHT);
      await delay(CACHE_INVALIDATION_DELAY);
      await fetchHighlight(true);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to clear highlight";
      updateState({ error: message, loading: false });
      notifyError("Error", message);
    }
  }, [fetchHighlight, updateState]);

  // ============================================================================
  // Computed Values
  // ============================================================================

  // Filter posts by type - useful for getting only events
  const events = useMemo(() => state.posts.filter(isEvent), [state.posts]);

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

      // Highlight operations
      fetchHighlight,
      setHighlight,
      clearHighlight,

      // Computed
      events,

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
      fetchPosts,
      fetchPostById,
      removePost,
      createEvent,
      updateEvent,
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
