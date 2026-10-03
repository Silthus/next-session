import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <main>
      <h1>Next Session</h1>
    </main>
  );
}
