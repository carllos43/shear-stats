import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  AnalysisDayData,
  AnalysisMode,
  AnalysisResponse,
  AnalysisWeeklyStat,
} from "@/types/analysis";
import { calculateDayScore } from "@/lib/analysis-utils";
import { generateAdvancedAnalysis } from "@/lib/ai-insight.functions";

interface GenerateArgs {
  dayData: AnalysisDayData;
  weeklyStats: AnalysisWeeklyStat[];
}

interface AnalysisStore {
  currentAnalysis: AnalysisResponse | null;
  history: AnalysisResponse[];
  selectedMode: AnalysisMode;
  isLoading: boolean;
  error: string | null;
  setMode: (m: AnalysisMode) => void;
  clearHistory: () => void;
  generateNewAnalysis: (args: GenerateArgs) => Promise<void>;
}

const MAX_HISTORY = 5;

function uid(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {
    /* noop */
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useAnalysisStore = create<AnalysisStore>()(
  persist(
    (set, get) => ({
      currentAnalysis: null,
      history: [],
      selectedMode: "geral",
      isLoading: false,
      error: null,

      setMode: (mode) => set({ selectedMode: mode }),
      clearHistory: () => set({ history: [] }),

      generateNewAnalysis: async ({ dayData, weeklyStats }) => {
        const state = get();
        if (state.isLoading) return;

        // arquiva análise atual
        if (state.currentAnalysis) {
          const next = [state.currentAnalysis, ...state.history].slice(0, MAX_HISTORY);
          set({ history: next });
        }

        set({ isLoading: true, error: null });
        const score = calculateDayScore(
          dayData.faturamento,
          dayData.meta,
          dayData.ocupacao_percent,
        );
        const seed = Math.floor(Math.random() * 10000);
        const previousInsights = state.history.slice(0, 3).map((h) => ({
          timestamp: h.timestamp,
          insights: h.items.map((i) => i.texto).slice(0, 3),
        }));

        try {
          const res = await generateAdvancedAnalysis({
            data: {
              mode: state.selectedMode,
              dayData,
              weeklyStats,
              previousAnalyses: previousInsights,
              score,
              seed,
            },
          });
          const analysis: AnalysisResponse = {
            id: uid(),
            timestamp: new Date().toISOString(),
            mode: state.selectedMode,
            items: res.items,
            score,
          };
          set({ currentAnalysis: analysis, isLoading: false });
        } catch (e) {
          console.error("generateNewAnalysis:", e);
          set({
            isLoading: false,
            error: e instanceof Error ? e.message : "Falha ao gerar análise",
          });
        }
      },
    }),
    {
      name: "bm-analysis-storage",
      partialize: (s) => ({
        history: s.history,
        selectedMode: s.selectedMode,
      }),
    },
  ),
);
