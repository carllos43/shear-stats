import { motion } from "framer-motion";
import { Zap, Clock, CheckCircle2 } from "lucide-react";
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

type QuickService = { id: string | null; name: string; price: number };

export function HomeScreen() {
  const profile = useAppStore((s) => s.profile);
  const setProfile = useAppStore((s) => s.setProfile);
  const appointments = useAppStore((s) => s.appointments);
  const services = useAppStore((s) => s.services);
  const addAppointment = useAppStore((s) => s.addAppointment);
  const [gearOpen, setGearOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [goalDraft, setGoalDraft] = useState(profile.daily_goal.toString());
  const [quickCustomName, setQuickCustomName] = useState("");
  const [quickCustomPrice, setQuickCustomPrice] = useState("");
  const [showQuickCustom, setShowQuickCustom] = useState(false);

  // Novo fluxo: ao tocar num serviço, abre escolha de modo
  const [chooseModeFor, setChooseModeFor] = useState<QuickService | null>(null);
  const [scheduleFor, setScheduleFor] = useState<QuickService | null>(null);
  const [schedStart, setSchedStart] = useState("");
  const [schedEnd, setSchedEnd] = useState("");

  const saveAppointment = (
    svc: QuickService,
    startedAt: string,
    endedAt: string,
    duration: number,
    note: string,
  ) => {
    addAppointment({
      service_id: svc.id,
      service_name: svc.name,
      price: svc.price,
      started_at: startedAt,
      ended_at: endedAt,
      duration_seconds: duration,
      note,
    });
  };

  const quickSaveNow = (svc: QuickService) => {
    if (!svc.name || svc.price <= 0) return;
    const now = new Date().toISOString();
    saveAppointment(svc, now, now, 0, "Ação rápida");
    haptic(20);
    setChooseModeFor(null);
    setQuickOpen(false);
    setShowQuickCustom(false);
    setQuickCustomName("");
    setQuickCustomPrice("");
  };

  const openSchedule = (svc: QuickService) => {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    setSchedStart(`${hh}:${mm}`);
    const end = new Date(now.getTime() + 30 * 60 * 1000);
    setSchedEnd(
      `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`,
    );
    setChooseModeFor(null);
    setScheduleFor(svc);
  };

  const confirmSchedule = () => {
    if (!scheduleFor) return;
    const [sh, sm] = schedStart.split(":").map(Number);
    const [eh, em] = schedEnd.split(":").map(Number);
    if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return;
    const base = new Date();
    const start = new Date(base);
    start.setHours(sh, sm, 0, 0);
    const end = new Date(base);
    end.setHours(eh, em, 0, 0);
    if (end.getTime() <= start.getTime()) end.setDate(end.getDate() + 1);
    const duration = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
    saveAppointment(
      scheduleFor,
      start.toISOString(),
      end.toISOString(),
      duration,
      "Horário definido",
    );
    haptic(20);
    setScheduleFor(null);
    setQuickOpen(false);
    setShowQuickCustom(false);
    setQuickCustomName("");
    setQuickCustomPrice("");
  };

  const today = useMemo(() => new Date(), []);
  const todayItems = useMemo(
    () => appointments.filter((a) => isSameDay(new Date(a.started_at), today)),
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

        {/* Separação de ganhos */}
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
        onClick={() => {
          haptic(12);
          setQuickOpen(true);
        }}
        className="fixed bottom-24 right-5 z-30 flex h-14 items-center gap-2 rounded-full bg-primary px-5 font-bold text-primary-foreground shadow-xl shadow-primary/30"
        aria-label="Ação rápida"
      >
        <Zap size={20} fill="currentColor" />
        Ação rápida
      </motion.button>

      <BottomSheet open={quickOpen} onClose={() => setQuickOpen(false)} title="Ação rápida">
        <p className="mb-3 text-xs text-gray-400">
          Escolha um serviço — você poderá salvar agora ou definir o horário.
        </p>
        <ul className="space-y-2">
          {services.filter((s) => s.is_active).map((s) => (
            <li key={s.id}>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => {
                  haptic(8);
                  setChooseModeFor({ id: s.id, name: s.name, price: s.price });
                }}
                className="flex w-full items-center justify-between rounded-2xl bg-[#2C2C2E] px-4 py-3 text-left"
              >
                <span className="font-semibold tracking-tight">{s.name}</span>
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

        {showQuickCustom && (
          <div className="mt-3 space-y-2">
            <input
              value={quickCustomName}
              onChange={(e) => setQuickCustomName(e.target.value)}
              placeholder="Descrição (ex: Corte simples)"
              className="w-full rounded-2xl bg-[#2C2C2E] px-4 py-3 outline-none placeholder:text-gray-500"
            />
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
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={() => {
                const p = parseFloat(quickCustomPrice.replace(",", "."));
                if (!quickCustomName.trim() || isNaN(p) || p <= 0) return;
                setChooseModeFor({
                  id: null,
                  name: quickCustomName.trim() || "Avulso",
                  price: p,
                });
              }}
              className="w-full rounded-2xl bg-primary py-3 font-bold text-primary-foreground"
            >
              Continuar
            </motion.button>
          </div>
        )}
      </BottomSheet>

      {/* Escolha de modo: salvar rápido ou definir horário */}
      <BottomSheet
        open={chooseModeFor !== null}
        onClose={() => setChooseModeFor(null)}
        title={chooseModeFor?.name ?? ""}
      >
        <p className="mb-4 text-sm text-gray-400">
          Como você quer registrar este atendimento?
        </p>
        <div className="space-y-2">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => chooseModeFor && quickSaveNow(chooseModeFor)}
            className="flex w-full items-center gap-3 rounded-2xl bg-primary px-4 py-4 text-left text-primary-foreground"
          >
            <Zap size={20} fill="currentColor" />
            <div className="flex-1">
              <p className="font-bold tracking-tight">Salvar rápido</p>
              <p className="text-xs opacity-80">Registra agora, sem horário</p>
            </div>
            <span className="font-bold tabular-nums">
              {chooseModeFor && formatBRL(chooseModeFor.price)}
            </span>
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => chooseModeFor && openSchedule(chooseModeFor)}
            className="flex w-full items-center gap-3 rounded-2xl bg-[#2C2C2E] px-4 py-4 text-left"
          >
            <Clock size={20} className="text-primary" />
            <div className="flex-1">
              <p className="font-bold tracking-tight">Definir horário</p>
              <p className="text-xs text-gray-400">Informe início e fim</p>
            </div>
          </motion.button>
        </div>
      </BottomSheet>

      {/* Form: definir horário */}
      <BottomSheet
        open={scheduleFor !== null}
        onClose={() => setScheduleFor(null)}
        title={`Horário · ${scheduleFor?.name ?? ""}`}
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-[#2C2C2E] px-4 py-3">
            <p className="text-[11px] uppercase tracking-wider text-gray-500">Início</p>
            <input
              type="time"
              value={schedStart}
              onChange={(e) => setSchedStart(e.target.value)}
              className="mt-1 w-full bg-transparent text-lg font-semibold tabular-nums outline-none"
            />
          </div>
          <div className="rounded-2xl bg-[#2C2C2E] px-4 py-3">
            <p className="text-[11px] uppercase tracking-wider text-gray-500">Fim</p>
            <input
              type="time"
              value={schedEnd}
              onChange={(e) => setSchedEnd(e.target.value)}
              className="mt-1 w-full bg-transparent text-lg font-semibold tabular-nums outline-none"
            />
          </div>
        </div>
        {scheduleFor && (
          <div className="mt-3 flex items-center justify-between rounded-2xl bg-[#2C2C2E] px-4 py-3 text-sm">
            <span className="text-gray-400">Valor</span>
            <span className="font-bold tabular-nums text-primary">
              {formatBRL(scheduleFor.price)}
            </span>
          </div>
        )}
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={confirmSchedule}
          className="mt-5 w-full rounded-2xl bg-primary py-4 font-bold text-primary-foreground"
        >
          Salvar atendimento
        </motion.button>
      </BottomSheet>
    </div>
  );
}
