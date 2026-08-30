import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Verifies there's a logged-in user for this request. Every Server Action and
 * Route Handler that touches the database calls this first — the proxy.ts
 * redirect is only an optimistic first line of defense (see Next.js auth
 * guide), this is the real one, checked close to the data.
 */
export const verifySession = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return { userId: user.id, email: user.email ?? "" };
});
