import { useEffect, useState } from "react";
import { Pause, Play, Plus, Square, Trash2 } from "lucide-react";
import { Header } from "@/components/Header";
import { BottomSheet } from "@/components/BottomSheet";
import { useAppStore } from "@/store/app-store";
import { AppointmentForm, type NewAppointment } from "@/components/AppointmentForm";
import { formatBRL, formatTime, haptic } from "@/lib/haptics";

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

  // Live tick: força re-render a cada segundo enquanto rodando
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!timer.isRunning) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 250);
    return () => window.clearInterval(id);
  }, [timer.isRunning]);

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
  const [newSvcName, setNewSvcName] = useState("");
  const [newSvcPrice, setNewSvcPrice] = useState("");
  const [newSvcDuration, setNewSvcDuration] = useState("");

  const handleStart = () => {
    haptic(12);
    startTimer();
  };
  const handlePause = () => {
    haptic(8);
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

  const statusText = timer.isRunning
    ? "Em andamento"
    : hasActivity
      ? "Pausado"
      : "Pronto";

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <Header title="Cronômetro" subtitle="Modo foco" onGear={() => setServicesOpen(true)} />

      <div className="flex flex-1 flex-col items-center justify-center px-6 pb-28">
        {/* Display principal — sem key que remonta, atualiza a cada tick */}
        <div
          className="select-none text-center font-semibold tabular-nums tracking-tight"
          style={{ fontSize: "clamp(4.5rem, 18vw, 6.5rem)", color, lineHeight: 1 }}
        >
          {formatTime(elapsed)}
        </div>

        <p className="mt-4 text-[15px] font-medium text-muted-foreground">{statusText}</p>

        {/* Controles */}
        <div className="mt-14 flex items-center justify-center gap-8">
          {hasActivity && !timer.isRunning && (
            <button
              onClick={handleStop}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive active:scale-95"
              aria-label="Finalizar"
            >
              <Square size={26} fill="currentColor" />
            </button>
          )}

          <button
            onClick={timer.isRunning ? handlePause : handleStart}
            className="flex h-[84px] w-[84px] items-center justify-center rounded-full text-white shadow-md active:scale-95"
            style={{ backgroundColor: color }}
            aria-label={timer.isRunning ? "Pausar" : "Iniciar"}
          >
            {timer.isRunning ? (
              <Pause size={34} fill="currentColor" />
            ) : (
              <Play size={34} fill="currentColor" className="ml-1" />
            )}
          </button>

          {timer.isRunning && (
            <button
              onClick={handleStop}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive active:scale-95"
              aria-label="Finalizar"
            >
              <Square size={26} fill="currentColor" />
            </button>
          )}
        </div>

        {hasActivity && (
          <p className="mt-10 text-[13px] text-muted-foreground">
            Toque em finalizar para registrar o atendimento
          </p>
        )}
      </div>

      {/* Finalização */}
      <BottomSheet open={finishOpen} onClose={() => setFinishOpen(false)} title="Finalizar atendimento">
        <AppointmentForm
          open={finishOpen}
          when={{ kind: "timer", elapsedSeconds: elapsed, startedAt: timer.startedAt ?? null }}
          onSubmit={(a) => handleSave(a)}
          footer={
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => {
                  haptic(8);
                  startTimer();
                  setFinishOpen(false);
                }}
                className="flex-1 rounded-2xl bg-secondary py-3.5 text-[15px] font-semibold text-foreground active:opacity-80"
              >
                Continuar
              </button>
              <button
                onClick={() => {
                  if (!window.confirm("Descartar este atendimento? O tempo será perdido.")) return;
                  resetTimer();
                  setFinishOpen(false);
                }}
                className="flex-1 rounded-2xl py-3.5 text-[15px] font-semibold text-muted-foreground active:opacity-80"
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
              className="flex items-center justify-between rounded-2xl bg-secondary/60 px-4 py-3.5"
            >
              <div>
                <p className="font-medium">{s.name}</p>
                <p className="mt-0.5 text-[13px] text-muted-foreground tabular-nums">
                  {formatBRL(s.price)} · {s.duration_minutes ?? 30} min
                </p>
              </div>
              <button
                onClick={() => {
                  if (!window.confirm(`Excluir "${s.name}"?`)) return;
                  removeService(s.id);
                  haptic(8);
                }}
                className="flex h-10 w-10 items-center justify-center rounded-full text-destructive active:bg-destructive/10"
                aria-label="Remover"
              >
                <Trash2 size={18} />
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-6 space-y-2.5">
          <input
            value={newSvcName}
            onChange={(e) => setNewSvcName(e.target.value)}
            placeholder="Nome do serviço"
            className="w-full rounded-2xl bg-secondary/60 px-4 py-3.5 text-[15px] outline-none placeholder:text-muted-foreground"
          />
          <div className="grid grid-cols-2 gap-2.5">
            <div className="flex items-center rounded-2xl bg-secondary/60 px-4 py-3.5">
              <span className="mr-1 text-muted-foreground">R$</span>
              <input
                type="number"
                inputMode="decimal"
                value={newSvcPrice}
                onChange={(e) => setNewSvcPrice(e.target.value)}
                placeholder="0"
                className="w-full bg-transparent tabular-nums outline-none placeholder:text-muted-foreground"
              />
            </div>
            <div className="flex items-center rounded-2xl bg-secondary/60 px-4 py-3.5">
              <input
                type="number"
                inputMode="numeric"
                value={newSvcDuration}
                onChange={(e) => setNewSvcDuration(e.target.value)}
                placeholder="30"
                className="w-full bg-transparent tabular-nums outline-none placeholder:text-muted-foreground"
              />
              <span className="ml-1 text-muted-foreground">min</span>
            </div>
          </div>
          <button
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
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 font-semibold text-primary-foreground active:opacity-90"
          >
            <Plus size={18} /> Adicionar serviço
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
