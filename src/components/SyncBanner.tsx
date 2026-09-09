import { AnimatePresence, motion } from "framer-motion";
import { CloudOff, Loader2, RefreshCw } from "lucide-react";
import { useSyncStatus } from "@/integrations/supabase/sync-status";

/**
 * Aviso fixo de estado da sincronização.
 * Só aparece quando há gravação em andamento ou falha.
 */
export function SyncBanner({ onRetry }: { onRetry?: () => void }) {
  const status = useSyncStatus((s) => s.status);
  const clearError = useSyncStatus((s) => s.clearError);

  return (
    <AnimatePresence>
      {status !== "idle" && (
        <motion.div
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          role="status"
          aria-live="polite"
          className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold tracking-tight"
          style={{
            backgroundColor: status === "error" ? "color-mix(in oklab, var(--destructive) 22%, black)" : "rgba(0,0,0,0.75)",
          }}
        >
          {status === "saving" ? (
            <>
              <Loader2 size={13} className="animate-spin text-primary" />
              <span className="text-gray-200">Salvando…</span>
            </>
          ) : (
            <>
              <CloudOff size={13} className="text-destructive" />
              <span className="text-gray-100">Não foi possível salvar tudo online</span>
              <button
                onClick={() => {
                  clearError();
                  onRetry?.();
                }}
                className="ml-1 inline-flex min-h-8 items-center gap-1 rounded-full bg-white/10 px-3 py-1 font-bold text-white"
              >
                <RefreshCw size={12} /> Tentar de novo
              </button>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
