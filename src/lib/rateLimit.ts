/**
 * Simple in-memory rate limiter for personal use
 * Rate limit state resets on serverless function restart (acceptable for personal deployment)
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

// In-memory store for rate limit tracking
const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup old entries every 5 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt < now) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * Extract client identifier from request headers
 * Uses X-Forwarded-For (Vercel/proxy) or X-Real-IP, falls back to 'unknown'
 */
export function getClientIdentifier(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    // X-Forwarded-For can be a comma-separated list, take the first IP
    return forwarded.split(",")[0]?.trim() || "unknown";
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  return "unknown";
}

/**
 * Check if request should be rate limited
 * @param identifier - Unique identifier (usually IP address)
 * @param config - Rate limit configuration
 * @returns Object with limited flag and optional retryAfter seconds
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): { limited: boolean; retryAfter?: number } {
  const now = Date.now();
  const key = identifier;

  const entry = rateLimitStore.get(key);

  if (!entry || entry.resetAt < now) {
    // First request or window expired - create new entry
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + config.windowMs,
    });
    return { limited: false };
  }

  // Within rate limit window
  if (entry.count < config.maxRequests) {
    // Under limit - increment and allow
    entry.count++;
    return { limited: false };
  }

  // Over limit - calculate retry after
  const retryAfterMs = entry.resetAt - now;
  const retryAfterSec = Math.ceil(retryAfterMs / 1000);

  return {
    limited: true,
    retryAfter: retryAfterSec,
  };
}

/**
 * Predefined rate limit configurations for common endpoints
 */
export const RateLimits = {
  // Login endpoint - strict to prevent brute force
  LOGIN: {
    maxRequests: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
  },

  // Transaction creation - moderate limit
  TRANSACTION_CREATE: {
    maxRequests: 30,
    windowMs: 60 * 1000, // 1 minute
  },

  // Parse endpoint - generous for chat interaction
  TRANSACTION_PARSE: {
    maxRequests: 60,
    windowMs: 60 * 1000, // 1 minute
  },

  // AI categorization - moderate limit (OpenAI API costs)
  CATEGORIZE: {
    maxRequests: 60,
    windowMs: 60 * 1000, // 1 minute
  },

  // Export endpoint - restricted (expensive operation)
  EXPORT: {
    maxRequests: 10,
    windowMs: 60 * 60 * 1000, // 1 hour
  },

  // System reset - very strict (destructive operation)
  SYSTEM_RESET: {
    maxRequests: 3,
    windowMs: 60 * 60 * 1000, // 1 hour
  },

  // General API - generous limit for personal use
  GENERAL_API: {
    maxRequests: 100,
    windowMs: 60 * 1000, // 1 minute
  },
} as const;
