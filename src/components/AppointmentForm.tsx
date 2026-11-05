import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState, type ReactNode } from "react";
import { PaymentPicker } from "@/components/PaymentPicker";
import { useAppStore, type PaymentMethod } from "@/store/app-store";
import { formatBRL, formatTime, haptic } from "@/lib/haptics";

export type NewAppointment = Parameters<ReturnType<typeof useAppStore.getState>["addAppointment"]>[0];

/**
 * Como o horário do atendimento é definido:
 * - quick: Agora / Hoje / Ontem / Escolher (Ação rápida)
 * - day: dia fixo, escolhe só o horário (Lançar neste dia)
 * - timer: início e duração vêm do cronômetro
 */
export type FormWhen =
  | { kind: "quick" }
  | { kind: "day"; day: Date }
  | { kind: "timer"; elapsedSeconds: number; startedAt: string | null };

type WhenMode = "now" | "today" | "yesterday" | "custom";
const LS_LAST_DATE = "barbermetrics:last_manual_date";

const pad2 = (n: number) => String(n).padStart(2, "0");
const toDateInput = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const toTimeInput = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

function combine(dateStr: string, timeStr: string): Date {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const [h, mi] = timeStr.split(":").map(Number);
  const now = new Date();
  return new Date(
    Number.isFinite(y) ? y : now.getFullYear(),
    Number.isFinite(mo) ? mo - 1 : now.getMonth(),
    Number.isFinite(d) ? d : now.getDate(),
    Number.isFinite(h) ? h : 12,
    Number.isFinite(mi) ? mi : 0,
  );
}

const chip = (sel: boolean) =>
  `shrink-0 snap-start rounded-full px-4 py-2 text-sm font-semibold tracking-tight transition-colors ${
    sel ? "bg-primary text-primary-foreground" : "bg-card-elevated text-foreground/80"
  }`;

const label = "mb-2 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground";

/** Formulário único de lançamento de atendimento (Ação rápida, Cronômetro e Lançar neste dia). */
export function AppointmentForm({
  open,
  when,
  onSubmit,
  allowSaveAnother = false,
  footer,
}: {
  open: boolean;
  when: FormWhen;
  onSubmit: (a: NewAppointment, opts: { again: boolean }) => void;
  allowSaveAnother?: boolean;
  footer?: ReactNode;
}) {
  const services = useAppStore((s) => s.services).filter((s) => s.is_active);

  const [serviceId, setServiceId] = useState<string | null>(null);
  const [custom, setCustom] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const [customDuration, setCustomDuration] = useState("");
  const [payment, setPayment] = useState<PaymentMethod | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [whenMode, setWhenMode] = useState<WhenMode>("now");
  const [date, setDate] = useState(toDateInput(new Date()));
  const [time, setTime] = useState(toTimeInput(new Date()));

  const dayKey = when.kind === "day" ? when.day.getTime() : 0;

  const reset = () => {
    const n = new Date();
    setServiceId(null);
    setCustom(false);
    setCustomName("");
    setCustomPrice("");
    setCustomDuration("");
    setPayment(null);
    setNote("");
    setError(null);
    setWhenMode("now");
    if (when.kind === "quick") {
      const last = typeof window !== "undefined" ? localStorage.getItem(LS_LAST_DATE) : null;
      setDate(last && /^\d{4}-\d{2}-\d{2}$/.test(last) ? last : toDateInput(n));
      setTime(toTimeInput(n));
    } else if (when.kind === "day") {
      setDate(toDateInput(when.day));
      setTime(sameDay(when.day, n) ? toTimeInput(n) : "12:00");
    }
  };

  useEffect(() => {
    if (open) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dayKey]);

  const build = (): NewAppointment | null => {
    let name = "";
    let price = 0;
    let mins = 30;
    let sid: string | null = null;
    if (serviceId) {
      const s = services.find((x) => x.id === serviceId);
      if (!s) return fail("Escolha um serviço.");
      sid = s.id;
      name = s.name;
      price = s.price;
      mins = s.duration_minutes ?? 30;
    } else if (custom) {
      const p = parseFloat(customPrice.replace(",", "."));
      if (!customName.trim()) return fail("Informe o serviço.");
      if (!Number.isFinite(p) || p <= 0) return fail("Informe um valor válido.");
      name = customName.trim();
      price = p;
      const d = parseInt(customDuration, 10);
      mins = Number.isFinite(d) && d > 0 ? d : 30;
    } else {
      return fail("Escolha um serviço.");
    }
    if (payment !== "pix" && payment !== "cash") return fail("Selecione a forma de pagamento.");

    let start: Date;
    let end: Date;
    let durationSeconds: number;
    let defaultNote: string | undefined;
    if (when.kind === "timer") {
      durationSeconds = when.elapsedSeconds;
      start = when.startedAt ? new Date(when.startedAt) : new Date(Date.now() - durationSeconds * 1000);
      end = new Date();
    } else {
      if (when.kind === "quick") {
        if (whenMode === "now") start = new Date();
        else {
          let base = date;
          if (whenMode === "today") base = toDateInput(new Date());
          if (whenMode === "yesterday") {
            const y = new Date();
            y.setDate(y.getDate() - 1);
            base = toDateInput(y);
          }
          start = combine(base, time);
        }
        defaultNote = whenMode === "now" ? "Ação rápida" : "Lançamento manual";
      } else {
        start = combine(toDateInput(when.day), time);
      }
      durationSeconds = mins * 60;
      end = new Date(start.getTime() + durationSeconds * 1000);
    }

    if (when.kind === "quick" && whenMode !== "now") {
      try {
        localStorage.setItem(LS_LAST_DATE, toDateInput(start));
      } catch {
        /* ignore */
      }
    }

    return {
      service_id: sid,
      service_name: name,
      price,
      started_at: start.toISOString(),
      ended_at: end.toISOString(),
      duration_seconds: durationSeconds,
      note: note.trim() || defaultNote,
      payment_method: payment,
    };
  };

  function fail(msg: string): null {
    setError(msg);
    return null;
  }

  const submit = (again: boolean) => {
    const a = build();
    if (!a) return;
    haptic(20);
    onSubmit(a, { again });
    if (again) reset();
  };

  const payErr = error === "Selecione a forma de pagamento.";

  return (
    <div>
      {when.kind === "day" && (
        <p className="mb-3 text-xs font-semibold capitalize text-muted-foreground">
          {when.day.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
        </p>
      )}

      {when.kind === "quick" && (
        <>
          <span className={label}>Quando</span>
          <div className="-mx-5 mb-3 flex snap-x snap-mandatory gap-2 overflow-x-auto px-5 scrollbar-hide">
            {(
              [
                { k: "now", l: "Agora" },
                { k: "today", l: "Hoje" },
                { k: "yesterday", l: "Ontem" },
                { k: "custom", l: "Escolher" },
              ] as const
            ).map((o) => (
              <button
                key={o.k}
                type="button"
                aria-pressed={whenMode === o.k}
                onClick={() => {
                  haptic(6);
                  setWhenMode(o.k);
                }}
                className={chip(whenMode === o.k)}
              >
                {o.l}
              </button>
            ))}
          </div>
        </>
      )}

      {((when.kind === "quick" && whenMode !== "now") || when.kind === "day") && (
        <div className="mb-3 grid grid-cols-2 gap-2">
          {when.kind === "quick" && whenMode === "custom" && (
            <label className="col-span-2 rounded-2xl bg-card-elevated px-4 py-3">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Data</span>
              <input
                type="date"
                value={date}
                max={toDateInput(new Date())}
                onChange={(e) => setDate(e.target.value || toDateInput(new Date()))}
                className="mt-1 w-full bg-transparent text-base font-semibold tabular-nums outline-none"
              />
            </label>
          )}
          <label className="col-span-2 rounded-2xl bg-card-elevated px-4 py-3">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Horário</span>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="mt-1 w-full bg-transparent text-base font-semibold tabular-nums outline-none"
            />
          </label>
        </div>
      )}

      <span className={label}>Serviço</span>
      <ul className="space-y-2">
        {services.map((s) => {
          const sel = serviceId === s.id;
          return (
            <li key={s.id}>
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                aria-pressed={sel}
                onClick={() => {
                  haptic(8);
                  setServiceId(s.id);
                  setCustom(false);
                  setError(null);
                }}
                className={`flex min-h-12 w-full items-center justify-between rounded-2xl px-4 py-3 text-left transition-colors ${
                  sel ? "bg-primary/20 ring-1 ring-primary" : "bg-card-elevated active:bg-primary/15"
                }`}
              >
                <span>
                  <span className="block font-semibold tracking-tight">{s.name}</span>
                  {when.kind !== "timer" && (
                    <span className="block text-[11px] text-muted-foreground tabular-nums">
                      {s.duration_minutes ?? 30} min
                    </span>
                  )}
                </span>
                <span className="font-bold text-primary tabular-nums">{formatBRL(s.price)}</span>
              </motion.button>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={() => {
          setCustom((v) => !v);
          setServiceId(null);
          setError(null);
        }}
        className="mt-3 min-h-11 w-full rounded-2xl border border-foreground/10 py-3 text-sm font-semibold text-foreground/80"
      >
        {custom ? "Cancelar valor avulso" : "+ Valor avulso"}
      </button>

      <AnimatePresence initial={false}>
        {custom && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 space-y-2 overflow-hidden"
          >
            <input
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="Nome do serviço"
              aria-label="Nome do serviço"
              className="w-full rounded-2xl bg-card-elevated px-4 py-3 text-base outline-none placeholder:text-muted-foreground"
            />
            <div className={`grid gap-2 ${when.kind === "timer" ? "grid-cols-1" : "grid-cols-2"}`}>
              <div className="flex items-center rounded-2xl bg-card-elevated px-4 py-3">
                <span className="mr-2 text-muted-foreground">R$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={customPrice}
                  onChange={(e) => setCustomPrice(e.target.value)}
                  placeholder="0,00"
                  aria-label="Valor"
                  className="w-full bg-transparent text-base tabular-nums outline-none placeholder:text-muted-foreground"
                />
              </div>
              {when.kind !== "timer" && (
                <div className="flex items-center rounded-2xl bg-card-elevated px-4 py-3">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={customDuration}
                    onChange={(e) => setCustomDuration(e.target.value)}
                    placeholder="30"
                    aria-label="Duração em minutos"
                    className="w-full bg-transparent text-base tabular-nums outline-none placeholder:text-muted-foreground"
                  />
                  <span className="ml-2 text-muted-foreground">min</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-4">
        <PaymentPicker
          value={payment}
          onChange={(m) => {
            setPayment(m);
            setError(null);
          }}
          error={payErr}
        />
      </div>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Observação (opcional)"
        aria-label="Observação"
        rows={2}
        className="mt-3 w-full resize-none rounded-2xl bg-card-elevated px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
      />

      {when.kind === "timer" && (
        <div className="mt-3 flex items-center justify-between rounded-2xl bg-foreground/5 px-4 py-3 text-sm">
          <span className="text-muted-foreground">Duração</span>
          <span className="font-semibold tabular-nums">{formatTime(when.elapsedSeconds)}</span>
        </div>
      )}

      {error && !payErr && (
        <p role="alert" className="mt-3 text-xs font-semibold text-destructive">
          {error}
        </p>
      )}

      <motion.button
        type="button"
        whileTap={{ scale: 0.96 }}
        onClick={() => submit(false)}
        className="mt-5 w-full rounded-2xl bg-primary py-4 text-base font-bold tracking-tight text-primary-foreground"
      >
        Salvar atendimento
      </motion.button>
      {allowSaveAnother && (
        <button
          type="button"
          onClick={() => submit(true)}
          className="mt-2 min-h-11 w-full rounded-2xl bg-card-elevated py-3 text-sm font-semibold text-foreground/80"
        >
          Salvar e lançar outro
        </button>
      )}
      {footer}
    </div>
  );
}
