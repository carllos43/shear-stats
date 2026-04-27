import { useEffect, useRef } from "react";
import { useAppStore, type Appointment, type Service, type Profile } from "@/store/app-store";
import {
  pushAppointment,
  deleteAppointmentRemote,
  updateAppointmentRemote,
  pushService,
  deleteServiceRemote,
  pushProfile,
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
  }>({ appointments: new Map(), services: new Map(), profile: null });

  useEffect(() => {
    if (!userId || !ready) return;
    const s = useAppStore.getState();
    prevRef.current = {
      appointments: new Map(s.appointments.map((a) => [a.id, a])),
      services: new Map(s.services.map((x) => [x.id, x])),
      profile: { ...s.profile },
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
        prev.profile.daily_goal !== state.profile.daily_goal
      ) {
        pushProfile(userId, state.profile).catch((e) => console.error("push profile", e));
      }

      prevRef.current = {
        appointments: nextAppt,
        services: nextSvc,
        profile: { ...state.profile },
      };
    });

    return () => unsub();
  }, [userId, ready]);
}
