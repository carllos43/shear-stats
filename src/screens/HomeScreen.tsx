import { AnimatePresence, motion } from "framer-motion";
import { Zap, CheckCircle2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { BottomSheet } from "@/components/BottomSheet";
import { useAppStore } from "@/store/app-store";
import { formatBRL, haptic } from "@/lib/haptics";
import { PaymentBadge } from "@/components/PaymentPicker";
import { AppointmentForm, type NewAppointment } from "@/components/AppointmentForm";

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
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Meta diária</span>
        <span className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-primary">
          {formatBRL(value)}
        </span>
        <span className="mt-0.5 text-xs text-muted-foreground tabular-nums">de {formatBRL(goal)}</span>
        <span className="mt-1 text-[11px] font-semibold text-muted-foreground tabular-nums">
          {Math.round(pct * 100)}%
        </span>
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="min-w-[160px] snap-start rounded-3xl bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={`mt-2 text-2xl font-bold tabular-nums tracking-tight ${
          accent ? "text-primary" : "text-foreground"
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
  const [y, mo, d] = (dateStr || "").split("-").map(Number);
  const [h, mi] = (timeStr || "").split(":").map(Number);
  if ([y, mo, d].some((n) => !Number.isFinite(n))) return new Date();
  const hh = Number.isFinite(h) ? h : 12;
  const mm = Number.isFinite(mi) ? mi : 0;
  // Constrói a data direta — evita overflow de mês (ex: dia 31 em mês de 30 dias).
  return new Date(y, mo - 1, d, hh, mm, 0, 0);
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

  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const openQuick = () => {
    haptic(12);
    setQuickOpen(true);
  };

  const onQuickSave = (a: NewAppointment) => {
    addAppointment(a);
    const start = new Date(a.started_at);
    setSavedMsg(
      isSameDay(start, new Date())
        ? `${a.service_name} salvo · ${formatBRL(a.price)}`
        : `${a.service_name} salvo em ${start.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às ${toTimeInput(start)} · veja em Atendimentos`,
    );
    window.setTimeout(() => setSavedMsg(null), 4000);
    setQuickOpen(false);
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
  const count = todayItems.filter((a) => !a.is_historical).length;
  const avg = count > 0 ? total / count : 0;
  const pixItems = todayItems.filter((a) => a.payment_method === "pix");
  const cashItems = todayItems.filter((a) => a.payment_method === "cash");
  const otherItems = todayItems.filter((a) => a.payment_method !== "pix" && a.payment_method !== "cash");
  const pixTotal = pixItems.reduce((s2, a) => s2 + a.price, 0);
  const cashTotal = cashItems.reduce((s2, a) => s2 + a.price, 0);
  const otherTotal = otherItems.reduce((s2, a) => s2 + a.price, 0);
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
      <AnimatePresence>
        {savedMsg && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            role="status"
            className="mx-5 mt-2 flex items-center gap-2 rounded-2xl bg-emerald-500/15 px-4 py-3 text-sm font-semibold text-emerald-300"
          >
            <CheckCircle2 size={16} />
            <span>{savedMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="px-5 pt-6 pb-32">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 26 }}
          className="rounded-3xl bg-card p-6"
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
                <span className="font-medium text-foreground/80">
                  Faltam{" "}
                  <span className="font-bold text-primary tabular-nums">{formatBRL(missing)}</span>{" "}
                  para sua meta
                </span>
              )}
            </div>
          )}
        </motion.div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-card p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Barbeiro hoje
            </p>
            <p className="mt-1 text-xl font-bold tabular-nums tracking-tight text-emerald-400">
              {formatBRL(barberTotal)}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{profile.barber_percentage}% das vendas</p>
          </div>
          <div className="rounded-2xl bg-card p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Dono hoje
            </p>
            <p className="mt-1 text-xl font-bold tabular-nums tracking-tight text-amber-400">
              {formatBRL(ownerTotal)}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {100 - profile.barber_percentage}% das vendas
            </p>
          </div>
        </div>

        <div className="mt-5 -mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-1 scrollbar-hide">
          <StatCard label="Faturamento" value={formatBRL(total)} accent />
          <StatCard label="Atendimentos" value={count.toString()} />
          <StatCard label="Ticket médio" value={formatBRL(avg)} />
        </div>

        {count > 0 && (
          <div className="mt-6 rounded-3xl bg-card p-5">
            <div className="flex items-baseline justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Fechamento do dia
              </p>
              <p className="text-lg font-bold tabular-nums text-primary">{formatBRL(total)}</p>
            </div>
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between rounded-2xl bg-foreground/5 px-4 py-2.5">
                <span className="text-sm font-semibold text-foreground/80">PIX</span>
                <span className="text-right">
                  <span className="block text-sm font-bold tabular-nums text-foreground">{formatBRL(pixTotal)}</span>
                  <span className="block text-[11px] text-muted-foreground tabular-nums">
                    {pixItems.length} atendimento{pixItems.length === 1 ? "" : "s"}
                  </span>
                </span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-foreground/5 px-4 py-2.5">
                <span className="text-sm font-semibold text-foreground/80">DINHEIRO</span>
                <span className="text-right">
                  <span className="block text-sm font-bold tabular-nums text-foreground">{formatBRL(cashTotal)}</span>
                  <span className="block text-[11px] text-muted-foreground tabular-nums">
                    {cashItems.length} atendimento{cashItems.length === 1 ? "" : "s"}
                  </span>
                </span>
              </div>
              {otherItems.length > 0 && (
                <div className="flex items-center justify-between rounded-2xl bg-foreground/5 px-4 py-2.5">
                  <span className="text-sm font-semibold text-muted-foreground">SEM REGISTRO</span>
                  <span className="text-right">
                    <span className="block text-sm font-bold tabular-nums text-foreground/80">{formatBRL(otherTotal)}</span>
                    <span className="block text-[11px] text-muted-foreground tabular-nums">
                      {otherItems.length} atendimento{otherItems.length === 1 ? "" : "s"}
                    </span>
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-foreground/10 px-4 pt-3">
                <span className="text-sm font-bold text-foreground/80">TOTAL</span>
                <span className="text-right">
                  <span className="block text-sm font-bold tabular-nums text-primary">{formatBRL(total)}</span>
                  <span className="block text-[11px] text-muted-foreground tabular-nums">
                    {count} atendimento{count === 1 ? "" : "s"}
                  </span>
                </span>
              </div>
            </div>
          </div>
        )}

        <h2 className="mt-8 mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Atendimentos de hoje
        </h2>
        {todayItems.length === 0 ? (
          <div className="rounded-3xl bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">Nenhum atendimento ainda hoje.</p>
            <p className="mt-1 text-xs text-muted-foreground">Inicie o cronômetro para começar.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {todayItems.slice(0, 5).map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between rounded-2xl bg-card px-4 py-3"
              >
                <div>
                  <p className="font-semibold tracking-tight">{a.service_name}</p>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
                    {new Date(a.started_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    <PaymentBadge method={a.payment_method} />
                  </p>
                </div>
                <span className="font-bold text-primary tabular-nums">{formatBRL(a.price)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <BottomSheet open={gearOpen} onClose={() => setGearOpen(false)} title="Meta diária">
        <p className="mb-3 text-sm text-muted-foreground">
          Defina o quanto você quer faturar por dia.
        </p>
        <div className="flex items-center rounded-2xl bg-card-elevated px-4 py-3">
          <span className="mr-2 text-muted-foreground">R$</span>
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
        className="fixed bottom-24 right-5 z-30 flex h-14 items-center gap-2 rounded-full bg-primary px-5 font-bold text-primary-foreground shadow-sm"
        aria-label="Ação rápida"
      >
        <Zap size={20} fill="currentColor" />
        Ação rápida
      </motion.button>

      <BottomSheet open={quickOpen} onClose={() => setQuickOpen(false)} title="Ação rápida">
        <AppointmentForm open={quickOpen} when={{ kind: "quick" }} onSubmit={(a) => onQuickSave(a)} />
      </BottomSheet>
    </div>
  );
}
