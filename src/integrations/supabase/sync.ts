import { supabase, type DbAppointment, type DbService, type DbProfile } from "@/integrations/supabase/client";
import { useAppStore, defaultWorkSchedule, type Appointment, type Service, type Profile, type WorkScheduleDay } from "@/store/app-store";

function fromDbAppointment(r: DbAppointment): Appointment {
  const price = Number(r.price);
  const barber = r.barber_share != null ? Number(r.barber_share) : Math.round(price * 0.6 * 100) / 100;
  const owner = r.owner_share != null ? Number(r.owner_share) : Math.round((price - barber) * 100) / 100;
  return {
    id: r.id,
    service_id: r.service_id,
    service_name: r.service_name,
    price,
    barber_share: barber,
    owner_share: owner,
    started_at: r.started_at,
    ended_at: r.ended_at,
    duration_seconds: r.duration_seconds,
    note: r.note ?? undefined,
    payment_method:
      r.payment_method === "pix" || r.payment_method === "cash" ? r.payment_method : null,
  };
}

function fromDbService(r: DbService): Service {
  return {
    id: r.id,
    name: r.name,
    price: Number(r.price),
    duration_minutes: r.duration_minutes ?? undefined,
    is_active: r.is_active,
  };
}

function fromDbProfile(r: DbProfile): Profile {
  return {
    barbershop_name: r.barbershop_name,
    daily_goal: Number(r.daily_goal),
    barber_percentage: r.barber_percentage != null ? Number(r.barber_percentage) : 60,
    work_start: "09:00",
    work_end: "19:00",
  };
}

// Cache em memória — evita refetch a cada navegação/montagem do shell.
const PULL_TTL_MS = 60_000;
const lastPullAt = new Map<string, number>();
let pullInflight: Map<string, Promise<void>> = new Map();

export function invalidatePullCache(userId?: string) {
  if (userId) lastPullAt.delete(userId);
  else lastPullAt.clear();
}

/** Carrega profile + services + appointments do servidor para o store local. */
export async function pullAll(userId: string, opts?: { force?: boolean }): Promise<void> {
  const force = opts?.force ?? false;
  const last = lastPullAt.get(userId) ?? 0;
  if (!force && Date.now() - last < PULL_TTL_MS) return;
  const existing = pullInflight.get(userId);
  if (existing) return existing;
  const p = doPull(userId).finally(() => {
    pullInflight.delete(userId);
    lastPullAt.set(userId, Date.now());
  });
  pullInflight.set(userId, p);
  return p;
}

async function doPull(userId: string): Promise<void> {
  const [profileRes, servicesRes, apptRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabase.from("services").select("*").eq("user_id", userId).order("name"),
    supabase
      .from("appointments")
      .select("*")
      .eq("user_id", userId)
      .order("started_at", { ascending: false })
      .limit(500),
  ]);

  const state = useAppStore.getState();

  if (profileRes.data) {
    state.setProfile(fromDbProfile(profileRes.data as DbProfile));
  } else if (!profileRes.error) {
    // criar profile vazio se trigger não rodou
    await supabase.from("profiles").insert({
      id: userId,
      barbershop_name: state.profile.barbershop_name,
      daily_goal: state.profile.daily_goal,
    });
  }

  if (servicesRes.data && servicesRes.data.length > 0) {
    useAppStore.setState({ services: (servicesRes.data as DbService[]).map(fromDbService) });
  } else if (servicesRes.data && servicesRes.data.length === 0) {
    // primeiro login: enviar serviços padrão para o servidor
    const seed = state.services.map((s) => ({
      id: s.id,
      user_id: userId,
      name: s.name,
      price: s.price,
      duration_minutes: s.duration_minutes ?? null,
      is_active: s.is_active,
    }));
    if (seed.length) await supabase.from("services").insert(seed);
  }

  if (apptRes.data) {
    useAppStore.setState({
      appointments: (apptRes.data as DbAppointment[]).map(fromDbAppointment),
    });
  }

  // work_schedule (silencioso se a tabela ainda não existir no servidor)
  try {
    const wsRes = await supabase
      .from("work_schedule")
      .select("day_of_week,start_time,end_time,is_active")
      .eq("user_id", userId);
    if (!wsRes.error && wsRes.data) {
      const rows = wsRes.data as Array<{
        day_of_week: number;
        start_time: string;
        end_time: string;
        is_active: boolean;
      }>;
      if (rows.length === 0) {
        // primeiro acesso: cria 7 dias 09:00–20:00
        const seed = defaultWorkSchedule().map((d) => ({
          user_id: userId,
          day_of_week: d.day_of_week,
          start_time: d.start_time,
          end_time: d.end_time,
          is_active: d.is_active,
        }));
        await supabase.from("work_schedule").insert(seed);
        useAppStore.setState({ workSchedule: defaultWorkSchedule() });
      } else {
        const byDay = new Map<number, WorkScheduleDay>();
        for (const r of rows) {
          byDay.set(r.day_of_week, {
            day_of_week: r.day_of_week,
            start_time: (r.start_time ?? "09:00").slice(0, 5),
            end_time: (r.end_time ?? "20:00").slice(0, 5),
            is_active: r.is_active,
          });
        }
        const merged = defaultWorkSchedule().map(
          (d) => byDay.get(d.day_of_week) ?? d,
        );
        useAppStore.setState({ workSchedule: merged });
      }
    }
  } catch (err) {
    // tabela ausente: silencia para não quebrar app offline-first
    console.warn("work_schedule pull skipped:", err);
  }
}

/** Push otimista de um appointment recém-criado. */
export async function pushAppointment(userId: string, a: Appointment): Promise<void> {
  await supabase.from("appointments").insert({
    id: a.id,
    user_id: userId,
    service_id: a.service_id,
    service_name: a.service_name,
    price: a.price,
    barber_share: a.barber_share,
    owner_share: a.owner_share,
    started_at: a.started_at,
    ended_at: a.ended_at,
    duration_seconds: a.duration_seconds,
    note: a.note ?? null,
    payment_method: a.payment_method,
  });
}

export async function deleteAppointmentRemote(id: string): Promise<void> {
  await supabase.from("appointments").delete().eq("id", id);
}

export async function updateAppointmentRemote(id: string, patch: Partial<Appointment>): Promise<void> {
  await supabase.from("appointments").update(patch).eq("id", id);
}

export async function pushService(userId: string, s: Service): Promise<void> {
  await supabase.from("services").insert({
    id: s.id,
    user_id: userId,
    name: s.name,
    price: s.price,
    duration_minutes: s.duration_minutes ?? null,
    is_active: s.is_active,
  });
}

export async function deleteServiceRemote(id: string): Promise<void> {
  await supabase.from("services").delete().eq("id", id);
}

export async function pushProfile(userId: string, p: Profile): Promise<void> {
  await supabase.from("profiles").upsert({
    id: userId,
    barbershop_name: p.barbershop_name,
    daily_goal: p.daily_goal,
    barber_percentage: p.barber_percentage,
  });
}

/** Upsert por (user_id, day_of_week) — silencioso se a tabela não existir. */
export async function pushWorkSchedule(
  userId: string,
  schedule: WorkScheduleDay[],
): Promise<void> {
  try {
    const rows = schedule.map((d) => ({
      user_id: userId,
      day_of_week: d.day_of_week,
      start_time: d.start_time,
      end_time: d.end_time,
      is_active: d.is_active,
    }));
    const { error } = await supabase
      .from("work_schedule")
      .upsert(rows, { onConflict: "user_id,day_of_week" });
    if (error) console.warn("pushWorkSchedule:", error.message);
  } catch (err) {
    console.warn("pushWorkSchedule failed:", err);
  }
}
