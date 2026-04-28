import { motion } from "framer-motion";
import { Download, FileText } from "lucide-react";
import { useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { BottomSheet } from "@/components/BottomSheet";
import { useAppStore } from "@/store/app-store";
import { formatBRL, haptic } from "@/lib/haptics";
import { addDays, endOfDay, endOfMonth, formatHourMinute, startOfDay, startOfMonth } from "@/lib/dates";
import { generateReportPdf } from "@/lib/pdf";

type Range = "today" | "7d" | "month" | "prev-month";

function rangeFor(r: Range): { from: Date; to: Date; label: string } {
  const now = new Date();
  switch (r) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now), label: "Hoje" };
    case "7d":
      return { from: startOfDay(addDays(now, -6)), to: endOfDay(now), label: "Últimos 7 dias" };
    case "month":
      return { from: startOfMonth(now), to: endOfDay(now), label: "Este mês" };
    case "prev-month": {
      const last = new Date(now.getFullYear(), now.getMonth() - 1, 15);
      return { from: startOfMonth(last), to: endOfMonth(last), label: "Mês anterior" };
    }
  }
}

const ranges: { key: Range; label: string }[] = [
  { key: "today", label: "Hoje" },
  { key: "7d", label: "7 dias" },
  { key: "month", label: "Este mês" },
  { key: "prev-month", label: "Mês anterior" },
];

export function ReportsScreen() {
  const appointments = useAppStore((s) => s.appointments);
  const profile = useAppStore((s) => s.profile);
  const [range, setRange] = useState<Range>("7d");
  const [gearOpen, setGearOpen] = useState(false);
  const [shopName, setShopName] = useState(profile.barbershop_name);

  const { from, to, label } = useMemo(() => rangeFor(range), [range]);

  const items = useMemo(
    () =>
      appointments
        .filter((a) => {
          const t = new Date(a.started_at).getTime();
          return t >= from.getTime() && t <= to.getTime();
        })
        .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime()),
    [appointments, from, to],
  );
  const total = items.reduce((s, a) => s + a.price, 0);
  const totalBarber = items.reduce((s, a) => s + (a.barber_share ?? 0), 0);
  const totalOwner = items.reduce((s, a) => s + (a.owner_share ?? 0), 0);

  const handleExport = () => {
    haptic(15);
    generateReportPdf({
      barbershopName: shopName || profile.barbershop_name,
      from,
      to,
      rangeLabel: label,
      appointments: items,
      barberPercentage: profile.barber_percentage,
    });
  };

  return (
    <div>
      <Header title="Relatórios" subtitle="Exportação contábil" onGear={() => setGearOpen(true)} />

      <div className="-mx-1 mt-3 flex snap-x snap-mandatory gap-2 overflow-x-auto px-5 scrollbar-hide">
        {ranges.map((r) => {
          const sel = range === r.key;
          return (
            <motion.button
              whileTap={{ scale: 0.95 }}
              key={r.key}
              onClick={() => {
                setRange(r.key);
                haptic(8);
              }}
              className={`shrink-0 snap-start rounded-full px-4 py-2 text-sm font-semibold tracking-tight ${
                sel ? "bg-primary text-primary-foreground" : "bg-[#1C1C1E] text-gray-300"
              }`}
            >
              {r.label}
            </motion.button>
          );
        })}
      </div>

      <div className="px-5 pt-5 pb-32">
        <div className="rounded-3xl bg-[#1C1C1E] p-5">
          <div className="flex items-baseline justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                {label}
              </p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-primary">{formatBRL(total)}</p>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Atendimentos</p>
              <p className="mt-1 text-3xl font-bold tabular-nums">{items.length}</p>
            </div>
          </div>
        </div>

        <h2 className="mt-6 mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Pré-visualização
        </h2>
        {items.length === 0 ? (
          <div className="rounded-3xl bg-[#1C1C1E] p-8 text-center">
            <FileText size={28} className="mx-auto mb-2 text-gray-600" />
            <p className="text-sm text-gray-400">Sem atendimentos no período selecionado.</p>
          </div>
        ) : (
          <ul className="overflow-hidden rounded-3xl bg-[#1C1C1E]">
            {items.slice(0, 8).map((a, i) => (
              <li
                key={a.id}
                className={`flex items-center justify-between px-4 py-3 ${
                  i > 0 ? "border-t border-white/5" : ""
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold tracking-tight">{a.service_name}</p>
                  <p className="text-[11px] text-gray-500 tabular-nums">
                    {new Date(a.started_at).toLocaleDateString("pt-BR")} ·{" "}
                    {formatHourMinute(a.started_at)}
                  </p>
                </div>
                <span className="text-sm font-bold text-primary tabular-nums">{formatBRL(a.price)}</span>
              </li>
            ))}
            {items.length > 8 && (
              <li className="border-t border-white/5 px-4 py-3 text-center text-[11px] text-gray-500">
                + {items.length - 8} atendimentos no PDF
              </li>
            )}
          </ul>
        )}

        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={handleExport}
          disabled={items.length === 0}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-base font-bold tracking-tight text-primary-foreground disabled:opacity-40"
        >
          <Download size={18} /> Gerar PDF
        </motion.button>
      </div>

      <BottomSheet open={gearOpen} onClose={() => setGearOpen(false)} title="Cabeçalho do relatório">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Nome da barbearia
        </p>
        <input
          value={shopName}
          onChange={(e) => setShopName(e.target.value)}
          className="w-full rounded-2xl bg-[#2C2C2E] px-4 py-3 outline-none placeholder:text-gray-500"
          placeholder="Minha Barbearia"
        />
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={() => setGearOpen(false)}
          className="mt-5 w-full rounded-2xl bg-primary py-4 font-bold text-primary-foreground"
        >
          Confirmar
        </motion.button>
      </BottomSheet>
    </div>
  );
}
