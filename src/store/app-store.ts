import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type TabKey = "home" | "timer" | "history" | "analytics" | "reports" | "settings";

export interface Service {
  id: string;
  name: string;
  price: number;
  duration_minutes?: number;
  is_active: boolean;
}

export type PaymentMethod = "pix" | "cash";

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  pix: "PIX",
  cash: "DINHEIRO",
};

export interface Appointment {
  id: string;
  service_id: string | null;
  service_name: string;
  price: number;
  barber_share: number;
  owner_share: number;
  started_at: string; // ISO
  ended_at: string; // ISO
  duration_seconds: number;
  note?: string;
  /** "pix" | "cash". null apenas para registros antigos (antes da migração). */
  payment_method: PaymentMethod | null;
}

export interface Profile {
  barbershop_name: string;
  daily_goal: number;
  /** Percentual do BARBEIRO (0–100). Resto = lucro do dono. */
  barber_percentage: number;
  /** Horário "padrão" (compat). Usado como fallback se faltar work_schedule. */
  work_start: string;
  work_end: string;
}

/** Horário por dia da semana (0=Domingo … 6=Sábado). */
export interface WorkScheduleDay {
  day_of_week: number; // 0..6
  start_time: string; // "HH:MM"
  end_time: string; // "HH:MM"
  is_active: boolean;
}

interface TimerState {
  isRunning: boolean;
  startedAt: string | null; // ISO of first start (kept across pause)
  // For pause: accumulated seconds before current run, plus runStartedAt
  accumulatedSeconds: number;
  runStartedAt: string | null; // ISO of current run segment
}

interface BottomSheetState {
  isOpen: boolean;
  type: string | null;
  data?: unknown;
}

interface AppState {
  profile: Profile;
  services: Service[];
  appointments: Appointment[];
  /** Sempre 7 entradas, indexadas por day_of_week 0..6. */
  workSchedule: WorkScheduleDay[];
  activeTab: TabKey;
  timer: TimerState;
  bottomSheet: BottomSheetState;

  setActiveTab: (t: TabKey) => void;
  setProfile: (p: Partial<Profile>) => void;
  setWorkSchedule: (s: WorkScheduleDay[]) => void;
  updateWorkScheduleDay: (day: number, patch: Partial<WorkScheduleDay>) => void;

  // Timer
  startTimer: () => void;
  pauseTimer: () => void;
  resetTimer: () => void;
  getElapsedSeconds: () => number;

  // Appointments
  addAppointment: (
    a: Omit<Appointment, "id" | "barber_share" | "owner_share"> & {
      barber_share?: number;
      owner_share?: number;
      payment_method: PaymentMethod;
    },
  ) => void;
  deleteAppointment: (id: string) => void;
  updateAppointment: (id: string, patch: Partial<Appointment>) => void;

  // Services
  addService: (s: Omit<Service, "id" | "is_active">) => void;
  removeService: (id: string) => void;

  // Bottom sheet
  openSheet: (type: string, data?: unknown) => void;
  closeSheet: () => void;
}

export const defaultWorkSchedule = (): WorkScheduleDay[] =>
  Array.from({ length: 7 }, (_, i) => ({
    day_of_week: i,
    start_time: "09:00",
    end_time: "20:00",
    is_active: true,
  }));

// UUID v4 simples (fallback se crypto.randomUUID indisponível em SSR)
function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Validador UUID — usado pra purgar IDs legados ("s1", "s2"…) do localStorage
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string) => UUID_RE.test(s);

const defaultServices: Service[] = [
  { id: uid(), name: "Corte", price: 40, duration_minutes: 30, is_active: true },
  { id: uid(), name: "Barba", price: 30, duration_minutes: 20, is_active: true },
  { id: uid(), name: "Corte + Barba", price: 65, duration_minutes: 45, is_active: true },
];

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      profile: { barbershop_name: "Minha Barbearia", daily_goal: 300, barber_percentage: 60, work_start: "09:00", work_end: "20:00" },
      services: defaultServices,
      appointments: [],
      workSchedule: defaultWorkSchedule(),
      activeTab: "home",
      timer: { isRunning: false, startedAt: null, accumulatedSeconds: 0, runStartedAt: null },
      bottomSheet: { isOpen: false, type: null },

      setActiveTab: (t) => set({ activeTab: t }),
      setProfile: (p) => set((s) => ({ profile: { ...s.profile, ...p } })),
      setWorkSchedule: (schedule) => set({ workSchedule: schedule }),
      updateWorkScheduleDay: (day, patch) =>
        set((s) => ({
          workSchedule: s.workSchedule.map((d) =>
            d.day_of_week === day ? { ...d, ...patch } : d,
          ),
        })),

      startTimer: () => {
        const now = new Date().toISOString();
        const t = get().timer;
        set({
          timer: {
            isRunning: true,
            startedAt: t.startedAt ?? now,
            accumulatedSeconds: t.accumulatedSeconds,
            runStartedAt: now,
          },
        });
      },
      pauseTimer: () => {
        const t = get().timer;
        if (!t.isRunning || !t.runStartedAt) return;
        const delta = Math.floor((Date.now() - new Date(t.runStartedAt).getTime()) / 1000);
        set({
          timer: {
            isRunning: false,
            startedAt: t.startedAt,
            accumulatedSeconds: t.accumulatedSeconds + delta,
            runStartedAt: null,
          },
        });
      },
      resetTimer: () =>
        set({ timer: { isRunning: false, startedAt: null, accumulatedSeconds: 0, runStartedAt: null } }),
      getElapsedSeconds: () => {
        const t = get().timer;
        if (!t.isRunning || !t.runStartedAt) return t.accumulatedSeconds;
        const delta = Math.floor((Date.now() - new Date(t.runStartedAt).getTime()) / 1000);
        return t.accumulatedSeconds + delta;
      },

      addAppointment: (a) =>
        set((s) => {
          // Validação de invariante: forma de pagamento é obrigatória.
          if (a.payment_method !== "pix" && a.payment_method !== "cash") return {};
          const pct = s.profile.barber_percentage ?? 60;
          const barber = a.barber_share ?? Math.round(a.price * (pct / 100) * 100) / 100;
          const owner = a.owner_share ?? Math.round((a.price - barber) * 100) / 100;
          return {
            appointments: [
              { ...a, id: uid(), barber_share: barber, owner_share: owner },
              ...s.appointments,
            ],
          };
        }),
      deleteAppointment: (id) =>
        set((s) => ({ appointments: s.appointments.filter((a) => a.id !== id) })),
      updateAppointment: (id, patch) =>
        set((s) => ({
          appointments: s.appointments.map((a) => (a.id === id ? { ...a, ...patch } : a)),
        })),

      addService: (s) =>
        set((st) => ({
          services: [...st.services, { ...s, id: uid(), is_active: true }],
        })),
      removeService: (id) => set((st) => ({ services: st.services.filter((x) => x.id !== id) })),

      openSheet: (type, data) => set({ bottomSheet: { isOpen: true, type, data } }),
      closeSheet: () => set({ bottomSheet: { isOpen: false, type: null } }),
    }),
    {
      name: "barbermetrics-v2",
      storage: createJSONStorage(() => localStorage),
      version: 6,
      migrate: (persisted) => {
        const p = (persisted ?? {}) as Partial<AppState>;
        if (Array.isArray(p.services)) {
          p.services = p.services.map((s) => (isUuid(s.id) ? s : { ...s, id: uid() }));
        }
        if (p.profile) {
          const prof = p.profile as Profile;
          p.profile = {
            ...prof,
            barber_percentage: typeof prof.barber_percentage === "number" ? prof.barber_percentage : 60,
            work_start: typeof prof.work_start === "string" ? prof.work_start : "09:00",
            work_end: typeof prof.work_end === "string" ? prof.work_end : "20:00",
          };
        }
        // workSchedule: garante 7 dias preenchidos, herda work_start/work_end se faltar.
        const profStart = (p.profile as Profile | undefined)?.work_start ?? "09:00";
        const profEnd = (p.profile as Profile | undefined)?.work_end ?? "20:00";
        const existing = Array.isArray(p.workSchedule) ? p.workSchedule : [];
        const byDay = new Map<number, WorkScheduleDay>(
          existing
            .filter((d): d is WorkScheduleDay => typeof d?.day_of_week === "number")
            .map((d) => [d.day_of_week, d]),
        );
        p.workSchedule = Array.from({ length: 7 }, (_, i) => {
          const cur = byDay.get(i);
          return {
            day_of_week: i,
            start_time: typeof cur?.start_time === "string" ? cur.start_time : profStart,
            end_time: typeof cur?.end_time === "string" ? cur.end_time : profEnd,
            is_active: typeof cur?.is_active === "boolean" ? cur.is_active : true,
          };
        });
        if (Array.isArray(p.appointments)) {
          p.appointments = p.appointments
            .filter((a) => isUuid(a.id))
            .map((a) => {
              const pct = (p.profile as Profile | undefined)?.barber_percentage ?? 60;
              const barber =
                typeof a.barber_share === "number"
                  ? a.barber_share
                  : Math.round(a.price * (pct / 100) * 100) / 100;
              const owner =
                typeof a.owner_share === "number"
                  ? a.owner_share
                  : Math.round((a.price - barber) * 100) / 100;
              return {
                ...a,
                barber_share: barber,
                owner_share: owner,
                service_id: a.service_id && isUuid(a.service_id) ? a.service_id : null,
                payment_method:
                  a.payment_method === "pix" || a.payment_method === "cash" ? a.payment_method : null,
              };
            });
        }
        return p as AppState;
      },
      partialize: (s) => ({
        profile: s.profile,
        services: s.services,
        appointments: s.appointments,
        workSchedule: s.workSchedule,
        timer: s.timer,
      }),
    },
  ),
);
