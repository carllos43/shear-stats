import { AnimatePresence, motion } from "framer-motion";
import { Pause, Play, Plus, Square, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { BottomSheet } from "@/components/BottomSheet";
import { useAppStore, type PaymentMethod } from "@/store/app-store";
import { PaymentPicker } from "@/components/PaymentPicker";
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
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [customName, setCustomName] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const [note, setNote] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [payment, setPayment] = useState<PaymentMethod | null>(null);
  const [payError, setPayError] = useState(false);

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
    setSelectedServiceId(null);
    setShowCustom(false);
    setCustomName("");
    setCustomPrice("");
    setNote("");
    setPayment(null);
    setPayError(false);
    setFinishOpen(true);
  };

  const handleSave = () => {
    if (payment !== "pix" && payment !== "cash") {
      setPayError(true);
      return;
    }
    let serviceName = "";
    let price = 0;
    let serviceId: string | null = null;
    if (selectedServiceId) {
      const svc = services.find((s) => s.id === selectedServiceId);
      if (!svc) return;
      serviceId = svc.id;
      serviceName = svc.name;
      price = svc.price;
    } else if (showCustom) {
      const p = parseFloat(customPrice.replace(",", "."));
      if (!customName.trim() || isNaN(p) || p <= 0) return;
      serviceName = customName.trim();
      price = p;
    } else {
      return;
    }

    const startedAt = timer.startedAt ?? new Date(Date.now() - elapsed * 1000).toISOString();
    const endedAt = new Date().toISOString();
    addAppointment({
      service_id: serviceId,
      service_name: serviceName,
      price,
      started_at: startedAt,
      ended_at: endedAt,
      duration_seconds: elapsed,
      note: note.trim() || undefined,
      payment_method: payment,
    });
    haptic(20);
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
        <p className="mt-3 text-sm font-medium tracking-tight text-gray-500">
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
            className="flex h-20 w-20 items-center justify-center rounded-full text-primary-foreground shadow-lg shadow-black/40"
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
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Serviço</p>
        <div className="-mx-5 mb-3 flex snap-x snap-mandatory gap-2 overflow-x-auto px-5 scrollbar-hide">
          {services.map((s) => {
            const sel = selectedServiceId === s.id;
            return (
              <motion.button
                whileTap={{ scale: 0.95 }}
                key={s.id}
                onClick={() => {
                  setSelectedServiceId(s.id);
                  setShowCustom(false);
                  haptic(8);
                }}
                className={`shrink-0 snap-start rounded-full px-4 py-2 text-sm font-semibold tracking-tight transition-colors ${
                  sel ? "bg-primary text-primary-foreground" : "bg-[#2C2C2E] text-gray-200"
                }`}
              >
                {s.name} · <span className="tabular-nums">{formatBRL(s.price)}</span>
              </motion.button>
            );
          })}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              setShowCustom((v) => !v);
              setSelectedServiceId(null);
            }}
            className={`shrink-0 snap-start rounded-full px-4 py-2 text-sm font-semibold tracking-tight ${
              showCustom ? "bg-primary text-primary-foreground" : "bg-[#2C2C2E] text-gray-200"
            }`}
          >
            + Avulso
          </motion.button>
        </div>

        <AnimatePresence initial={false}>
          {showCustom && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-2 overflow-hidden"
            >
              <input
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Nome do serviço"
                className="w-full rounded-2xl bg-[#2C2C2E] px-4 py-3 text-base outline-none placeholder:text-gray-500"
              />
              <div className="flex items-center rounded-2xl bg-[#2C2C2E] px-4 py-3">
                <span className="mr-2 text-gray-400">R$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={customPrice}
                  onChange={(e) => setCustomPrice(e.target.value)}
                  placeholder="0,00"
                  className="w-full bg-transparent text-base tabular-nums outline-none placeholder:text-gray-500"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-4">
          <PaymentPicker
            value={payment}
            onChange={(m) => {
              setPayment(m);
              setPayError(false);
            }}
            error={payError}
          />
        </div>

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Observação (opcional)"
          rows={2}
          className="mt-3 w-full resize-none rounded-2xl bg-[#2C2C2E] px-4 py-3 text-sm outline-none placeholder:text-gray-500"
        />

        <div className="mt-3 flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3 text-sm">
          <span className="text-gray-400">Duração</span>
          <span className="font-semibold tabular-nums">{formatTime(elapsed)}</span>
        </div>

        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={handleSave}
          className="mt-5 w-full rounded-2xl bg-primary py-4 text-base font-bold tracking-tight text-primary-foreground disabled:opacity-40"
          disabled={(!selectedServiceId && !showCustom) || !payment}
        >
          Salvar atendimento
        </motion.button>
        <button
          onClick={() => {
            resetTimer();
            setFinishOpen(false);
          }}
          className="mt-2 w-full rounded-2xl py-3 text-sm font-semibold text-gray-400"
        >
          Descartar
        </button>
      </BottomSheet>

      {/* Gerenciar serviços */}
      <BottomSheet open={servicesOpen} onClose={() => setServicesOpen(false)} title="Serviços">
        <ul className="space-y-2">
          {services.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between rounded-2xl bg-[#2C2C2E] px-4 py-3"
            >
              <div>
                <p className="font-semibold tracking-tight">{s.name}</p>
                <p className="text-xs text-gray-400 tabular-nums">
                  {formatBRL(s.price)}
                  <span className="mx-1.5 text-gray-600">·</span>
                  {s.duration_minutes ?? 30} min
                </p>
              </div>
              <button
                onClick={() => {
                  removeService(s.id);
                  haptic(8);
                }}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-destructive/15 text-destructive"
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
            className="w-full rounded-2xl bg-[#2C2C2E] px-4 py-3 outline-none placeholder:text-gray-500"
          />
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center rounded-2xl bg-[#2C2C2E] px-4 py-3">
              <span className="mr-2 text-gray-400">R$</span>
              <input
                type="number"
                inputMode="decimal"
                value={newSvcPrice}
                onChange={(e) => setNewSvcPrice(e.target.value)}
                placeholder="0,00"
                className="w-full bg-transparent tabular-nums outline-none placeholder:text-gray-500"
              />
            </div>
            <div className="flex items-center rounded-2xl bg-[#2C2C2E] px-4 py-3">
              <input
                type="number"
                inputMode="numeric"
                value={newSvcDuration}
                onChange={(e) => setNewSvcDuration(e.target.value)}
                placeholder="30"
                className="w-full bg-transparent tabular-nums outline-none placeholder:text-gray-500"
              />
              <span className="ml-2 text-gray-400">min</span>
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
