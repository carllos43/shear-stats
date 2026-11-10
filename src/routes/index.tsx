import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BarberMetrics 2.0 — Sócio virtual do barbeiro" },
      { property: "og:title", content: "BarberMetrics 2.0 — Controle da barbearia" },
      { property: "og:description", content: "Atendimentos, faturamento, cronômetro e relatórios da sua barbearia." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      {
        name: "description",
        content:
          "PWA premium para barbeiros autônomos: cronômetro, livro caixa, análise e relatórios em PDF.",
      },
      { name: "theme-color", content: "#000000" },
      {
        name: "viewport",
        content:
          "width=device-width, initial-scale=1, viewport-fit=cover",
      },
    ],
  }),
  ssr: false,
  component: AppShell,
});
