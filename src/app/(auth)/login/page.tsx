import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; notice?: string }>;
}) {
  const params = await searchParams;
  return (
    <LoginForm next={params.next ?? null} notice={params.notice ?? null} />
  );
}
