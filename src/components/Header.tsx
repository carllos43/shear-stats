import { motion } from "framer-motion";
import { Settings2 } from "lucide-react";
import { haptic } from "@/lib/haptics";

interface HeaderProps {
  title: string;
  subtitle?: string;
  onGear?: () => void;
}

export function Header({ title, subtitle, onGear }: HeaderProps) {
  return (
    <header className="ios-material sticky top-0 z-20 border-b border-separator pt-safe">
      <div className="flex items-end justify-between px-5 pt-2 pb-3">
        <div>
          {subtitle && (
            <p className="text-xs font-medium text-muted-foreground tracking-tight">{subtitle}</p>
          )}
          <h1 className="text-[28px] leading-tight font-bold tracking-tight">{title}</h1>
        </div>
        {onGear && (
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => {
              haptic(8);
              onGear();
            }}
            className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors active:bg-foreground/10"
            aria-label="Configurações"
          >
            <Settings2 size={20} className="text-foreground/80" />
          </motion.button>
        )}
      </div>
    </header>
  );
}
