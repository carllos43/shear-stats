-- =====================================================================
-- BarberMetrics 2.0 — Schema inicial
-- Cole tudo no SQL Editor do Supabase e clique em "Run".
-- Idempotente: pode rodar de novo sem quebrar.
-- =====================================================================

-- ---------- PROFILES ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  barbershop_name text not null default 'Minha Barbearia',
  daily_goal numeric not null default 300,
  updated_at timestamptz not null default now()
);

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
  created_at timestamptz not null default now()
);

create index if not exists appt_user_started_idx
  on public.appointments(user_id, started_at desc);

alter table public.appointments enable row level security;

drop policy if exists "appt_all_own" on public.appointments;
create policy "appt_all_own" on public.appointments
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
