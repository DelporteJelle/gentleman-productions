/**
 * Simple in-memory rate limiter for login attempts
 * For production, consider using Redis (Upstash) or Vercel KV for distributed rate limiting
 */

interface RateLimitEntry {
  attempts: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up old entries every hour
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitStore.entries()) {
    if (now > value.resetAt) {
      rateLimitStore.delete(key);
    }
  }
}, 3600000);

/**
 * Check if a request should be rate limited
 * @param identifier - Usually IP address or username
 * @param maxAttempts - Maximum attempts allowed in window
 * @param windowMs - Time window in milliseconds
 * @returns Object with allowed status and remaining attempts
 */
export function checkRateLimit(
  identifier: string,
  maxAttempts: number = 5,
  windowMs: number = 15 * 60 * 1000, // 15 minutes
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(identifier);

  // No previous attempts or window expired
  if (!entry || now > entry.resetAt) {
    const resetAt = now + windowMs;
    rateLimitStore.set(identifier, { attempts: 1, resetAt });
    return { allowed: true, remaining: maxAttempts - 1, resetAt };
  }

  // Increment attempts
  entry.attempts++;
  rateLimitStore.set(identifier, entry);

  const allowed = entry.attempts <= maxAttempts;
  const remaining = Math.max(0, maxAttempts - entry.attempts);

  return { allowed, remaining, resetAt: entry.resetAt };
}

/**
 * Get client IP address from request
 */
export function getClientIp(request: Request): string {
  // Check common headers for real IP (when behind proxy/CDN)
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const cfConnectingIp = request.headers.get("cf-connecting-ip"); // Cloudflare

  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  if (realIp) {
    return realIp;
  }
  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  return "unknown";
}
