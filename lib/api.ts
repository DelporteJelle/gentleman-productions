/**
 * API service utilities for making HTTP requests with consistent
 * error handling, authentication, and caching support.
 */

import { showNotification } from "@mantine/notifications";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions extends RequestInit {
  skipNotification?: boolean;
}

/**
 * Base fetch wrapper with error handling
 */
async function baseFetch<T>(
  url: string,
  options: RequestOptions = {}
): Promise<T> {
  const { skipNotification, ...fetchOptions } = options;

  const response = await fetch(url, {
    ...fetchOptions,
    headers: {
      "Content-Type": "application/json",
      ...fetchOptions.headers,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new ApiError(
      errorData.error || `Request failed with status ${response.status}`,
      response.status,
      errorData
    );
  }

  // Handle empty responses (e.g., 204 No Content)
  const text = await response.text();
  if (!text) {
    return {} as T;
  }

  return JSON.parse(text) as T;
}

/**
 * GET request helper
 */
export async function apiGet<T>(
  url: string,
  options: RequestOptions = {}
): Promise<T> {
  return baseFetch<T>(url, {
    method: "GET",
    cache: "no-store",
    ...options,
  });
}

/**
 * POST request helper
 */
export async function apiPost<T, B = unknown>(
  url: string,
  body: B,
  options: RequestOptions = {}
): Promise<T> {
  return baseFetch<T>(url, {
    method: "POST",
    body: JSON.stringify(body),
    ...options,
  });
}

/**
 * PUT request helper
 */
export async function apiPut<T, B = unknown>(
  url: string,
  body: B,
  options: RequestOptions = {}
): Promise<T> {
  return baseFetch<T>(url, {
    method: "PUT",
    body: JSON.stringify(body),
    ...options,
  });
}

/**
 * DELETE request helper
 */
export async function apiDelete<T>(
  url: string,
  options: RequestOptions = {}
): Promise<T> {
  return baseFetch<T>(url, {
    method: "DELETE",
    ...options,
  });
}

/**
 * Show success notification
 */
export function notifySuccess(title: string, message: string): void {
  showNotification({
    title,
    message,
    color: "green",
  });
}

/**
 * Show error notification
 */
export function notifyError(title: string, message: string): void {
  showNotification({
    title,
    message,
    color: "red",
  });
}

/**
 * Delay utility for waiting on cache invalidation
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Cache invalidation delay (for waiting on DB replication and Next.js cache invalidation)
 */
export const CACHE_INVALIDATION_DELAY = 100;
