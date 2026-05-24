/**
 * `/login` route config. Page component lives in
 * `@/components/login/page.tsx`.
 */
import { createFileRoute } from "@tanstack/react-router";
import { LoginPage } from "@/components/login/page.tsx";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});
