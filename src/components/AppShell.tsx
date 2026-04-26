import { AnimatePresence, motion } from "framer-motion";
import { TabBar } from "./TabBar";
import { useAppStore } from "@/store/app-store";
import { HomeScreen } from "@/screens/HomeScreen";
import { TimerScreen } from "@/screens/TimerScreen";
import { HistoryScreen } from "@/screens/HistoryScreen";
import { AnalyticsScreen } from "@/screens/AnalyticsScreen";
import { ReportsScreen } from "@/screens/ReportsScreen";
import { SettingsScreen } from "@/screens/SettingsScreen";

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
          {tab === "history" && <HistoryScreen />}
          {tab === "analytics" && <AnalyticsScreen />}
          {tab === "reports" && <ReportsScreen />}
          {tab === "settings" && <SettingsScreen />}
        </motion.main>
      </AnimatePresence>
      <TabBar />
    </div>
  );
}
