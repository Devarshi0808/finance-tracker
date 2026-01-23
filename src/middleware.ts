import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Check if env vars are set
  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase environment variables");
    // Allow request to continue - will fail gracefully in API routes
    return response;
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const { pathname } = request.nextUrl;
  const isAuthRoute = pathname.startsWith("/login") || pathname.startsWith("/signup");
  
  // API routes should require authentication (bootstrap is called internally after auth)
  // No public API routes - all require authentication
  const isPublicRoute =
    pathname === "/" ||
    isAuthRoute ||
    pathname.startsWith("/auth"); // allow auth routes without being logged in

  let user = null;
  try {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    user = authUser;
  } catch (error) {
    // Supabase unreachable - treat as unauthenticated
    console.warn("Failed to get user in middleware:", error);
  }

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/app";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Only run middleware on app pages (this removes a LOT of overhead + avoids hitting Supabase on every /api call)
  matcher: ["/app/:path*", "/login"],
};

