"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { verifySession } from "@/lib/dal";

export async function saveSettings(input: { companyName: string; senderName: string; tone: string }) {
  const { userId } = await verifySession();
  const supabase = await createClient();
  const { error } = await supabase.from("settings").upsert({
    owner_id: userId,
    company_name: input.companyName?.trim() || "Instaview",
    sender_name: input.senderName?.trim() || null,
    tone: input.tone?.trim() || "friendly, concise, professional",
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/");
}
