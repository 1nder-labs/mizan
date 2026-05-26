/**
 * `/invite/$token` — public invitation-acceptance landing page.
 *
 * No `beforeLoad` gate; the page handles both signed-out (renders
 * call-to-action that bounces to /login with redirect) and
 * signed-in (renders "Accept" button) flows.
 */
import { createFileRoute } from "@tanstack/react-router";
import { InviteAcceptPage } from "@/components/invite/accept-page.tsx";

export const Route = createFileRoute("/invite/$token")({
  component: InviteAcceptPage,
});
