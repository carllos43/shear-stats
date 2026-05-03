import { useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  RefreshCw,
  Loader2,
  TrendingUp,
  AlertTriangle,
  Lightbulb,
  Clock,
  DollarSign,
  History,
  Trash2,
  X,
} from "lucide-react";
import { useAnalysisStore } from "@/store/analysis-store";
import {
  getModeLabel,
  getModeChipClass,
  getScoreEmoji,
  getScoreLabel,
} from "@/lib/analysis-utils";
import type {
  AnalysisDayData,
  AnalysisIcon,
  AnalysisItem,
  AnalysisMode,
  AnalysisType,
  AnalysisWeeklyStat,
  Severity,
} from "@/types/analysis";
import { useState } from "react";

const MODES: AnalysisMode[] = [
  "geral",
  "faturamento",
  "tempo_ocupado",
  "performance",
  "crescimento",
];

const ICONS: Record<AnalysisIcon, typeof TrendingUp> = {
  trending_up: TrendingUp,
  warning: AlertTriangle,
  lightbulb: Lightbulb,
  schedule: Clock,
  attach_money: DollarSign,
};

const TYPE_LABELS: Record<AnalysisType, string> = {
  insight: "💡 Insight",
  diagnostico: "🔍 Diagnóstico",
  acao: "⚡ Ação",
  oportunidade: "🎯 Oportunidade",
  alerta: "🚨 Alerta",
};

const SEV_BORDER: Record<Severity, string> = {
  alta: "border-l-red-500/70 bg-red-500/5",
  media: "border-l-amber-500/70 bg-amber-500/5",
  baixa: "border-l-emerald-500/70 bg-emerald-500/5",
};

interface Props {
  dayData: AnalysisDayData;
  weeklyStats: AnalysisWeeklyStat[];
}

export function AnalysisPanel({ dayData, weeklyStats }: Props) {
  const {
    currentAnalysis,
    history,
    selectedMode,
    isLoading,
    error,
    setMode,
    generateNewAnalysis,
    clearHistory,
  } = useAnalysisStore();

  const [historyOpen, setHistoryOpen] = useState(false);

  // primeira geração automática se houver dados
  useEffect(() => {
    if (
      !currentAnalysis &&
      !isLoading &&
      (dayData.faturamento > 0 || dayData.agendamentos_realizados > 0)
    ) {
      void generateNewAnalysis({ dayData, weeklyStats });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const score = currentAnalysis?.score;
  const items = currentAnalysis?.items ?? [];

  const handleRefresh = () => {
    if (isLoading) return;
    void generateNewAnalysis({ dayData, weeklyStats });
  };

  const headerSubtitle = useMemo(() => {
    if (isLoading) return "Analisando...";
    if (currentAnalysis)
      return new Date(currentAnalysis.timestamp).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      });
    return "Sem análise ainda";
  }, [currentAnalysis, isLoading]);

  return (
    <div className="mt-4 rounded-3xl border border-white/5 bg-[#1C1C1E] p-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
            Análise IA
          </p>
          <p className="mt-0.5 text-[10px] text-gray-500">{headerSubtitle}</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1.5 text-[11px] font-semibold text-primary transition-colors disabled:opacity-50"
        >
          {isLoading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          {isLoading ? "Analisando" : "Nova análise"}
        </button>
      </div>

      {/* Mode selector */}
      <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {MODES.map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${getModeChipClass(
              m,
              selectedMode === m,
            )}`}
          >
            {getModeLabel(m)}
          </button>
        ))}
      </div>

      {/* Score */}
      {score && (
        <div className="mt-3 flex items-center gap-3 rounded-2xl bg-black/30 p-3">
          <span className="text-2xl">{getScoreEmoji(score.value)}</span>
          <div className="min-w-0">
            <p className="text-sm font-bold tracking-tight text-white">
              {getScoreLabel(score.value)}
            </p>
            <p className="text-[11px] text-gray-400">
              {score.faturamentoPercent.toFixed(0)}% da meta ·{" "}
              {score.ocupacaoPercent.toFixed(0)}% ocupação
            </p>
          </div>
        </div>
      )}

      {/* Items */}
      <div className="mt-3 space-y-2">
        {isLoading && items.length === 0 ? (
          <SkeletonItems />
        ) : items.length > 0 ? (
          <AnimatePresence initial={false} mode="popLayout">
            {items.map((it, i) => (
              <motion.div
                key={`${currentAnalysis?.id}-${i}`}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <ItemCard item={it} />
              </motion.div>
            ))}
          </AnimatePresence>
        ) : (
          <p className="px-1 py-3 text-xs text-gray-500">
            {error ?? "Toque em Nova análise para gerar insights baseados nos seus dados."}
          </p>
        )}
      </div>

      {/* Footer history */}
      <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-3">
        <button
          onClick={() => setHistoryOpen(true)}
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-400 transition-colors hover:text-white"
        >
          <History className="h-3 w-3" />
          Histórico ({history.length})
        </button>
        {error && <span className="text-[10px] text-red-400">{error}</span>}
      </div>

      <AnimatePresence>
        {historyOpen && (
          <HistoryModal
            onClose={() => setHistoryOpen(false)}
            onClear={() => {
              if (confirm("Limpar todo o histórico?")) clearHistory();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ItemCard({ item }: { item: AnalysisItem }) {
  const Icon = ICONS[item.icone_sugerido] ?? Lightbulb;
  return (
    <div
      className={`rounded-2xl border-l-4 p-3 ${SEV_BORDER[item.severidade]}`}
    >
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-gray-300" />
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            {TYPE_LABELS[item.tipo]}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-gray-100">{item.texto}</p>
        </div>
      </div>
    </div>
  );
}

function SkeletonItems() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-2xl bg-black/20 p-3">
          <span className="block h-3 w-1/3 animate-pulse rounded bg-white/10" />
          <span className="mt-2 block h-3 w-full animate-pulse rounded bg-white/10" />
          <span className="mt-1 block h-3 w-2/3 animate-pulse rounded bg-white/10" />
        </div>
      ))}
    </div>
  );
}

function HistoryModal({
  onClose,
  onClear,
}: {
  onClose: () => void;
  onClear: () => void;
}) {
  const history = useAnalysisStore((s) => s.history);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 40 }}
        animate={{ y: 0 }}
        exit={{ y: 40 }}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[80vh] w-full max-w-md overflow-hidden rounded-t-3xl bg-[#1C1C1E] sm:rounded-3xl"
      >
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
          <p className="text-sm font-bold text-white">Histórico de análises</p>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-white/5">
            <X className="h-4 w-4 text-gray-400" />
          </button>
        </div>
        <div className="max-h-[60vh] space-y-2 overflow-y-auto p-4">
          {history.length === 0 ? (
            <p className="py-8 text-center text-xs text-gray-500">
              Nenhuma análise no histórico ainda.
            </p>
          ) : (
            history.map((h) => (
              <div key={h.id} className="rounded-2xl bg-black/30 p-3">
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                    {getModeLabel(h.mode)}
                  </span>
                  <span className="text-[10px] text-gray-500">
                    {new Date(h.timestamp).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <p className="mt-2 flex items-start gap-2 text-xs text-gray-200">
                  <span>{getScoreEmoji(h.score.value)}</span>
                  <span className="line-clamp-2">{h.items[0]?.texto}</span>
                </p>
              </div>
            ))
          )}
        </div>
        {history.length > 0 && (
          <div className="border-t border-white/5 px-5 py-3">
            <button
              onClick={onClear}
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-red-400 hover:text-red-300"
            >
              <Trash2 className="h-3 w-3" />
              Limpar histórico
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
