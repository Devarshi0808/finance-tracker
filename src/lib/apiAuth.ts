import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

export interface AuthResult {
  user: User | null;
  error: string | null;
  isTimeout?: boolean;
}

/**
 * Requires authentication for API routes.
 * Returns the authenticated user or an error.
 *
 * Usage:
 * ```typescript
 * const { user, error } = await requireAuth();
 * if (error || !user) {
 *   return NextResponse.json({ error: error || "Unauthorized" }, { status: 401 });
 * }
 * ```
 */
export async function requireAuth(): Promise<AuthResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error) {
      // Check if it's a timeout/network error
      const errorMsg = error.message?.toLowerCase() || "";
      const isTimeout = errorMsg.includes("timeout") || errorMsg.includes("fetch failed") || errorMsg.includes("network");
      
      if (isTimeout) {
        console.warn("Auth timeout - Supabase unreachable:", error.message);
        return { user: null, error: "Service temporarily unavailable. Please try again.", isTimeout: true };
      }
      
      console.error("Auth error:", error.message);
      return { user: null, error: "Authentication failed" };
    }

    if (!user) {
      return { user: null, error: "Unauthorized" };
    }

    return { user, error: null };
  } catch (err) {
    // Check for timeout/network errors
    const errorMsg = err instanceof Error ? err.message.toLowerCase() : "";
    const isTimeout = errorMsg.includes("timeout") || errorMsg.includes("fetch failed") || errorMsg.includes("etimedout");
    
    if (isTimeout) {
      console.warn("Auth timeout (exception):", err);
      return { user: null, error: "Service temporarily unavailable. Please try again.", isTimeout: true };
    }
    
    console.error("Auth error:", err);
    return { user: null, error: "Authentication error" };
  }
}
