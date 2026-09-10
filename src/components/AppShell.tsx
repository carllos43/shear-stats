import { useCallback, useEffect, useState, memo } from "react";
import { TabBar } from "./TabBar";
import { SyncBanner } from "./SyncBanner";
import { useAppStore } from "@/store/app-store";
import { HomeScreen } from "@/screens/HomeScreen";
import { TimerScreen } from "@/screens/TimerScreen";
import { HistoryScreen } from "@/screens/HistoryScreen";
import { AnalyticsScreen } from "@/screens/AnalyticsScreen";
import { ReportsScreen } from "@/screens/ReportsScreen";
import { SettingsScreen } from "@/screens/SettingsScreen";
import { LoginScreen } from "@/screens/LoginScreen";
import { AuthProvider, useAuth } from "@/integrations/supabase/auth-context";
import { pullAll, invalidatePullCache } from "@/integrations/supabase/sync";
import { useSyncStatus } from "@/integrations/supabase/sync-status";
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
  // ready só depois do pullAll: evita que o sync trate dados do servidor como novos.
  const [ready, setReady] = useState(false);

  const runPull = useCallback((userId: string, force = false) => {
    invalidatePullCache(userId);
    return pullAll(userId, { force })
      .then(() => {
        useSyncStatus.getState().clearError();
        setReady(true);
      })
      .catch((err) => {
        console.error("pullAll error", err);
        useSyncStatus.getState().fail(err instanceof Error ? err.message : String(err));
        setReady(true); // segue offline-first
      });
  }, []);

  useEffect(() => {
    if (!user) {
      setReady(false);
      return;
    }
    void runPull(user.id);
  }, [user, runPull]);

  useAppSync(user?.id ?? null, ready);

  if (loading) return <Loading />;
  if (!user) return <LoginScreen />;
  if (!ready) return <ShellSkeleton />;

  return (
    <div className="min-h-dvh bg-black text-white">
      <SyncBanner onRetry={() => user && void runPull(user.id, true)} />
      <KeepAlive active={tab === "home"}><HomeScreen /></KeepAlive>
      <KeepAlive active={tab === "timer"}><TimerScreen /></KeepAlive>
      <KeepAlive active={tab === "history"}><HistoryScreen /></KeepAlive>
      <KeepAlive active={tab === "analytics"}><AnalyticsScreen /></KeepAlive>
      <KeepAlive active={tab === "reports"}><ReportsScreen /></KeepAlive>
      <KeepAlive active={tab === "settings"}><SettingsScreen /></KeepAlive>
      <TabBar />
    </div>
  );
}

/**
 * Mantém a tela montada mas oculta quando inativa.
 * Evita refazer todos os useMemo/Intl.NumberFormat ao trocar de aba.
 * Só monta a primeira vez quando ativada (lazy mount).
 */
const KeepAlive = memo(function KeepAlive({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(active);
  useEffect(() => {
    if (active && !mounted) setMounted(true);
  }, [active, mounted]);
  if (!mounted) return null;
  return <div style={{ display: active ? "block" : "none" }}>{children}</div>;
});

export function AppShell() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
