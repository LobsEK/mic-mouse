import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Where the confirmation link from the e-mail lands. It exchanges the one-time
 * token for a real session and drops the person straight into the app — no
 * second login, no dead end.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) redirect(next);
    redirect(`/login?error=${encodeURIComponent("Potvrdzovací odkaz už neplatí. Prihlás sa heslom, alebo si nechaj poslať nový.")}`);
  }

  redirect(`/login?error=${encodeURIComponent("Potvrdzovací odkaz je neúplný.")}`);
}
