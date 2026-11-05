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
    <header className="sticky top-0 z-20 border-b border-foreground/10 bg-background/60 backdrop-blur-xl pt-safe">
      <div className="flex items-end justify-between px-5 pt-2 pb-3">
        <div>
          {subtitle && (
            <p className="text-xs font-medium text-muted-foreground tracking-tight">{subtitle}</p>
          )}
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        </div>
        {onGear && (
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => {
              haptic(8);
              onGear();
            }}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground/5 active:bg-foreground/10"
            aria-label="Configurações"
          >
            <Settings2 size={20} className="text-foreground/80" />
          </motion.button>
        )}
      </div>
    </header>
  );
}
