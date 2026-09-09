import { useEffect, useRef } from "react";
import { useAppStore, type Appointment, type Service, type Profile, type WorkScheduleDay } from "@/store/app-store";
import {
  pushAppointment,
  deleteAppointmentRemote,
  updateAppointmentRemote,
  pushService,
  deleteServiceRemote,
  pushProfile,
  pushWorkSchedule,
} from "@/integrations/supabase/sync";

/** Agrupa updates rápidos do mesmo atendimento numa única gravação. */
function createUpdateQueue() {
  const timers = new Map<string, number>();
  const latest = new Map<string, Partial<Appointment>>();
  return (id: string, patch: Partial<Appointment>) => {
    latest.set(id, patch);
    const prev = timers.get(id);
    if (prev) window.clearTimeout(prev);
    const t = window.setTimeout(() => {
      timers.delete(id);
      const p = latest.get(id);
      latest.delete(id);
      if (p) void updateAppointmentRemote(id, p);
    }, 400);
    timers.set(id, t);
  };
}

/**
 * Observa o store e empurra mudanças para o Supabase.
 * Roda só depois do hidrate inicial (pullAll) para não duplicar dados.
 */
export function useAppSync(userId: string | null, ready: boolean) {
  const prevRef = useRef<{
    appointments: Map<string, Appointment>;
    services: Map<string, Service>;
    profile: Profile | null;
    schedule: WorkScheduleDay[] | null;
    apptRef: Appointment[] | null;
    svcRef: Service[] | null;
  }>({
    appointments: new Map(),
    services: new Map(),
    profile: null,
    schedule: null,
    apptRef: null,
    svcRef: null,
  });

  useEffect(() => {
    if (!userId || !ready) return;
    const s = useAppStore.getState();
    prevRef.current = {
      appointments: new Map(s.appointments.map((a) => [a.id, a])),
      services: new Map(s.services.map((x) => [x.id, x])),
      profile: { ...s.profile },
      schedule: s.workSchedule.map((d) => ({ ...d })),
      apptRef: s.appointments,
      svcRef: s.services,
    };

    const queueUpdate = createUpdateQueue();

    const unsub = useAppStore.subscribe((state) => {
      const prev = prevRef.current;

      // appointments — só diffa se a lista mudou de referência
      let nextApptMap = prev.appointments;
      if (state.appointments !== prev.apptRef) {
        nextApptMap = new Map(state.appointments.map((a) => [a.id, a]));
        for (const [id, a] of nextApptMap) {
          const before = prev.appointments.get(id);
          if (!before) {
            void pushAppointment(userId, a);
          } else if (before !== a) {
            queueUpdate(id, a);
          }
        }
        for (const id of prev.appointments.keys()) {
          if (!nextApptMap.has(id)) void deleteAppointmentRemote(id);
        }
      }

      // services
      let nextSvcMap = prev.services;
      if (state.services !== prev.svcRef) {
        nextSvcMap = new Map(state.services.map((x) => [x.id, x]));
        for (const [id, s2] of nextSvcMap) {
          const before = prev.services.get(id);
          if (!before || before !== s2) void pushService(userId, s2);
        }
        for (const id of prev.services.keys()) {
          if (!nextSvcMap.has(id)) void deleteServiceRemote(id);
        }
      }

      // profile
      if (
        !prev.profile ||
        prev.profile.barbershop_name !== state.profile.barbershop_name ||
        prev.profile.daily_goal !== state.profile.daily_goal ||
        prev.profile.barber_percentage !== state.profile.barber_percentage
      ) {
        void pushProfile(userId, state.profile);
      }

      // workSchedule (compara campo a campo)
      const prevSched = prev.schedule;
      const changed =
        !prevSched ||
        prevSched.length !== state.workSchedule.length ||
        state.workSchedule.some((d, i) => {
          const o = prevSched[i];
          return (
            !o ||
            o.start_time !== d.start_time ||
            o.end_time !== d.end_time ||
            o.is_active !== d.is_active
          );
        });
      if (changed) void pushWorkSchedule(userId, state.workSchedule);

      prevRef.current = {
        appointments: nextApptMap,
        services: nextSvcMap,
        profile: { ...state.profile },
        schedule: state.workSchedule.map((d) => ({ ...d })),
        apptRef: state.appointments,
        svcRef: state.services,
      };
    });

    return () => unsub();
  }, [userId, ready]);
}
