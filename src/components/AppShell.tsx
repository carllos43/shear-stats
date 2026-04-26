import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, ChartBar, FileText, Settings } from "lucide-react";
import { TabBar } from "./TabBar";
import { useAppStore } from "@/store/app-store";
import { HomeScreen } from "@/screens/HomeScreen";
import { TimerScreen } from "@/screens/TimerScreen";
import { PlaceholderScreen } from "@/screens/PlaceholderScreen";

export function AppShell() {
  const tab = useAppStore((s) => s.activeTab);

  return (
    <div className="min-h-dvh bg-black text-white">
      <AnimatePresence mode="wait">
        <motion.main
          key={tab}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -12 }}
          transition={{ type: "spring", stiffness: 320, damping: 30 }}
        >
          {tab === "home" && <HomeScreen />}
          {tab === "timer" && <TimerScreen />}
          {tab === "history" && (
            <PlaceholderScreen
              title="Atendimentos"
              icon={CalendarDays}
              description="Calendário horizontal, lista detalhada, edição por swipe e CRUD completo."
            />
          )}
          {tab === "analytics" && (
            <PlaceholderScreen
              title="Análise"
              icon={ChartBar}
              description="Métricas de horas trabalhadas, ociosas, R$/h, gráfico semanal e insights preditivos."
            />
          )}
          {tab === "reports" && (
            <PlaceholderScreen
              title="Relatórios"
              icon={FileText}
              description="Filtros rápidos por período e exportação em PDF corporativo (jspdf + autotable)."
            />
          )}
          {tab === "settings" && (
            <PlaceholderScreen
              title="Ajustes"
              icon={Settings}
              description="Perfil, serviços, horário de trabalho, aparência e conta — estilo iOS Settings."
            />
          )}
        </motion.main>
      </AnimatePresence>
      <TabBar />
    </div>
  );
}
