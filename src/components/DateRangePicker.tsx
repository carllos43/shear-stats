import { useState } from "react";
import { motion } from "framer-motion";
import { Calendar as CalendarIcon, Check } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import { BottomSheet } from "@/components/BottomSheet";
import { haptic } from "@/lib/haptics";

interface Props {
  open: boolean;
  initialRange?: { from: Date; to: Date } | null;
  onClose: () => void;
  onConfirm: (range: { from: Date; to: Date }) => void;
}

function fmt(d: Date) {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function DateRangePicker({ open, initialRange, onClose, onConfirm }: Props) {
  const [range, setRange] = useState<DateRange | undefined>(
    initialRange ? { from: initialRange.from, to: initialRange.to } : undefined,
  );

  const days =
    range?.from && range?.to
      ? Math.max(1, Math.round((range.to.getTime() - range.from.getTime()) / 86400000) + 1)
      : 0;

  const canConfirm = !!(range?.from && range?.to);

  return (
    <BottomSheet open={open} onClose={onClose} title="Selecionar período">
      <div className="flex items-center justify-between rounded-2xl bg-[#2C2C2E] px-4 py-3">
        <div className="flex items-center gap-2 text-sm">
          <CalendarIcon className="h-4 w-4 text-primary" />
          {range?.from && range?.to ? (
            <span className="font-medium tabular-nums">
              {fmt(range.from)} <span className="text-gray-500">→</span> {fmt(range.to)}
            </span>
          ) : range?.from ? (
            <span className="font-medium tabular-nums">
              {fmt(range.from)} <span className="text-gray-500">→ ...</span>
            </span>
          ) : (
            <span className="text-gray-400">Selecione data inicial e final</span>
          )}
        </div>
        {days > 0 && (
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold tracking-wider text-primary">
            {days} {days === 1 ? "dia" : "dias"}
          </span>
        )}
      </div>

      <div className="mt-4 flex justify-center rounded-2xl bg-[#2C2C2E] py-2">
        <Calendar
          mode="range"
          selected={range}
          onSelect={(r) => {
            haptic(6);
            setRange(r);
          }}
          numberOfMonths={1}
          captionLayout="dropdown"
          weekStartsOn={1}
          className="pointer-events-auto p-2 text-foreground"
        />
      </div>

      <motion.button
        whileTap={{ scale: 0.96 }}
        disabled={!canConfirm}
        onClick={() => {
          if (!canConfirm || !range?.from || !range?.to) return;
          haptic(12);
          onConfirm({ from: range.from, to: range.to });
        }}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 font-bold tracking-tight text-primary-foreground disabled:opacity-40"
      >
        <Check size={18} /> Aplicar período
      </motion.button>
    </BottomSheet>
  );
}
