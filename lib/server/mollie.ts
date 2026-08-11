import { createMollieClient } from "@mollie/api-client";

/**
 * Lazily-constructed Mollie client.
 *
 * `createMollieClient` throws if `apiKey` is empty, and it must NOT run at
 * module-evaluation time — Next.js evaluates route modules while collecting
 * page data at build, where `MOLLIE_API_KEY` may be absent/empty. Creating the
 * client on first use (request time) keeps the build green and matches the
 * `getDb()` lazy-connection pattern used elsewhere.
 */
let client: ReturnType<typeof createMollieClient> | null = null;

export function getMollie(): ReturnType<typeof createMollieClient> {
  if (!client) {
    client = createMollieClient({ apiKey: process.env.MOLLIE_API_KEY! });
  }
  return client;
}
