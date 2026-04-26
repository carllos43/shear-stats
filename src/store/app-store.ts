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

export interface Appointment {
  id: string;
  service_id: string | null;
  service_name: string;
  price: number;
  started_at: string; // ISO
  ended_at: string; // ISO
  duration_seconds: number;
  note?: string;
}

export interface Profile {
  barbershop_name: string;
  daily_goal: number;
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
  activeTab: TabKey;
  timer: TimerState;
  bottomSheet: BottomSheetState;

  setActiveTab: (t: TabKey) => void;
  setProfile: (p: Partial<Profile>) => void;

  // Timer
  startTimer: () => void;
  pauseTimer: () => void;
  resetTimer: () => void;
  getElapsedSeconds: () => number;

  // Appointments
  addAppointment: (a: Omit<Appointment, "id">) => void;
  deleteAppointment: (id: string) => void;
  updateAppointment: (id: string, patch: Partial<Appointment>) => void;

  // Services
  addService: (s: Omit<Service, "id" | "is_active">) => void;
  removeService: (id: string) => void;

  // Bottom sheet
  openSheet: (type: string, data?: unknown) => void;
  closeSheet: () => void;
}

const defaultServices: Service[] = [
  { id: "s1", name: "Corte", price: 40, duration_minutes: 30, is_active: true },
  { id: "s2", name: "Barba", price: 30, duration_minutes: 20, is_active: true },
  { id: "s3", name: "Corte + Barba", price: 65, duration_minutes: 45, is_active: true },
];

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      profile: { barbershop_name: "Minha Barbearia", daily_goal: 300 },
      services: defaultServices,
      appointments: [],
      activeTab: "home",
      timer: { isRunning: false, startedAt: null, accumulatedSeconds: 0, runStartedAt: null },
      bottomSheet: { isOpen: false, type: null },

      setActiveTab: (t) => set({ activeTab: t }),
      setProfile: (p) => set((s) => ({ profile: { ...s.profile, ...p } })),

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
        set((s) => ({
          appointments: [{ ...a, id: crypto.randomUUID() }, ...s.appointments],
        })),
      deleteAppointment: (id) =>
        set((s) => ({ appointments: s.appointments.filter((a) => a.id !== id) })),
      updateAppointment: (id, patch) =>
        set((s) => ({
          appointments: s.appointments.map((a) => (a.id === id ? { ...a, ...patch } : a)),
        })),

      addService: (s) =>
        set((st) => ({
          services: [...st.services, { ...s, id: crypto.randomUUID(), is_active: true }],
        })),
      removeService: (id) => set((st) => ({ services: st.services.filter((x) => x.id !== id) })),

      openSheet: (type, data) => set({ bottomSheet: { isOpen: true, type, data } }),
      closeSheet: () => set({ bottomSheet: { isOpen: false, type: null } }),
    }),
    {
      name: "barbermetrics-v2",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        profile: s.profile,
        services: s.services,
        appointments: s.appointments,
        timer: s.timer,
      }),
    },
  ),
);
