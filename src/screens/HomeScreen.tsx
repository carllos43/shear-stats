import { AnimatePresence, motion } from "framer-motion";
import { Zap, CheckCircle2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { BottomSheet } from "@/components/BottomSheet";
import { useAppStore, type PaymentMethod } from "@/store/app-store";
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

type QuickService = { id: string | null; name: string; price: number; duration_minutes: number };

type WhenMode = "now" | "today" | "yesterday" | "custom";

const LS_LAST_DATE = "barbermetrics:last_manual_date";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function toDateInput(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function toTimeInput(d: Date) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function combineDateAndTime(dateStr: string, timeStr: string): Date {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const [h, mi] = timeStr.split(":").map(Number);
  const out = new Date();
  if ([y, mo, d, h, mi].some((n) => Number.isNaN(n))) return out;
  out.setFullYear(y, mo - 1, d);
  out.setHours(h, mi, 0, 0);
  return out;
}
function addMinutes(d: Date, mins: number): Date {
  return new Date(d.getTime() + mins * 60_000);
}

export function HomeScreen() {
  const profile = useAppStore((s) => s.profile);
  const setProfile = useAppStore((s) => s.setProfile);
  const appointments = useAppStore((s) => s.appointments);
  const services = useAppStore((s) => s.services);
  const addAppointment = useAppStore((s) => s.addAppointment);
  const [gearOpen, setGearOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [goalDraft, setGoalDraft] = useState(profile.daily_goal.toString());

  // Avulso (custom)
  const [showQuickCustom, setShowQuickCustom] = useState(false);
  const [quickCustomName, setQuickCustomName] = useState("");
  const [quickCustomPrice, setQuickCustomPrice] = useState("");
  const [quickCustomDuration, setQuickCustomDuration] = useState("");

  // Serviço escolhido + forma de pagamento (fluxo Ação rápida)
  const [pending, setPending] = useState<QuickService | null>(null);
  const [quickPayment, setQuickPayment] = useState<PaymentMethod | null>(null);
  const [quickPayError, setQuickPayError] = useState(false);

  // Quando?
  const now = new Date();
  const [whenMode, setWhenMode] = useState<WhenMode>("now");
  const [selectedDate, setSelectedDate] = useState<string>(toDateInput(now));
  const [selectedTime, setSelectedTime] = useState<string>(toTimeInput(now));

  // Restaurar última data manual ao abrir
  const openQuick = () => {
    const last = typeof window !== "undefined" ? localStorage.getItem(LS_LAST_DATE) : null;
    const n = new Date();
    setWhenMode("now");
    setSelectedDate(last && /^\d{4}-\d{2}-\d{2}$/.test(last) ? last : toDateInput(n));
    setSelectedTime(toTimeInput(n));
    setShowQuickCustom(false);
    setQuickCustomName("");
    setQuickCustomPrice("");
    setQuickCustomDuration("");
    setPending(null);
    setQuickPayment(null);
    setQuickPayError(false);
    haptic(12);
    setQuickOpen(true);
  };

  const resolveStart = (): Date => {
    if (whenMode === "now") return new Date();
    let baseDate = selectedDate;
    if (whenMode === "today") baseDate = toDateInput(new Date());
    if (whenMode === "yesterday") {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      baseDate = toDateInput(y);
    }
    return combineDateAndTime(baseDate, selectedTime);
  };

  const saveQuick = () => {
    const svc = pending;
    if (!svc || !svc.name || svc.price <= 0) return;
    if (quickPayment !== "pix" && quickPayment !== "cash") {
      setQuickPayError(true);
      return;
    }
    const start = resolveStart();
    const dur = svc.duration_minutes > 0 ? svc.duration_minutes : 30;
    const end = addMinutes(start, dur);
    addAppointment({
      service_id: svc.id,
      service_name: svc.name,
      price: svc.price,
      started_at: start.toISOString(),
      ended_at: end.toISOString(),
      duration_seconds: dur * 60,
      note: whenMode === "now" ? "Ação rápida" : "Lançamento manual",
      payment_method: quickPayment,
    });
    if (whenMode === "custom" || whenMode === "today" || whenMode === "yesterday") {
      try {
        localStorage.setItem(LS_LAST_DATE, toDateInput(start));
      } catch {
        /* ignore */
      }
    }
    haptic(20);
    setQuickOpen(false);
    setShowQuickCustom(false);
    setQuickCustomName("");
    setQuickCustomPrice("");
    setQuickCustomDuration("");
    setPending(null);
    setQuickPayment(null);
    setQuickPayError(false);
  };

  const selectService = (svc: QuickService) => {
    haptic(10);
    setPending(svc);
    setQuickPayError(false);
  };

  const today = useMemo(() => new Date(), []);
  const todayItems = useMemo(
    () =>
      appointments
        .filter((a) => isSameDay(new Date(a.started_at), today))
        .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()),
    [appointments, today],
  );
  const total = todayItems.reduce((sum, a) => sum + a.price, 0);
  const barberTotal = todayItems.reduce((s, a) => s + (a.barber_share ?? 0), 0);
  const ownerTotal = todayItems.reduce((s, a) => s + (a.owner_share ?? 0), 0);
  const count = todayItems.length;
  const avg = count > 0 ? total / count : 0;
  const progress = profile.daily_goal > 0 ? total / profile.daily_goal : 0;
  const missing = Math.max(0, profile.daily_goal - total);
  const goalReached = profile.daily_goal > 0 && total >= profile.daily_goal;

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
          {profile.daily_goal > 0 && (
            <div className="mt-4 flex items-center justify-center gap-2 text-sm">
              {goalReached ? (
                <>
                  <CheckCircle2 size={16} className="text-emerald-400" />
                  <span className="font-semibold text-emerald-400">Meta batida! 🎯</span>
                </>
              ) : (
                <span className="font-medium text-gray-300">
                  Faltam{" "}
                  <span className="font-bold text-primary tabular-nums">{formatBRL(missing)}</span>{" "}
                  para sua meta
                </span>
              )}
            </div>
          )}
        </motion.div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-[#1C1C1E] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              Barbeiro hoje
            </p>
            <p className="mt-1 text-xl font-bold tabular-nums tracking-tight text-emerald-400">
              {formatBRL(barberTotal)}
            </p>
            <p className="mt-0.5 text-[11px] text-gray-500">{profile.barber_percentage}% das vendas</p>
          </div>
          <div className="rounded-2xl bg-[#1C1C1E] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              Dono hoje
            </p>
            <p className="mt-1 text-xl font-bold tabular-nums tracking-tight text-amber-400">
              {formatBRL(ownerTotal)}
            </p>
            <p className="mt-0.5 text-[11px] text-gray-500">
              {100 - profile.barber_percentage}% das vendas
            </p>
          </div>
        </div>

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

      {/* FAB Ação Rápida */}
      <motion.button
        whileTap={{ scale: 0.92 }}
        onClick={openQuick}
        className="fixed bottom-24 right-5 z-30 flex h-14 items-center gap-2 rounded-full bg-primary px-5 font-bold text-primary-foreground shadow-xl shadow-primary/30"
        aria-label="Ação rápida"
      >
        <Zap size={20} fill="currentColor" />
        Ação rápida
      </motion.button>

      <BottomSheet open={quickOpen} onClose={() => setQuickOpen(false)} title="Ação rápida">
        {/* Quando? */}
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
          Quando
        </p>
        <div className="-mx-5 mb-3 flex snap-x snap-mandatory gap-2 overflow-x-auto px-5 scrollbar-hide">
          {(
            [
              { k: "now", l: "Agora" },
              { k: "today", l: "Hoje" },
              { k: "yesterday", l: "Ontem" },
              { k: "custom", l: "Escolher" },
            ] as const
          ).map((opt) => {
            const sel = whenMode === opt.k;
            return (
              <button
                key={opt.k}
                onClick={() => {
                  haptic(6);
                  setWhenMode(opt.k);
                  if (opt.k === "today") setSelectedDate(toDateInput(new Date()));
                  if (opt.k === "yesterday") {
                    const y = new Date();
                    y.setDate(y.getDate() - 1);
                    setSelectedDate(toDateInput(y));
                  }
                }}
                className={`shrink-0 snap-start rounded-full px-4 py-2 text-sm font-semibold tracking-tight transition-colors ${
                  sel ? "bg-primary text-primary-foreground" : "bg-[#2C2C2E] text-gray-200"
                }`}
              >
                {opt.l}
              </button>
            );
          })}
        </div>

        <AnimatePresence initial={false}>
          {whenMode !== "now" && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-3 grid grid-cols-2 gap-2 overflow-hidden"
            >
              {whenMode === "custom" && (
                <div className="col-span-2 rounded-2xl bg-[#2C2C2E] px-4 py-3">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500">Data</p>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="mt-1 w-full bg-transparent text-base font-semibold tabular-nums outline-none"
                  />
                </div>
              )}
              <div className="col-span-2 rounded-2xl bg-[#2C2C2E] px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-gray-500">Horário</p>
                <input
                  type="time"
                  value={selectedTime}
                  onChange={(e) => setSelectedTime(e.target.value)}
                  className="mt-1 w-full bg-transparent text-base font-semibold tabular-nums outline-none"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
          Serviço · 1 toque para salvar
        </p>
        <ul className="space-y-2">
          {services.filter((s) => s.is_active).map((s) => (
            <li key={s.id}>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() =>
                  saveQuick({
                    id: s.id,
                    name: s.name,
                    price: s.price,
                    duration_minutes: s.duration_minutes ?? 30,
                  })
                }
                className="flex w-full items-center justify-between rounded-2xl bg-[#2C2C2E] px-4 py-3 text-left active:bg-primary/15"
              >
                <span>
                  <span className="block font-semibold tracking-tight">{s.name}</span>
                  <span className="block text-[11px] text-gray-500 tabular-nums">
                    {s.duration_minutes ?? 30} min
                  </span>
                </span>
                <span className="font-bold text-primary tabular-nums">{formatBRL(s.price)}</span>
              </motion.button>
            </li>
          ))}
        </ul>

        <button
          onClick={() => setShowQuickCustom((v) => !v)}
          className="mt-4 w-full rounded-2xl border border-white/10 py-3 text-sm font-semibold text-gray-200"
        >
          {showQuickCustom ? "Cancelar valor avulso" : "+ Valor avulso"}
        </button>

        <AnimatePresence initial={false}>
          {showQuickCustom && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 space-y-2 overflow-hidden"
            >
              <input
                value={quickCustomName}
                onChange={(e) => setQuickCustomName(e.target.value)}
                placeholder="Descrição (ex: Corte simples)"
                className="w-full rounded-2xl bg-[#2C2C2E] px-4 py-3 outline-none placeholder:text-gray-500"
              />
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center rounded-2xl bg-[#2C2C2E] px-4 py-3">
                  <span className="mr-2 text-gray-400">R$</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={quickCustomPrice}
                    onChange={(e) => setQuickCustomPrice(e.target.value)}
                    placeholder="0,00"
                    className="w-full bg-transparent text-base tabular-nums outline-none placeholder:text-gray-500"
                  />
                </div>
                <div className="flex items-center rounded-2xl bg-[#2C2C2E] px-4 py-3">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={quickCustomDuration}
                    onChange={(e) => setQuickCustomDuration(e.target.value)}
                    placeholder="30"
                    className="w-full bg-transparent text-base tabular-nums outline-none placeholder:text-gray-500"
                  />
                  <span className="ml-2 text-gray-400">min</span>
                </div>
              </div>
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => {
                  const p = parseFloat(quickCustomPrice.replace(",", "."));
                  if (!quickCustomName.trim() || isNaN(p) || p <= 0) return;
                  const d = parseInt(quickCustomDuration, 10);
                  saveQuick({
                    id: null,
                    name: quickCustomName.trim(),
                    price: p,
                    duration_minutes: Number.isFinite(d) && d > 0 ? d : 30,
                  });
                }}
                className="w-full rounded-2xl bg-primary py-3 font-bold text-primary-foreground"
              >
                Salvar avulso
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </BottomSheet>
    </div>
  );
}
