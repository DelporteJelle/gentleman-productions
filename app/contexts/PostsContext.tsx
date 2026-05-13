"use client";

import React, {
  createContext,
  useContext,
  useCallback,
  useMemo,
} from "react";
import { useQuery, useQueryClient, useIsRestoring } from "@tanstack/react-query";
import {
  Event,
  Post,
  BasicPost,
  HighlightedPost,
  isEvent,
  isBasicPost,
  PaginatedResponse,
} from "@/types";
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
// Query Keys
// ============================================================================

export const postsQueryKeys = {
  all: ["posts"] as const,
  byId: (id: string) => ["posts", id] as const,
  highlight: ["highlight"] as const,
};

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
  const queryClient = useQueryClient();
  const isRestoring = useIsRestoring();

  const {
    data: posts = [],
    isLoading: postsLoading,
    error: postsError,
  } = useQuery({
    queryKey: postsQueryKeys.all,
    queryFn: async () => {
      const response = await PostsAPI.fetchAll();
      return response.data;
    },
  });

  const {
    data: highlight = null,
    isLoading: highlightLoading,
    error: highlightError,
  } = useQuery({
    queryKey: postsQueryKeys.highlight,
    queryFn: async () => {
      const data = await HighlightAPI.fetch();
      return data[0] ?? null;
    },
  });

  const loading = postsLoading || highlightLoading || isRestoring;
  const error = postsError?.message ?? highlightError?.message ?? null;

  // ============================================================================
  // Post Operations
  // ============================================================================

  const fetchPosts = useCallback(
    async (_skipCache?: boolean) => {
      await queryClient.invalidateQueries({ queryKey: postsQueryKeys.all });
    },
    [queryClient],
  );

  const fetchPostById = useCallback(
    async (id: string): Promise<Post | null> => {
      const cached = queryClient.getQueryData<Post[]>(postsQueryKeys.all);
      const existing = cached?.find((p) => p.uuid === id);
      if (existing) return existing;

      try {
        const post = await PostsAPI.fetchById(id);
        queryClient.setQueryData(postsQueryKeys.byId(id), post);
        return post;
      } catch {
        return null;
      }
    },
    [queryClient],
  );

  const removePost = useCallback(
    async (uuid: string) => {
      try {
        await PostsAPI.delete(uuid);
        notifySuccess("Success", "Post deleted successfully");
        await queryClient.invalidateQueries({ queryKey: postsQueryKeys.all });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to delete post";
        notifyError("Error", message);
      }
    },
    [queryClient],
  );

  // ============================================================================
  // Event Operations
  // ============================================================================

  const createEvent = useCallback(
    async (event: Event) => {
      try {
        await EventsAPI.create(event);
        notifySuccess("Success", "Event created successfully");
        await queryClient.invalidateQueries({ queryKey: postsQueryKeys.all });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to create event";
        notifyError("Error", message);
      }
    },
    [queryClient],
  );

  const updateEvent = useCallback(
    async (uuid: string, event: Event) => {
      try {
        await EventsAPI.update(uuid, event);
        notifySuccess("Success", "Event updated successfully");
        await queryClient.invalidateQueries({ queryKey: postsQueryKeys.all });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to update event";
        notifyError("Error", message);
      }
    },
    [queryClient],
  );

  // ============================================================================
  // BasicPost Operations
  // ============================================================================

  const createBasicPost = useCallback(
    async (post: BasicPost) => {
      try {
        await BasicPostsAPI.create(post);
        notifySuccess("Success", "Post created successfully");
        await queryClient.invalidateQueries({ queryKey: postsQueryKeys.all });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to create post";
        notifyError("Error", message);
      }
    },
    [queryClient],
  );

  const updateBasicPost = useCallback(
    async (uuid: string, post: BasicPost) => {
      try {
        await BasicPostsAPI.update(uuid, post);
        notifySuccess("Success", "Post updated successfully");
        await queryClient.invalidateQueries({ queryKey: postsQueryKeys.all });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to update post";
        notifyError("Error", message);
      }
    },
    [queryClient],
  );

  // ============================================================================
  // Highlight Operations
  // ============================================================================

  const fetchHighlight = useCallback(
    async (_skipCache?: boolean) => {
      await queryClient.invalidateQueries({ queryKey: postsQueryKeys.highlight });
    },
    [queryClient],
  );

  const setHighlight = useCallback(
    async (eventUuid: string, validDate?: string) => {
      const date =
        validDate ||
        new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

      try {
        await HighlightAPI.set(eventUuid, date);
        notifySuccess("Success", "Highlight updated successfully");
        await queryClient.invalidateQueries({ queryKey: postsQueryKeys.highlight });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to update highlight";
        notifyError("Error", message);
      }
    },
    [queryClient],
  );

  const clearHighlight = useCallback(async () => {
    try {
      await HighlightAPI.clear();
      notifySuccess("Success", "Highlight cleared successfully");
      queryClient.setQueryData(postsQueryKeys.highlight, null);
      await queryClient.invalidateQueries({ queryKey: postsQueryKeys.highlight });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to clear highlight";
      notifyError("Error", message);
    }
  }, [queryClient]);

  // ============================================================================
  // Computed Values
  // ============================================================================

  const events = useMemo(() => posts.filter(isEvent), [posts]);
  const basicPosts = useMemo(() => posts.filter(isBasicPost), [posts]);

  // ============================================================================
  // Context Value
  // ============================================================================

  const value: PostsContextValue = useMemo(
    () => ({
      posts,
      highlight,
      loading,
      error,

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

      events,
      basicPosts,

      // Legacy compatibility aliases
      highlightPost: highlight,
      editHighlight: setHighlight,
      deleteHighlight: clearHighlight,
      fetchEventById: fetchPostById,
      editEvent: updateEvent,
    }),
    [
      posts,
      highlight,
      loading,
      error,
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
