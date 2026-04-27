import { motion } from "framer-motion";
import { Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { BottomSheet } from "@/components/BottomSheet";
import { useAppStore } from "@/store/app-store";
import { formatBRL, haptic } from "@/lib/haptics";

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function GoalRing({ progress, value, goal }: { progress: number; value: number; goal: number }) {
  const size = 200;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(progress, 1);
  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} fill="none" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="var(--primary)"
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - c * pct }}
          transition={{ type: "spring", stiffness: 80, damping: 20 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xs font-medium uppercase tracking-wider text-gray-500">Meta diária</span>
        <span className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-primary">
          {formatBRL(value)}
        </span>
        <span className="mt-0.5 text-xs text-gray-400 tabular-nums">de {formatBRL(goal)}</span>
        <span className="mt-1 text-[11px] font-semibold text-gray-500 tabular-nums">
          {Math.round(pct * 100)}%
        </span>
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="min-w-[160px] snap-start rounded-3xl bg-[#1C1C1E] p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</p>
      <p
        className={`mt-2 text-2xl font-bold tabular-nums tracking-tight ${
          accent ? "text-primary" : "text-white"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

export function HomeScreen() {
  const profile = useAppStore((s) => s.profile);
  const setProfile = useAppStore((s) => s.setProfile);
  const appointments = useAppStore((s) => s.appointments);
  const [gearOpen, setGearOpen] = useState(false);
  const [goalDraft, setGoalDraft] = useState(profile.daily_goal.toString());

  const today = useMemo(() => new Date(), []);
  const todayItems = useMemo(
    () => appointments.filter((a) => isSameDay(new Date(a.started_at), today)),
    [appointments, today],
  );
  const total = todayItems.reduce((sum, a) => sum + a.price, 0);
  const count = todayItems.length;
  const avg = count > 0 ? total / count : 0;
  const progress = profile.daily_goal > 0 ? total / profile.daily_goal : 0;

  return (
    <div>
      <Header
        title="Hoje"
        subtitle={today.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
        onGear={() => {
          setGoalDraft(profile.daily_goal.toString());
          setGearOpen(true);
        }}
      />
      <div className="px-5 pt-6 pb-32">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 26 }}
          className="rounded-3xl bg-[#1C1C1E] p-6"
        >
          <GoalRing progress={progress} value={total} goal={profile.daily_goal} />
        </motion.div>

        <div className="mt-5 -mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-1 scrollbar-hide">
          <StatCard label="Faturamento" value={formatBRL(total)} accent />
          <StatCard label="Atendimentos" value={count.toString()} />
          <StatCard label="Ticket médio" value={formatBRL(avg)} />
        </div>

        <h2 className="mt-8 mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Atendimentos de hoje
        </h2>
        {todayItems.length === 0 ? (
          <div className="rounded-3xl bg-[#1C1C1E] p-8 text-center">
            <p className="text-sm text-gray-400">Nenhum atendimento ainda hoje.</p>
            <p className="mt-1 text-xs text-gray-500">Inicie o cronômetro para começar.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {todayItems.slice(0, 5).map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between rounded-2xl bg-[#1C1C1E] px-4 py-3"
              >
                <div>
                  <p className="font-semibold tracking-tight">{a.service_name}</p>
                  <p className="text-xs text-gray-500 tabular-nums">
                    {new Date(a.started_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <span className="font-bold text-primary tabular-nums">{formatBRL(a.price)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <BottomSheet open={gearOpen} onClose={() => setGearOpen(false)} title="Meta diária">
        <p className="mb-3 text-sm text-gray-400">
          Defina o quanto você quer faturar por dia.
        </p>
        <div className="flex items-center rounded-2xl bg-[#2C2C2E] px-4 py-3">
          <span className="mr-2 text-gray-400">R$</span>
          <input
            type="number"
            inputMode="decimal"
            value={goalDraft}
            onChange={(e) => setGoalDraft(e.target.value)}
            className="w-full bg-transparent text-2xl font-bold tabular-nums outline-none"
            placeholder="0,00"
          />
        </div>
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={() => {
            const v = parseFloat(goalDraft.replace(",", "."));
            setProfile({ daily_goal: isNaN(v) ? 0 : v });
            haptic(12);
            setGearOpen(false);
          }}
          className="mt-5 w-full rounded-2xl bg-primary py-4 text-base font-bold tracking-tight text-primary-foreground"
        >
          Salvar meta
        </motion.button>
      </BottomSheet>
    </div>
  );
}
