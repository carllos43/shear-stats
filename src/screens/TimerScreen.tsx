import { AnimatePresence, motion } from "framer-motion";
import { Pause, Play, Plus, Square, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { BottomSheet } from "@/components/BottomSheet";
import { useAppStore } from "@/store/app-store";
import { AppointmentForm, type NewAppointment } from "@/components/AppointmentForm";
import { formatBRL, formatTime, haptic } from "@/lib/haptics";

function useTick(running: boolean) {
  const [, setT] = useState(0);
  useEffect(() => {
    if (!running) return;
    const i = window.setInterval(() => setT((x) => x + 1), 1000);
    return () => window.clearInterval(i);
  }, [running]);
}

export function TimerScreen() {
  const timer = useAppStore((s) => s.timer);
  const startTimer = useAppStore((s) => s.startTimer);
  const pauseTimer = useAppStore((s) => s.pauseTimer);
  const resetTimer = useAppStore((s) => s.resetTimer);
  const getElapsed = useAppStore((s) => s.getElapsedSeconds);
  const services = useAppStore((s) => s.services);
  const addAppointment = useAppStore((s) => s.addAppointment);
  const addService = useAppStore((s) => s.addService);
  const removeService = useAppStore((s) => s.removeService);
  const setActiveTab = useAppStore((s) => s.setActiveTab);

  useTick(timer.isRunning);
  const elapsed = getElapsed();
  const hasActivity = timer.isRunning || elapsed > 0;

  const color =
    elapsed < 15 * 60
      ? "var(--success)"
      : elapsed < 30 * 60
        ? "var(--primary)"
        : "var(--destructive)";

  const [finishOpen, setFinishOpen] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);
  // service form (manage)
  const [newSvcName, setNewSvcName] = useState("");
  const [newSvcPrice, setNewSvcPrice] = useState("");
  const [newSvcDuration, setNewSvcDuration] = useState("");

  const handleStart = () => {
    haptic(15);
    startTimer();
  };
  const handlePause = () => {
    haptic(10);
    pauseTimer();
  };
  const handleStop = () => {
    haptic(10);
    if (timer.isRunning) pauseTimer();
    setFinishOpen(true);
  };

  const handleSave = (a: NewAppointment) => {
    addAppointment(a);
    resetTimer();
    setFinishOpen(false);
    setActiveTab("home");
  };

  return (
    <div>
      <Header title="Cronômetro" subtitle="Modo foco" onGear={() => setServicesOpen(true)} />
      <div className="flex min-h-[calc(100dvh-200px)] flex-col items-center justify-center px-6 pt-4 pb-32">
        <motion.div
          key={Math.floor(elapsed / 60)}
          initial={{ scale: 0.98, opacity: 0.6 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 24 }}
          className="text-7xl font-bold tabular-nums tracking-tight"
          style={{ color }}
        >
          {formatTime(elapsed)}
        </motion.div>
        <p className="mt-3 text-sm font-medium tracking-tight text-muted-foreground">
          {timer.isRunning ? "Atendimento em andamento" : hasActivity ? "Pausado" : "Pronto para começar"}
        </p>

        <div className="mt-12 flex items-center gap-6">
          {hasActivity && !timer.isRunning && (
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={handleStop}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/15 text-destructive"
              aria-label="Finalizar"
            >
              <Square size={26} fill="currentColor" />
            </motion.button>
          )}
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={timer.isRunning ? handlePause : handleStart}
            className="flex h-20 w-20 items-center justify-center rounded-full text-primary-foreground shadow-sm"
            style={{ backgroundColor: color }}
            aria-label={timer.isRunning ? "Pausar" : "Iniciar"}
          >
            {timer.isRunning ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" className="ml-1" />}
          </motion.button>
          {timer.isRunning && (
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={handleStop}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/15 text-destructive"
              aria-label="Finalizar"
            >
              <Square size={26} fill="currentColor" />
            </motion.button>
          )}
        </div>
      </div>

      {/* Finalização */}
      <BottomSheet open={finishOpen} onClose={() => setFinishOpen(false)} title="Finalizar atendimento">
        <AppointmentForm
          open={finishOpen}
          when={{ kind: "timer", elapsedSeconds: elapsed, startedAt: timer.startedAt ?? null }}
          onSubmit={(a) => handleSave(a)}
          footer={
        <div className="mt-2 flex gap-2">
          <button
            onClick={() => {
              haptic(8);
              startTimer();
              setFinishOpen(false);
            }}
            className="min-h-11 flex-1 rounded-2xl bg-foreground/5 py-3 text-sm font-semibold text-foreground/80"
          >
            Continuar atendimento
          </button>
          <button
            onClick={() => {
              if (!window.confirm("Descartar este atendimento? O tempo marcado será perdido.")) return;
              resetTimer();
              setFinishOpen(false);
            }}
            className="min-h-11 flex-1 rounded-2xl py-3 text-sm font-semibold text-muted-foreground"
          >
            Descartar
          </button>
        </div>
          }
        />
      </BottomSheet>

      {/* Gerenciar serviços */}
      <BottomSheet open={servicesOpen} onClose={() => setServicesOpen(false)} title="Serviços">
        <ul className="space-y-2">
          {services.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between rounded-2xl bg-card-elevated px-4 py-3"
            >
              <div>
                <p className="font-semibold tracking-tight">{s.name}</p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {formatBRL(s.price)}
                  <span className="mx-1.5 text-muted-foreground/70">·</span>
                  {s.duration_minutes ?? 30} min
                </p>
              </div>
              <button
                onClick={() => {
                  if (!window.confirm(`Excluir o serviço "${s.name}"? Os atendimentos já lançados não serão apagados.`)) return;
                  removeService(s.id);
                  haptic(8);
                }}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-destructive/15 text-destructive"
                aria-label="Remover"
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
            placeholder="Novo serviço"
            className="w-full rounded-2xl bg-card-elevated px-4 py-3 outline-none placeholder:text-muted-foreground"
          />
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center rounded-2xl bg-card-elevated px-4 py-3">
              <span className="mr-2 text-muted-foreground">R$</span>
              <input
                type="number"
                inputMode="decimal"
                value={newSvcPrice}
                onChange={(e) => setNewSvcPrice(e.target.value)}
                placeholder="0,00"
                className="w-full bg-transparent tabular-nums outline-none placeholder:text-muted-foreground"
              />
            </div>
            <div className="flex items-center rounded-2xl bg-card-elevated px-4 py-3">
              <input
                type="number"
                inputMode="numeric"
                value={newSvcDuration}
                onChange={(e) => setNewSvcDuration(e.target.value)}
                placeholder="30"
                className="w-full bg-transparent tabular-nums outline-none placeholder:text-muted-foreground"
              />
              <span className="ml-2 text-muted-foreground">min</span>
            </div>
          </div>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => {
              const p = parseFloat(newSvcPrice.replace(",", "."));
              if (!newSvcName.trim() || isNaN(p) || p <= 0) return;
              const d = parseInt(newSvcDuration, 10);
              addService({
                name: newSvcName.trim(),
                price: p,
                duration_minutes: Number.isFinite(d) && d > 0 ? d : 30,
              });
              setNewSvcName("");
              setNewSvcPrice("");
              setNewSvcDuration("");
              haptic(10);
            }}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 font-bold text-primary-foreground"
          >
            <Plus size={18} /> Adicionar serviço
          </motion.button>
        </div>
      </BottomSheet>
    </div>
  );
}
