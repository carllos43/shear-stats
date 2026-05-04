import { Target } from "lucide-react";
import { formatBRL } from "@/lib/haptics";
import { fmtHM } from "@/lib/occupancy";
import type { SmartGoal } from "@/lib/smart-goal";

const DIFF_STYLE = {
  facil: { label: "Fácil", cls: "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30" },
  normal: { label: "Normal", cls: "bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/30" },
  agressiva: { label: "Agressiva", cls: "bg-red-500/15 text-red-300 ring-1 ring-red-400/30" },
} as const;

export function SmartGoalCard({ goal }: { goal: SmartGoal }) {
  const d = DIFF_STYLE[goal.difficulty];
  const barColor =
    goal.progressPct >= 100
      ? "bg-emerald-500"
      : goal.progressPct >= 70
        ? "bg-amber-500"
        : "bg-primary";

  return (
    <div className="mt-4 rounded-3xl border border-primary/10 bg-gradient-to-br from-primary/10 to-[#1C1C1E] p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Target className="h-3.5 w-3.5 text-primary" />
          <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
            Meta inteligente
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${d.cls}`}>
          {d.label}
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
          <p className="text-gray-500">Restante</p>
          <p className="mt-0.5 font-bold tabular-nums text-white">{formatBRL(goal.remaining)}</p>
        </div>
        <div className="rounded-xl bg-black/30 px-3 py-2">
          <p className="text-gray-500">Ritmo nec.</p>
          <p className="mt-0.5 font-bold tabular-nums text-white">
            {goal.remainingMinutes > 0 ? `${formatBRL(goal.requiredRate)}/h` : "—"}
          </p>
        </div>
        <div className="rounded-xl bg-black/30 px-3 py-2">
          <p className="text-gray-500">Tempo</p>
          <p className="mt-0.5 font-bold tabular-nums text-white">
            {goal.remainingMinutes > 0 ? fmtHM(goal.remainingMinutes) : "Encerrado"}
          </p>
        </div>
      </div>

      <p className="mt-3 text-[10px] leading-relaxed text-gray-500">
        Base histórica {formatBRL(goal.baseGoal)} · Projeção {formatBRL(goal.projected)} · Tendência{" "}
        {formatBRL(goal.weeklyTrend)}
      </p>
    </div>
  );
}
