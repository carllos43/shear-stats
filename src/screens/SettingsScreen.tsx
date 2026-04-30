import { motion } from "framer-motion";
import {
  ChevronRight,
  Clock,
  CreditCard,
  LogOut,
  Moon,
  Percent,
  Scissors,
  Store,
  Target,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Header } from "@/components/Header";
import { BottomSheet } from "@/components/BottomSheet";
import { useAppStore } from "@/store/app-store";
import { formatBRL, haptic } from "@/lib/haptics";
import { useAuth } from "@/integrations/supabase/auth-context";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 mt-6 px-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
      {children}
    </h2>
  );
}

function Row({
  icon: Icon,
  label,
  value,
  onClick,
  destructive,
  iconBg = "bg-white/10",
}: {
  icon: LucideIcon;
  label: string;
  value?: string;
  onClick?: () => void;
  destructive?: boolean;
  iconBg?: string;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.985 }}
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-white/5"
    >
      <span
        className={`flex h-8 w-8 items-center justify-center rounded-lg ${
          destructive ? "bg-destructive/15" : iconBg
        }`}
      >
        <Icon size={16} className={destructive ? "text-destructive" : "text-primary"} />
      </span>
      <span className={`flex-1 font-medium tracking-tight ${destructive ? "text-destructive" : ""}`}>
        {label}
      </span>
      {value && <span className="text-sm text-gray-400 tabular-nums">{value}</span>}
      {onClick && !destructive && <ChevronRight size={16} className="text-gray-600" />}
    </motion.button>
  );
}

function Group({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-[#1C1C1E] divide-y divide-white/5">
      {children}
    </div>
  );
}

const WEEKDAYS = [
  { i: 0, label: "Domingo", short: "Dom" },
  { i: 1, label: "Segunda", short: "Seg" },
  { i: 2, label: "Terça", short: "Ter" },
  { i: 3, label: "Quarta", short: "Qua" },
  { i: 4, label: "Quinta", short: "Qui" },
  { i: 5, label: "Sexta", short: "Sex" },
  { i: 6, label: "Sábado", short: "Sáb" },
];

export function SettingsScreen() {
  const profile = useAppStore((s) => s.profile);
  const setProfile = useAppStore((s) => s.setProfile);
  const services = useAppStore((s) => s.services);
  const addService = useAppStore((s) => s.addService);
  const removeService = useAppStore((s) => s.removeService);
  const appointmentsCount = useAppStore((s) => s.appointments.length);
  const workSchedule = useAppStore((s) => s.workSchedule);
  const setWorkSchedule = useAppStore((s) => s.setWorkSchedule);
  const { user, signOut } = useAuth();

  const [editName, setEditName] = useState(false);
  const [editGoal, setEditGoal] = useState(false);
  const [editPct, setEditPct] = useState(false);
  const [editServices, setEditServices] = useState(false);
  const [editHours, setEditHours] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const [nameDraft, setNameDraft] = useState(profile.barbershop_name);
  const [goalDraft, setGoalDraft] = useState(profile.daily_goal.toString());
  const [pctDraft, setPctDraft] = useState(profile.barber_percentage.toString());

  const [scheduleDraft, setScheduleDraft] = useState(workSchedule);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  const [newSvcName, setNewSvcName] = useState("");
  const [newSvcPrice, setNewSvcPrice] = useState("");

  // Resumo do horário (ex.: "Seg–Sáb 09:00–20:00 · Dom fechado")
  const scheduleSummary = (() => {
    const active = workSchedule.filter((d) => d.is_active);
    if (active.length === 0) return "Fechado";
    const first = active[0];
    const allSame = active.every(
      (d) => d.start_time === first.start_time && d.end_time === first.end_time,
    );
    if (allSame && active.length === 7) return `${first.start_time}–${first.end_time}`;
    if (allSame) return `${active.length}d · ${first.start_time}–${first.end_time}`;
    return "Variável";
  })();

  return (
    <div>
      <Header title="Ajustes" />
      <div className="px-5 pt-2 pb-32">
        <SectionTitle>Perfil</SectionTitle>
        <Group>
          <Row
            icon={Store}
            label="Nome da barbearia"
            value={profile.barbershop_name}
            onClick={() => {
              setNameDraft(profile.barbershop_name);
              setEditName(true);
            }}
          />
          <Row
            icon={Target}
            label="Meta diária"
            value={formatBRL(profile.daily_goal)}
            onClick={() => {
              setGoalDraft(profile.daily_goal.toString());
              setEditGoal(true);
            }}
          />
          <Row
            icon={Percent}
            label="Comissão do barbeiro"
            value={`${profile.barber_percentage}% / ${100 - profile.barber_percentage}%`}
            onClick={() => {
              setPctDraft(profile.barber_percentage.toString());
              setEditPct(true);
            }}
          />
          <Row icon={CreditCard} label="Moeda" value="BRL" />
        </Group>

        <SectionTitle>Catálogo</SectionTitle>
        <Group>
          <Row
            icon={Scissors}
            label="Serviços"
            value={`${services.length}`}
            onClick={() => setEditServices(true)}
          />
          <Row
            icon={Clock}
            label="Horário de trabalho"
            value={scheduleSummary}
            onClick={() => {
              setScheduleDraft(workSchedule.map((d) => ({ ...d })));
              setScheduleError(null);
              setEditHours(true);
            }}
          />
        </Group>

        <SectionTitle>Aparência</SectionTitle>
        <Group>
          <Row icon={Moon} label="Tema" value="Escuro" />
        </Group>

        <SectionTitle>Conta</SectionTitle>
        <Group>
          <Row
            icon={LogOut}
            label={user?.email ? `Sair (${user.email})` : "Sair"}
            onClick={async () => {
              haptic(10);
              await signOut();
            }}
          />
          <Row
            icon={Trash2}
            label="Apagar todos os dados"
            destructive
            onClick={() => setConfirmReset(true)}
          />
        </Group>

        <p className="mt-8 text-center text-[11px] text-gray-600">
          BarberMetrics 2.0 · {appointmentsCount} atendimento{appointmentsCount !== 1 ? "s" : ""} registrado
          {appointmentsCount !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Nome */}
      <BottomSheet open={editName} onClose={() => setEditName(false)} title="Nome da barbearia">
        <input
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          className="w-full rounded-2xl bg-[#2C2C2E] px-4 py-3 outline-none placeholder:text-gray-500"
          placeholder="Minha Barbearia"
        />
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={() => {
            setProfile({ barbershop_name: nameDraft.trim() || "Minha Barbearia" });
            haptic(10);
            setEditName(false);
          }}
          className="mt-5 w-full rounded-2xl bg-primary py-4 font-bold text-primary-foreground"
        >
          Salvar
        </motion.button>
      </BottomSheet>

      {/* Meta */}
      <BottomSheet open={editGoal} onClose={() => setEditGoal(false)} title="Meta diária">
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
            haptic(10);
            setEditGoal(false);
          }}
          className="mt-5 w-full rounded-2xl bg-primary py-4 font-bold text-primary-foreground"
        >
          Salvar
        </motion.button>
      </BottomSheet>

      {/* Comissão do barbeiro */}
      <BottomSheet open={editPct} onClose={() => setEditPct(false)} title="Comissão do barbeiro">
        <p className="mb-3 text-sm text-gray-400">
          Quanto da venda fica com o barbeiro. O restante é o lucro do dono.
        </p>
        <div className="flex items-center rounded-2xl bg-[#2C2C2E] px-4 py-3">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            value={pctDraft}
            onChange={(e) => setPctDraft(e.target.value)}
            className="w-full bg-transparent text-2xl font-bold tabular-nums outline-none"
            placeholder="60"
          />
          <span className="ml-2 text-gray-400">%</span>
        </div>
        <div className="mt-3 flex items-center justify-between rounded-2xl bg-[#2C2C2E] px-4 py-3 text-sm">
          <span className="text-gray-400">Dono recebe</span>
          <span className="font-bold tabular-nums text-primary">
            {Math.max(0, Math.min(100, 100 - (parseFloat(pctDraft.replace(",", ".")) || 0))).toFixed(0)}%
          </span>
        </div>
        <p className="mt-3 text-[11px] text-gray-500">
          Atendimentos já registrados mantêm os valores antigos. A nova porcentagem vale para os
          próximos.
        </p>
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={() => {
            const v = parseFloat(pctDraft.replace(",", "."));
            const clamped = isNaN(v) ? 60 : Math.max(0, Math.min(100, v));
            setProfile({ barber_percentage: clamped });
            haptic(10);
            setEditPct(false);
          }}
          className="mt-5 w-full rounded-2xl bg-primary py-4 font-bold text-primary-foreground"
        >
          Salvar
        </motion.button>
      </BottomSheet>

      <BottomSheet open={editServices} onClose={() => setEditServices(false)} title="Serviços">
        <ul className="space-y-2">
          {services.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between rounded-2xl bg-[#2C2C2E] px-4 py-3"
            >
              <div>
                <p className="font-semibold tracking-tight">{s.name}</p>
                <p className="text-xs text-gray-400 tabular-nums">{formatBRL(s.price)}</p>
              </div>
              <button
                onClick={() => {
                  removeService(s.id);
                  haptic(8);
                }}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-destructive/15 text-destructive"
              >
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-5 space-y-2">
          <input
            value={newSvcName}
            onChange={(e) => setNewSvcName(e.target.value)}
            placeholder="Nome do serviço"
            className="w-full rounded-2xl bg-[#2C2C2E] px-4 py-3 outline-none placeholder:text-gray-500"
          />
          <div className="flex items-center rounded-2xl bg-[#2C2C2E] px-4 py-3">
            <span className="mr-2 text-gray-400">R$</span>
            <input
              type="number"
              inputMode="decimal"
              value={newSvcPrice}
              onChange={(e) => setNewSvcPrice(e.target.value)}
              placeholder="0,00"
              className="w-full bg-transparent tabular-nums outline-none"
            />
          </div>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => {
              const p = parseFloat(newSvcPrice.replace(",", "."));
              if (!newSvcName.trim() || isNaN(p) || p <= 0) return;
              addService({ name: newSvcName.trim(), price: p });
              setNewSvcName("");
              setNewSvcPrice("");
              haptic(10);
            }}
            className="w-full rounded-2xl bg-primary py-3 font-bold text-primary-foreground"
          >
            Adicionar
          </motion.button>
        </div>
      </BottomSheet>

      {/* Horário por dia da semana */}
      <BottomSheet open={editHours} onClose={() => setEditHours(false)} title="Horário de trabalho">
        <p className="mb-3 text-xs text-gray-400">
          Defina horário por dia. Marque como fechado para folgas.
        </p>
        <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
          {scheduleDraft.map((d) => {
            const wd = WEEKDAYS[d.day_of_week];
            const invalid =
              d.is_active && d.start_time >= d.end_time;
            return (
              <div
                key={d.day_of_week}
                className={`rounded-2xl bg-[#2C2C2E] px-3 py-3 ${
                  invalid ? "ring-1 ring-destructive" : ""
                }`}
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-semibold tracking-tight">{wd.label}</span>
                  <button
                    onClick={() => {
                      haptic(6);
                      setScheduleDraft((prev) =>
                        prev.map((x) =>
                          x.day_of_week === d.day_of_week
                            ? { ...x, is_active: !x.is_active }
                            : x,
                        ),
                      );
                    }}
                    className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${
                      d.is_active
                        ? "bg-primary text-primary-foreground"
                        : "bg-white/5 text-gray-400"
                    }`}
                  >
                    {d.is_active ? "Aberto" : "Fechado"}
                  </button>
                </div>
                {d.is_active && (
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="time"
                      value={d.start_time}
                      onChange={(e) =>
                        setScheduleDraft((prev) =>
                          prev.map((x) =>
                            x.day_of_week === d.day_of_week
                              ? { ...x, start_time: e.target.value }
                              : x,
                          ),
                        )
                      }
                      className="rounded-xl bg-black/30 px-3 py-2 text-base font-semibold tabular-nums outline-none"
                    />
                    <input
                      type="time"
                      value={d.end_time}
                      onChange={(e) =>
                        setScheduleDraft((prev) =>
                          prev.map((x) =>
                            x.day_of_week === d.day_of_week
                              ? { ...x, end_time: e.target.value }
                              : x,
                          ),
                        )
                      }
                      className="rounded-xl bg-black/30 px-3 py-2 text-base font-semibold tabular-nums outline-none"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {scheduleError && (
          <p className="mt-3 text-center text-xs font-semibold text-destructive">
            {scheduleError}
          </p>
        )}
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={() => {
            // Validação: para todos ativos, start < end
            const bad = scheduleDraft.find(
              (d) => d.is_active && d.start_time >= d.end_time,
            );
            if (bad) {
              setScheduleError(
                `Horário inválido em ${WEEKDAYS[bad.day_of_week].label}`,
              );
              haptic(20);
              return;
            }
            setScheduleError(null);
            setWorkSchedule(scheduleDraft);
            // Mantém compat: profile.work_start/end espelha o primeiro dia ativo
            const firstActive = scheduleDraft.find((d) => d.is_active);
            if (firstActive) {
              setProfile({
                work_start: firstActive.start_time,
                work_end: firstActive.end_time,
              });
            }
            haptic(10);
            setEditHours(false);
          }}
          className="mt-5 w-full rounded-2xl bg-primary py-4 font-bold text-primary-foreground"
        >
          Salvar
        </motion.button>
      </BottomSheet>

      {/* Reset */}
      <BottomSheet open={confirmReset} onClose={() => setConfirmReset(false)} title="Apagar dados?">
        <p className="mb-5 text-sm text-gray-400">
          Todos os atendimentos, serviços e configurações serão removidos deste dispositivo. Esta
          ação não pode ser desfeita.
        </p>
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={() => {
            localStorage.removeItem("barbermetrics-v2");
            haptic(25);
            location.reload();
          }}
          className="w-full rounded-2xl bg-destructive py-4 font-bold text-white"
        >
          Apagar tudo
        </motion.button>
        <button
          onClick={() => setConfirmReset(false)}
          className="mt-2 w-full rounded-2xl py-3 text-sm font-semibold text-gray-400"
        >
          Cancelar
        </button>
      </BottomSheet>
    </div>
  );
}
