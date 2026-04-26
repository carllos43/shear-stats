import { createFileRoute } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BarberMetrics 2.0 — Sócio virtual do barbeiro" },
      {
        name: "description",
        content:
          "PWA premium para barbeiros autônomos: cronômetro, livro caixa, análise e relatórios em PDF.",
      },
      { name: "theme-color", content: "#000000" },
      {
        name: "viewport",
        content:
          "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <ClientOnly fallback={<div className="min-h-dvh bg-black" />}>
      <AppShell />
    </ClientOnly>
  );
}
