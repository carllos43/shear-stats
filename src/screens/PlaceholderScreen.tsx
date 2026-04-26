import { Header } from "@/components/Header";
import type { LucideIcon } from "lucide-react";

interface Props {
  title: string;
  icon: LucideIcon;
  description: string;
}

export function PlaceholderScreen({ title, icon: Icon, description }: Props) {
  return (
    <div>
      <Header title={title} />
      <div className="flex min-h-[calc(100dvh-220px)] flex-col items-center justify-center px-8 pb-32 text-center">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-[#1C1C1E]">
          <Icon size={28} className="text-primary" />
        </div>
        <h2 className="text-lg font-bold tracking-tight">Em construção</h2>
        <p className="mt-2 max-w-xs text-sm text-gray-400">{description}</p>
        <p className="mt-6 text-[11px] font-semibold uppercase tracking-wider text-gray-600">
          Fatia 2 — após plug do Supabase
        </p>
      </div>
    </div>
  );
}
