import { motion } from "framer-motion";
import { haptic } from "@/lib/haptics";
import { PAYMENT_LABELS, type PaymentMethod } from "@/store/app-store";

interface Props {
  value: PaymentMethod | null;
  onChange: (m: PaymentMethod) => void;
  error?: boolean;
}

/** Seleção de forma de pagamento (PIX / DINHEIRO) no padrão visual do app. */
export function PaymentPicker({ value, onChange, error }: Props) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
        Forma de pagamento
      </p>
      <div className="grid grid-cols-2 gap-2">
        {(["pix", "cash"] as const).map((m) => {
          const sel = value === m;
          return (
            <motion.button
              key={m}
              type="button"
              whileTap={{ scale: 0.96 }}
              onClick={() => {
                haptic(8);
                onChange(m);
              }}
              className={`rounded-2xl py-3 text-sm font-bold tracking-tight transition-colors ${
                sel
                  ? "bg-primary text-primary-foreground"
                  : "bg-[#2C2C2E] text-gray-200"
              }`}
              aria-pressed={sel}
            >
              {PAYMENT_LABELS[m]}
            </motion.button>
          );
        })}
      </div>
      {error && (
        <p className="mt-2 text-xs font-semibold text-destructive">
          Selecione a forma de pagamento.
        </p>
      )}
    </div>
  );
}

/** Badge discreto para listas/histórico. */
export function PaymentBadge({ method }: { method: PaymentMethod | null }) {
  if (!method) return null;
  return (
    <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
      {PAYMENT_LABELS[method]}
    </span>
  );
}
