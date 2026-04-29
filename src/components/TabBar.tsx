import { memo } from "react";
import {
  House,
  Timer,
  CalendarDays,
  ChartBar,
  FileText,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { useAppStore, type TabKey } from "@/store/app-store";
import { haptic } from "@/lib/haptics";

const tabs: { key: TabKey; label: string; icon: LucideIcon }[] = [
  { key: "home", label: "Início", icon: House },
  { key: "timer", label: "Cronômetro", icon: Timer },
  { key: "history", label: "Atendimentos", icon: CalendarDays },
  { key: "analytics", label: "Análise", icon: ChartBar },
  { key: "reports", label: "Relatórios", icon: FileText },
  { key: "settings", label: "Ajustes", icon: Settings },
];

const TabButton = memo(function TabButton({
  tabKey,
  label,
  Icon,
  isActive,
  onSelect,
}: {
  tabKey: TabKey;
  label: string;
  Icon: LucideIcon;
  isActive: boolean;
  onSelect: (k: TabKey) => void;
}) {
  return (
    <li className="flex-1">
      <button
        type="button"
        onPointerDown={() => {
          // feedback imediato — não espera o click
          haptic(8);
          onSelect(tabKey);
        }}
        className="flex w-full flex-col items-center gap-0.5 px-1 py-1.5 transition-transform active:scale-95"
      >
        <Icon
          size={22}
          strokeWidth={isActive ? 2.4 : 1.8}
          className={isActive ? "text-primary" : "text-gray-500"}
        />
        <span
          className={`text-[10px] font-medium tracking-tight ${
            isActive ? "text-primary" : "text-gray-500"
          }`}
        >
          {label}
        </span>
      </button>
    </li>
  );
});

export function TabBar() {
  const active = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-black/60 backdrop-blur-xl pb-safe">
      <ul className="flex items-stretch justify-around px-1 pt-1.5">
        {tabs.map(({ key, label, icon }) => (
          <TabButton
            key={key}
            tabKey={key}
            label={label}
            Icon={icon}
            isActive={active === key}
            onSelect={setActiveTab}
          />
        ))}
      </ul>
    </nav>
  );
}
