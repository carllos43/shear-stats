-- =====================================================================
-- BarberMetrics 2.0 — Schema completo
-- Cole TUDO no SQL Editor do Supabase e clique em "Run".
-- Idempotente: pode rodar de novo sem quebrar.
-- =====================================================================

-- ---------- PROFILES ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  barbershop_name text not null default 'Minha Barbearia',
  daily_goal numeric not null default 300,
  barber_percentage numeric not null default 60 check (barber_percentage >= 0 and barber_percentage <= 100),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- ---------- SERVICES ----------
create table if not exists public.services (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  price numeric not null check (price >= 0),
  duration_minutes int,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.services
  add column if not exists duration_minutes int;

grant select, insert, update, delete on public.services to authenticated;
grant all on public.services to service_role;

create index if not exists services_user_idx on public.services(user_id);

alter table public.services enable row level security;

drop policy if exists "services_all_own" on public.services;
create policy "services_all_own" on public.services
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- APPOINTMENTS ----------
create table if not exists public.appointments (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  service_name text not null,
  price numeric not null check (price >= 0),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  duration_seconds int not null check (duration_seconds >= 0),
  note text,
  barber_share numeric not null default 0 check (barber_share >= 0),
  owner_share  numeric not null default 0 check (owner_share  >= 0),
  created_at timestamptz not null default now()
);

alter table public.appointments
  add column if not exists barber_share numeric not null default 0,
  add column if not exists owner_share  numeric not null default 0;

grant select, insert, update, delete on public.appointments to authenticated;
grant all on public.appointments to service_role;

-- Backfill 60/40 para registros antigos
update public.appointments
set barber_share = round((price * 0.6)::numeric, 2),
    owner_share  = round((price * 0.4)::numeric, 2)
where barber_share = 0 and owner_share = 0;

create index if not exists appt_user_started_idx
  on public.appointments(user_id, started_at desc);

alter table public.appointments enable row level security;

drop policy if exists "appt_all_own" on public.appointments;
create policy "appt_all_own" on public.appointments
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- WORK SCHEDULE (horário por dia da semana) ----------
create table if not exists public.work_schedule (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time text not null default '09:00',
  end_time   text not null default '19:00',
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (user_id, day_of_week)
);

grant select, insert, update, delete on public.work_schedule to authenticated;
grant all on public.work_schedule to service_role;

create index if not exists work_schedule_user_idx on public.work_schedule(user_id);

alter table public.work_schedule enable row level security;

drop policy if exists "work_schedule_all_own" on public.work_schedule;
create policy "work_schedule_all_own" on public.work_schedule
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- WEEKLY STATS (memória semanal para a IA) ----------
create table if not exists public.weekly_stats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start_date date not null,
  total_revenue numeric not null default 0,
  total_clients int not null default 0,
  avg_ticket numeric not null default 0,
  avg_occupancy numeric not null default 0,
  best_day date,
  worst_day date,
  updated_at timestamptz not null default now(),
  unique (user_id, week_start_date)
);

grant select, insert, update, delete on public.weekly_stats to authenticated;
grant all on public.weekly_stats to service_role;

create index if not exists weekly_stats_user_week_idx
  on public.weekly_stats(user_id, week_start_date desc);

alter table public.weekly_stats enable row level security;

drop policy if exists "weekly_stats_all_own" on public.weekly_stats;
create policy "weekly_stats_all_own" on public.weekly_stats
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- TRIGGER: auto-cria profile no signup ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Recarrega o cache do PostgREST
notify pgrst, 'reload schema';

-- ---------- MIGRAÇÃO: FORMA DE PAGAMENTO ----------
-- Adiciona payment_method ('pix' | 'cash'). Registros antigos permanecem NULL.
alter table public.appointments
  add column if not exists payment_method text;

alter table public.appointments
  drop constraint if exists appointments_payment_method_chk;
alter table public.appointments
  add constraint appointments_payment_method_chk
  check (payment_method is null or payment_method in ('pix', 'cash'));

-- Novos atendimentos são obrigados a informar a forma de pagamento,
-- sem invalidar os registros antigos (NULL histórico permitido).
create or replace function public.appointments_require_payment_method()
returns trigger
language plpgsql
as $$
begin
  if new.payment_method is null or new.payment_method not in ('pix', 'cash') then
    raise exception 'payment_method obrigatório: use ''pix'' ou ''cash''';
  end if;
  return new;
end;
$$;

drop trigger if exists appointments_payment_method_required on public.appointments;
create trigger appointments_payment_method_required
  before insert on public.appointments
  for each row execute function public.appointments_require_payment_method();
