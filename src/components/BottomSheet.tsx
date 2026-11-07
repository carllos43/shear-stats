import { AnimatePresence, motion, useDragControls } from "framer-motion";
import { useEffect, useId, useRef, type ReactNode } from "react";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  const dragControls = useDragControls();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    const prev = document.activeElement as HTMLElement | null;
    requestAnimationFrame(() => panelRef.current?.focus());
    return () => {
      prev?.focus?.();
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            tabIndex={-1}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 400, damping: 38 }}
            drag="y"
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 600) onClose();
            }}
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col rounded-t-[28px] bg-card shadow-[0_-8px_30px_-12px_rgb(0_0_0/0.35)] outline-none"
          >
            <div
              onPointerDown={(e) => dragControls.start(e)}
              style={{ touchAction: "none" }}
              className="flex shrink-0 cursor-grab flex-col items-center rounded-t-3xl bg-card pt-2 active:cursor-grabbing"
            >
              <div aria-hidden className="mx-auto h-[5px] w-9 rounded-full bg-muted-foreground/40" />
              {title && (
                <h2 id={titleId} className="mt-3 mb-2 text-lg font-bold tracking-tight">{title}</h2>
              )}
            </div>
            <div
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-2 pb-10"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              {children}
              <div className="h-[env(safe-area-inset-bottom)]" />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
