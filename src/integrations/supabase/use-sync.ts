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
  }>({ appointments: new Map(), services: new Map(), profile: null, schedule: null });

  useEffect(() => {
    if (!userId || !ready) return;
    const s = useAppStore.getState();
    prevRef.current = {
      appointments: new Map(s.appointments.map((a) => [a.id, a])),
      services: new Map(s.services.map((x) => [x.id, x])),
      profile: { ...s.profile },
      schedule: s.workSchedule.map((d) => ({ ...d })),
    };

    const unsub = useAppStore.subscribe((state) => {
      const prev = prevRef.current;

      // appointments
      const nextAppt = new Map(state.appointments.map((a) => [a.id, a]));
      for (const [id, a] of nextAppt) {
        const before = prev.appointments.get(id);
        if (!before) {
          pushAppointment(userId, a).catch((e) => console.error("push appt", e));
        } else if (before !== a) {
          updateAppointmentRemote(id, a).catch((e) => console.error("update appt", e));
        }
      }
      for (const id of prev.appointments.keys()) {
        if (!nextAppt.has(id)) {
          deleteAppointmentRemote(id).catch((e) => console.error("del appt", e));
        }
      }

      // services
      const nextSvc = new Map(state.services.map((x) => [x.id, x]));
      for (const [id, s2] of nextSvc) {
        if (!prev.services.has(id)) {
          pushService(userId, s2).catch((e) => console.error("push svc", e));
        }
      }
      for (const id of prev.services.keys()) {
        if (!nextSvc.has(id)) {
          deleteServiceRemote(id).catch((e) => console.error("del svc", e));
        }
      }

      // profile
      if (
        !prev.profile ||
        prev.profile.barbershop_name !== state.profile.barbershop_name ||
        prev.profile.daily_goal !== state.profile.daily_goal ||
        prev.profile.barber_percentage !== state.profile.barber_percentage
      ) {
        pushProfile(userId, state.profile).catch((e) => console.error("push profile", e));
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
      if (changed) {
        pushWorkSchedule(userId, state.workSchedule).catch((e) =>
          console.error("push schedule", e),
        );
      }

      prevRef.current = {
        appointments: nextAppt,
        services: nextSvc,
        profile: { ...state.profile },
        schedule: state.workSchedule.map((d) => ({ ...d })),
      };
    });

    return () => unsub();
  }, [userId, ready]);
}
