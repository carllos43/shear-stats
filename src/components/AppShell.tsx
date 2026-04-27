import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { TabBar } from "./TabBar";
import { useAppStore } from "@/store/app-store";
import { HomeScreen } from "@/screens/HomeScreen";
import { TimerScreen } from "@/screens/TimerScreen";
import { HistoryScreen } from "@/screens/HistoryScreen";
import { AnalyticsScreen } from "@/screens/AnalyticsScreen";
import { ReportsScreen } from "@/screens/ReportsScreen";
import { SettingsScreen } from "@/screens/SettingsScreen";
import { LoginScreen } from "@/screens/LoginScreen";
import { AuthProvider, useAuth } from "@/integrations/supabase/auth-context";
import { pullAll } from "@/integrations/supabase/sync";
import { useAppSync } from "@/integrations/supabase/use-sync";

function Loading() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-black">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-primary" />
    </div>
  );
}

function Shell() {
  const { user, loading } = useAuth();
  const tab = useAppStore((s) => s.activeTab);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!user) {
      setReady(false);
      return;
    }
    pullAll(user.id)
      .then(() => setReady(true))
      .catch((err) => {
        console.error("pullAll error", err);
        setReady(true); // segue offline-first
      });
  }, [user]);

  useAppSync(user?.id ?? null, ready);

  if (loading) return <Loading />;
  if (!user) return <LoginScreen />;

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

export function AppShell() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
