import { CheckCircle2, TrendingUp, Trophy, Minus, ArrowDown, ArrowUp } from "lucide-react";
import { formatBRL } from "@/lib/haptics";
import { fmtHM } from "@/lib/occupancy";
import type { SmartGoalV2Output } from "@/lib/smart-goal-v2";

const STRATEGY_STYLE = {
  acelerar: {
    label: "Acelerar",
    cls: "bg-red-500/15 text-red-300 ring-1 ring-red-400/30",
    Icon: TrendingUp,
  },
  manter: {
    label: "Manter ritmo",
    cls: "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30",
    Icon: CheckCircle2,
  },
  encerrado: {
    label: "Encerrado",
    cls: "bg-blue-500/15 text-blue-300 ring-1 ring-blue-400/30",
    Icon: Trophy,
  },
} as const;

const RATE_COLOR = {
  hard: "text-red-400 animate-pulse",
  medium: "text-amber-400",
  easy: "text-emerald-400",
} as const;

const TREND_ICON = {
  up: ArrowUp,
  down: ArrowDown,
  stable: Minus,
} as const;

const TREND_COLOR = {
  up: "text-emerald-400",
  down: "text-red-400",
  stable: "text-gray-400",
} as const;

export function SmartGoalCard({
  goal,
  remainingMinutes,
}: {
  goal: SmartGoalV2Output;
  remainingMinutes: number;
}) {
  const s = STRATEGY_STYLE[goal.strategy];
  const StratIcon = s.Icon;

  const barColor =
    goal.progressPct >= 100
      ? "bg-blue-500"
      : goal.progressPct > 70
        ? "bg-emerald-500"
        : goal.progressPct >= 30
          ? "bg-amber-500"
          : "bg-red-500";

  const TrendIcon = TREND_ICON[goal.weeklyTrend.direction];
  const trendColor = TREND_COLOR[goal.weeklyTrend.direction];

  return (
    <div className="mt-4 rounded-3xl border border-primary/10 bg-gradient-to-br from-primary/10 to-[#1C1C1E] p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <StratIcon className="h-3.5 w-3.5 text-primary" />
          <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
            Meta inteligente
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${s.cls}`}
        >
          <StratIcon className="h-3 w-3" />
          {s.label}
        </span>
      </div>

      <p className="mt-3 text-2xl font-bold tabular-nums tracking-tight text-white">
        {formatBRL(goal.finalGoal)}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-gray-300">{goal.message}</p>

      <div className="mt-3">
        <div className="flex items-center justify-between text-[11px] text-gray-400">
          <span>{goal.progressPct.toFixed(0)}% atingido</span>
          <span className="tabular-nums">{formatBRL(goal.remaining)} restantes</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/5">
          <div
            className={`h-full ${barColor} transition-all`}
            style={{ width: `${Math.min(100, goal.progressPct)}%` }}
          />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
        <div className="rounded-xl bg-black/30 px-3 py-2">
          <p className="text-gray-500">Ritmo nec.</p>
          <p
            className={`mt-0.5 font-bold tabular-nums ${
              remainingMinutes > 0 ? RATE_COLOR[goal.difficulty] : "text-white"
            }`}
          >
            {remainingMinutes > 0 ? `${formatBRL(goal.requiredRatePerHour)}/h` : "—"}
          </p>
        </div>
        <div className="rounded-xl bg-black/30 px-3 py-2">
          <p className="text-gray-500">Ritmo atual</p>
          <p className="mt-0.5 font-bold tabular-nums text-white">
            {goal.currentRatePerHour > 0 ? `${formatBRL(goal.currentRatePerHour)}/h` : "—"}
          </p>
        </div>
        <div className="rounded-xl bg-black/30 px-3 py-2">
          <p className="text-gray-500">Tempo</p>
          <p className="mt-0.5 font-bold tabular-nums text-white">
            {remainingMinutes > 0 ? fmtHM(remainingMinutes) : "Encerrado"}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-[10px] text-gray-500">
        <span>
          Base {formatBRL(goal.baseGoal)} · Projeção {formatBRL(goal.projected)}
        </span>
        <span className={`inline-flex items-center gap-1 font-semibold ${trendColor}`}>
          <TrendIcon className="h-3 w-3" />
          {goal.weeklyTrend.percentage} semana
        </span>
      </div>
    </div>
  );
}
