import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next.js 16 renamed "middleware" to "proxy" (same mechanism, new name).
// This does an OPTIMISTIC auth check only (reads the session cookie / calls
// Supabase to validate the token) and redirects logged-out users to /login.
// Every real data access still re-checks the session server-side (see
// src/lib/supabase/server.ts + the Server Actions / Route Handlers that use
// it) — this proxy is just the fast first line of defense, not the only one.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
