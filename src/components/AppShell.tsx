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

function ShellSkeleton() {
  return (
    <div className="min-h-dvh bg-black px-5 pt-10 text-white">
      <div className="h-7 w-40 animate-pulse rounded-lg bg-white/10" />
      <div className="mt-2 h-4 w-56 animate-pulse rounded bg-white/5" />
      <div className="mt-8 h-52 animate-pulse rounded-3xl bg-white/5" />
      <div className="mt-5 flex gap-3">
        <div className="h-24 w-40 animate-pulse rounded-3xl bg-white/5" />
        <div className="h-24 w-40 animate-pulse rounded-3xl bg-white/5" />
      </div>
      <div className="mt-8 space-y-2">
        <div className="h-14 animate-pulse rounded-2xl bg-white/5" />
        <div className="h-14 animate-pulse rounded-2xl bg-white/5" />
        <div className="h-14 animate-pulse rounded-2xl bg-white/5" />
      </div>
    </div>
  );
}

function Shell() {
  const { user, loading } = useAuth();
  const tab = useAppStore((s) => s.activeTab);
  const hasLocalData = useAppStore((s) => s.appointments.length > 0 || s.services.length > 0);
  const [ready, setReady] = useState(hasLocalData);

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
