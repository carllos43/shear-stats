import { supabase, type DbAppointment, type DbService, type DbProfile } from "@/integrations/supabase/client";
import { useAppStore, type Appointment, type Service, type Profile } from "@/store/app-store";

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
  };
}

/** Carrega profile + services + appointments do servidor para o store local. */
export async function pullAll(userId: string): Promise<void> {
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
}

/** Push otimista de um appointment recém-criado. */
export async function pushAppointment(userId: string, a: Appointment): Promise<void> {
  await supabase.from("appointments").insert({
    id: a.id,
    user_id: userId,
    service_id: a.service_id,
    service_name: a.service_name,
    price: a.price,
    started_at: a.started_at,
    ended_at: a.ended_at,
    duration_seconds: a.duration_seconds,
    note: a.note ?? null,
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
  });
}
