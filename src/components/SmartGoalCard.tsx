import { CheckCircle2, TrendingUp, Trophy, Minus, ArrowDown, ArrowUp } from "lucide-react";
import { formatBRL } from "@/lib/haptics";
import { fmtHM } from "@/lib/occupancy";
import type { SmartGoalV2Output } from "@/lib/smart-goal-v2";

const STRATEGY_STYLE = {
  acelerar: {
    label: "Acelerar",
    cls: "bg-red-500/12 text-red-300",
    Icon: TrendingUp,
  },
  manter: {
    label: "Manter ritmo",
    cls: "bg-emerald-500/12 text-emerald-300",
    Icon: CheckCircle2,
  },
  encerrado: {
    label: "Encerrado",
    cls: "bg-blue-500/12 text-blue-300",
    Icon: Trophy,
  },
} as const;

const RATE_COLOR = {
  hard: "text-red-400",
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
  stable: "text-muted-foreground",
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
    <div className="mt-5 rounded-2xl bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <StratIcon className="h-4 w-4 text-primary" strokeWidth={2} />
          <p className="text-[13px] font-semibold tracking-tight">Meta inteligente</p>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${s.cls}`}>
          <StratIcon className="h-3 w-3" />
          {s.label}
        </span>
      </div>

      <p className="mt-3 text-2xl font-semibold tabular-nums tracking-tight">{formatBRL(goal.finalGoal)}</p>
      <p className="mt-1 text-[13px] leading-relaxed text-foreground/80">{goal.message}</p>

      <div className="mt-3">
        <div className="flex items-center justify-between text-[12px] text-muted-foreground">
          <span>{goal.progressPct.toFixed(0)}% atingido</span>
          <span className="tabular-nums">{formatBRL(goal.remaining)} restantes</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
          <div
            className={`h-full ${barColor} transition-all`}
            style={{ width: `${Math.min(100, goal.progressPct)}%` }}
          />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
        <div className="rounded-xl bg-secondary/40 px-2.5 py-2">
          <p className="text-muted-foreground">Ritmo nec.</p>
          <p className={`mt-0.5 font-semibold tabular-nums ${remainingMinutes > 0 ? RATE_COLOR[goal.difficulty] : ""}`}>
            {remainingMinutes > 0 ? `${formatBRL(goal.requiredRatePerHour)}/h` : "—"}
          </p>
        </div>
        <div className="rounded-xl bg-secondary/40 px-2.5 py-2">
          <p className="text-muted-foreground">Ritmo atual</p>
          <p className="mt-0.5 font-semibold tabular-nums">
            {goal.currentRatePerHour > 0 ? `${formatBRL(goal.currentRatePerHour)}/h` : "—"}
          </p>
        </div>
        <div className="rounded-xl bg-secondary/40 px-2.5 py-2">
          <p className="text-muted-foreground">Tempo</p>
          <p className="mt-0.5 font-semibold tabular-nums">
            {remainingMinutes > 0 ? fmtHM(remainingMinutes) : "Encerrado"}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>Base {formatBRL(goal.baseGoal)} · Proj. {formatBRL(goal.projected)}</span>
        <span className={`inline-flex items-center gap-1 font-medium ${trendColor}`}>
          <TrendIcon className="h-3 w-3" />
          {goal.weeklyTrend.percentage} semana
        </span>
      </div>
    </div>
  );
}
