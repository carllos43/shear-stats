import { motion } from "framer-motion";
import { CalendarDays, ChevronDown, Pencil, Trash2 } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ptBR } from "date-fns/locale";
import { Header } from "@/components/Header";
import { BottomSheet } from "@/components/BottomSheet";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAppStore, type Appointment } from "@/store/app-store";
import { formatBRL, formatTime, haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import {
  addDays,
  formatHourMinute,
  isSameDay,
  startOfDay,
  WEEKDAY_SHORT,
} from "@/lib/dates";

function DayChip({
  date,
  active,
  count,
  onClick,
}: {
  date: Date;
  active: boolean;
  count: number;
  onClick: () => void;
}) {
  const weekday = WEEKDAY_SHORT[date.getDay()];
  const isToday = isSameDay(date, new Date());
  return (
    <motion.button
      whileTap={{ scale: 0.92 }}
      onClick={onClick}
      className={`relative flex h-16 w-12 shrink-0 snap-start flex-col items-center justify-center rounded-2xl text-sm font-semibold tracking-tight transition-colors ${
        active ? "bg-primary text-primary-foreground" : "bg-[#1C1C1E] text-gray-300"
      }`}
    >
      <span className={`text-[10px] uppercase ${active ? "text-primary-foreground/80" : "text-gray-500"}`}>
        {weekday}
      </span>
      <span className="text-lg tabular-nums">{date.getDate()}</span>
      {isToday && !active && (
        <span className="absolute bottom-1 h-1 w-1 rounded-full bg-primary" />
      )}
      {count > 0 && !active && (
        <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
      )}
    </motion.button>
  );
}

const SwipeRow = memo(function SwipeRow({
  appointment,
  onEdit,
  onDelete,
}: {
  appointment: Appointment;
  onEdit: (a: Appointment) => void;
  onDelete: (a: Appointment) => void;
}) {
  const ACTIONS_W = 128;
  const cardRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const startY = useRef(0);
  const baseX = useRef(0);
  const currentX = useRef(0);
  const dragging = useRef(false);
  const decided = useRef<"h" | "v" | null>(null);
  const openRef = useRef(false);

  const setX = useCallback((x: number, animate: boolean) => {
    const el = cardRef.current;
    if (!el) return;
    el.style.transition = animate ? "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)" : "none";
    el.style.transform = `translate3d(${x}px,0,0)`;
    currentX.current = x;
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    startX.current = e.clientX;
    startY.current = e.clientY;
    baseX.current = openRef.current ? -ACTIONS_W : 0;
    dragging.current = true;
    decided.current = null;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;
    if (decided.current === null) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      decided.current = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
      if (decided.current === "h") {
        try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch {}
      }
    }
    if (decided.current !== "h") return;
    e.preventDefault();
    let next = baseX.current + dx;
    if (next > 0) next = next * 0.25;
    if (next < -ACTIONS_W) next = -ACTIONS_W + (next + ACTIONS_W) * 0.25;
    setX(next, false);
  };

  const onPointerUp = () => {
    if (!dragging.current) return;
    dragging.current = false;
    if (decided.current !== "h") return;
    const x = currentX.current;
    const open = openRef.current ? x < -ACTIONS_W / 2 : x < -ACTIONS_W / 3;
    openRef.current = open;
    setX(open ? -ACTIONS_W : 0, true);
  };

  const close = useCallback(() => {
    openRef.current = false;
    setX(0, true);
  }, [setX]);

  return (
    <li className="relative overflow-hidden rounded-2xl bg-[#1C1C1E]">
      <div className="absolute inset-y-0 right-0 flex items-stretch">
        <button
          onClick={() => { close(); onEdit(appointment); }}
          className="flex w-16 items-center justify-center bg-primary/15 text-primary active:bg-primary/25"
          aria-label="Editar"
        >
          <Pencil size={18} />
        </button>
        <button
          onClick={() => { close(); onDelete(appointment); }}
          className="flex w-16 items-center justify-center bg-destructive text-white active:opacity-80"
          aria-label="Excluir"
        >
          <Trash2 size={18} />
        </button>
      </div>
      <div
        ref={cardRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ transform: "translate3d(0,0,0)", touchAction: "pan-y" }}
        className="relative z-10 bg-[#1C1C1E] px-4 py-3 will-change-transform"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-semibold tracking-tight">{appointment.service_name}</p>
            <p className="mt-0.5 text-xs text-gray-400 tabular-nums">
              {formatHourMinute(appointment.started_at)} → {formatHourMinute(appointment.ended_at)}
              <span className="mx-1.5 text-gray-600">·</span>
              {formatTime(appointment.duration_seconds)}
            </p>
          </div>
          <span className="shrink-0 text-right">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500">Total</span>
            <span className="block font-bold text-primary tabular-nums">{formatBRL(appointment.price)}</span>
          </span>
        </div>
        <div className="mt-2 flex items-center gap-2 border-t border-white/5 pt-2">
          <div className="flex-1 rounded-xl bg-white/5 px-2.5 py-1.5">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-500">Barbeiro</p>
            <p className="text-xs font-bold tabular-nums text-emerald-400">{formatBRL(appointment.barber_share)}</p>
          </div>
          <div className="flex-1 rounded-xl bg-white/5 px-2.5 py-1.5">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-500">Dono</p>
            <p className="text-xs font-bold tabular-nums text-amber-400">{formatBRL(appointment.owner_share)}</p>
          </div>
        </div>
      </div>
    </li>
  );
});

export function HistoryScreen() {
  const appointments = useAppStore((s) => s.appointments);
  const services = useAppStore((s) => s.services);
  const updateAppointment = useAppStore((s) => s.updateAppointment);
  const deleteAppointment = useAppStore((s) => s.deleteAppointment);

  const today = useMemo(() => startOfDay(new Date()), []);
  const [selected, setSelected] = useState<Date>(today);
  const [filter, setFilter] = useState<string | "all">("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Appointment | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Appointment | null>(null);

  const days = useMemo(() => {
    return Array.from({ length: 21 }, (_, i) => addDays(today, i - 14));
  }, [today]);

  const dayCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of appointments) {
      const k = startOfDay(new Date(a.started_at)).toISOString();
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return map;
  }, [appointments]);

  const items = useMemo(
    () =>
      appointments
        .filter((a) => isSameDay(new Date(a.started_at), selected))
        .filter((a) => filter === "all" || a.service_id === filter || a.service_name === filter)
        .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()),
    [appointments, selected, filter],
  );

  const dayTotals = useMemo(() => {
    let total = 0, barber = 0, owner = 0;
    for (const a of items) {
      total += a.price;
      barber += a.barber_share;
      owner += a.owner_share;
    }
    return { total, barber, owner };
  }, [items]);
  const dayTotal = dayTotals.total;

  return (
    <div>
      <Header title="Atendimentos" subtitle="Livro caixa" onGear={() => setFilterOpen(true)} />

      <div className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-5 pt-4 scrollbar-hide">
        {days.map((d) => (
          <DayChip
            key={d.toISOString()}
            date={d}
            active={isSameDay(d, selected)}
            count={dayCounts.get(d.toISOString()) ?? 0}
            onClick={() => {
              haptic(8);
              setSelected(d);
            }}
          />
        ))}
      </div>

      <div className="px-5 pt-5 pb-32">
        <div className="mb-3 flex items-baseline justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            {selected.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
          </p>
          <p className="text-sm font-bold text-primary tabular-nums">{formatBRL(dayTotal)}</p>
        </div>

        {items.length > 0 && (
          <div className="mb-4 grid grid-cols-3 gap-2">
            <div className="rounded-2xl bg-[#1C1C1E] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Total</p>
              <p className="mt-1 text-sm font-bold tabular-nums text-primary">{formatBRL(dayTotals.total)}</p>
            </div>
            <div className="rounded-2xl bg-[#1C1C1E] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Barbeiro</p>
              <p className="mt-1 text-sm font-bold tabular-nums text-emerald-400">{formatBRL(dayTotals.barber)}</p>
            </div>
            <div className="rounded-2xl bg-[#1C1C1E] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Dono</p>
              <p className="mt-1 text-sm font-bold tabular-nums text-amber-400">{formatBRL(dayTotals.owner)}</p>
            </div>
          </div>
        )}

        {items.length === 0 ? (
          <div className="rounded-3xl bg-[#1C1C1E] p-8 text-center">
            <p className="text-sm text-gray-400">Nenhum atendimento neste dia.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((a) => (
              <SwipeRow
                key={a.id}
                appointment={a}
                onEdit={setEditTarget}
                onDelete={setDeleteTarget}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Filtros */}
      <BottomSheet open={filterOpen} onClose={() => setFilterOpen(false)} title="Filtrar por serviço">
        <ul className="space-y-1">
          {[{ id: "all", name: "Todos os serviços" }, ...services.map((s) => ({ id: s.id, name: s.name }))].map(
            (opt) => {
              const sel = filter === opt.id;
              return (
                <li key={opt.id}>
                  <button
                    onClick={() => {
                      setFilter(opt.id);
                      haptic(8);
                      setFilterOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left ${
                      sel ? "bg-primary/15 text-primary" : "bg-[#2C2C2E]"
                    }`}
                  >
                    <span className="font-semibold tracking-tight">{opt.name}</span>
                    {sel && <span className="text-primary">✓</span>}
                  </button>
                </li>
              );
            },
          )}
        </ul>
      </BottomSheet>

      {/* Edição */}
      <EditSheet
        appointment={editTarget}
        services={services}
        onClose={() => setEditTarget(null)}
        onSave={(patch) => {
          if (editTarget) updateAppointment(editTarget.id, patch);
          haptic(15);
          setEditTarget(null);
        }}
      />

      {/* Confirmação delete */}
      <BottomSheet
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Excluir atendimento?"
      >
        <p className="mb-5 text-sm text-gray-400">
          Esta ação não pode ser desfeita. O atendimento{" "}
          <span className="font-semibold text-white">{deleteTarget?.service_name}</span> de{" "}
          <span className="font-semibold tabular-nums text-white">
            {deleteTarget && formatBRL(deleteTarget.price)}
          </span>{" "}
          será removido.
        </p>
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={() => {
            if (deleteTarget) deleteAppointment(deleteTarget.id);
            haptic(20);
            setDeleteTarget(null);
          }}
          className="w-full rounded-2xl bg-destructive py-4 font-bold text-white"
        >
          Excluir
        </motion.button>
        <button
          onClick={() => setDeleteTarget(null)}
          className="mt-2 w-full rounded-2xl py-3 text-sm font-semibold text-gray-400"
        >
          Cancelar
        </button>
      </BottomSheet>
    </div>
  );
}

function EditSheet({
  appointment,
  services,
  onClose,
  onSave,
}: {
  appointment: Appointment | null;
  services: ReturnType<typeof useAppStore.getState>["services"];
  onClose: () => void;
  onSave: (patch: Partial<Appointment>) => void;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");

  // sync when target changes
  useMemo(() => {
    if (appointment) {
      setName(appointment.service_name);
      setPrice(appointment.price.toString());
      setNote(appointment.note ?? "");
    }
  }, [appointment]);

  return (
    <BottomSheet open={!!appointment} onClose={onClose} title="Editar atendimento">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Serviço</p>
      <div className="-mx-5 mb-3 flex snap-x snap-mandatory gap-2 overflow-x-auto px-5 scrollbar-hide">
        {services.map((s) => (
          <button
            key={s.id}
            onClick={() => {
              setName(s.name);
              setPrice(s.price.toString());
            }}
            className={`shrink-0 snap-start rounded-full px-4 py-2 text-sm font-semibold ${
              name === s.name ? "bg-primary text-primary-foreground" : "bg-[#2C2C2E] text-gray-200"
            }`}
          >
            {s.name}
          </button>
        ))}
      </div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded-2xl bg-[#2C2C2E] px-4 py-3 outline-none placeholder:text-gray-500"
        placeholder="Nome do serviço"
      />
      <div className="mt-2 flex items-center rounded-2xl bg-[#2C2C2E] px-4 py-3">
        <span className="mr-2 text-gray-400">R$</span>
        <input
          type="number"
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="w-full bg-transparent tabular-nums outline-none"
          placeholder="0,00"
        />
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="Observação"
        className="mt-2 w-full resize-none rounded-2xl bg-[#2C2C2E] px-4 py-3 text-sm outline-none placeholder:text-gray-500"
      />
      <motion.button
        whileTap={{ scale: 0.96 }}
        onClick={() => {
          const p = parseFloat(price.replace(",", "."));
          if (!name.trim() || isNaN(p) || p <= 0) return;
          onSave({ service_name: name.trim(), price: p, note: note.trim() || undefined });
        }}
        className="mt-5 w-full rounded-2xl bg-primary py-4 font-bold text-primary-foreground"
      >
        Salvar alterações
      </motion.button>
    </BottomSheet>
  );
}
