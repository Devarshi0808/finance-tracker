/**
 * Centralized error sanitization for API routes
 * Prevents information disclosure while maintaining proper logging
 */

/**
 * Sanitize error for client response
 * Logs full error details server-side, returns safe message to client
 *
 * @param error - The error object (unknown type from catch blocks)
 * @param context - Context string for logging (e.g., "transaction_create")
 * @param preserveValidation - If true, preserve Zod validation error details
 * @returns Sanitized error object for client response
 */
export function sanitizeError(
  error: unknown,
  context: string,
  preserveValidation = false
): {
  error: string;
  details?: string;
} {
  // Log full error details server-side for debugging
  console.error(`[${context}] Error:`, error);

  // Handle Zod validation errors - these are safe to show to users
  if (preserveValidation && error && typeof error === "object" && "issues" in error) {
    const zodError = error as { issues: Array<{ message: string; path: Array<string | number> }> };
    const validationDetails = zodError.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join(", ");
    return {
      error: "validation_error",
      details: validationDetails,
    };
  }

  // Handle known error types with generic messages
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Database/Supabase errors
    if (
      message.includes("postgres") ||
      message.includes("database") ||
      message.includes("relation") ||
      message.includes("column") ||
      message.includes("constraint")
    ) {
      return { error: "database_error" };
    }

    // Auth errors
    if (message.includes("auth") || message.includes("unauthorized") || message.includes("token")) {
      return { error: "authentication_failed" };
    }

    // Network/timeout errors
    if (message.includes("timeout") || message.includes("fetch failed") || message.includes("econnrefused")) {
      return { error: "service_unavailable" };
    }

    // RPC errors
    if (message.includes("rpc") || message.includes("function")) {
      return { error: "operation_failed" };
    }
  }

  // Default generic error
  return { error: "internal_error" };
}

/**
 * Sanitize database error specifically
 * Use for Supabase query errors
 */
export function sanitizeDatabaseError(error: unknown, operation: string): {
  error: string;
  message?: string;
} {
  console.error(`[database_${operation}] Error:`, error);

  return {
    error: "database_error",
    message: `Failed to ${operation}`,
  };
}

/**
 * Sanitize RPC error specifically
 * Use for Supabase RPC function errors
 */
export function sanitizeRPCError(error: unknown, functionName: string): {
  error: string;
  message?: string;
} {
  console.error(`[rpc_${functionName}] Error:`, error);

  return {
    error: "operation_failed",
    message: "Transaction operation failed",
  };
}

/**
 * Error response helpers for common HTTP status codes
 */
export const ErrorResponses = {
  BAD_REQUEST: (message = "Invalid request") => ({
    error: "bad_request",
    message,
  }),

  UNAUTHORIZED: (message = "Unauthorized") => ({
    error: "unauthorized",
    message,
  }),

  FORBIDDEN: (message = "Forbidden") => ({
    error: "forbidden",
    message,
  }),

  NOT_FOUND: (message = "Not found") => ({
    error: "not_found",
    message,
  }),

  RATE_LIMITED: (retryAfter?: number) => ({
    error: "rate_limit_exceeded",
    message: retryAfter
      ? `Too many requests. Try again in ${retryAfter} seconds.`
      : "Too many requests. Please try again later.",
  }),

  INTERNAL_ERROR: (message = "Internal server error") => ({
    error: "internal_error",
    message,
  }),

  SERVICE_UNAVAILABLE: (message = "Service temporarily unavailable") => ({
    error: "service_unavailable",
    message,
  }),
} as const;
