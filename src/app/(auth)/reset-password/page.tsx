import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ResetPasswordForm } from "./reset-form";

export const metadata: Metadata = { title: "Reset password" };

export default async function ResetPasswordPage() {
  const supabase = await createSupabaseServerClient();
  let hasSession = false;
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    hasSession = Boolean(user);
  }
  return <ResetPasswordForm hasSession={hasSession} />;
}
