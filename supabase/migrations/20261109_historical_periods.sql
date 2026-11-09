-- =====================================================================
-- Migração: historical_periods
-- Data: 2026-11-09
-- Objetivo: armazenar períodos financeiros consolidados informados
--           pelo usuário, separados de appointments reais.
-- Segurança: idempotente, não destrutivo, RLS por usuário.
-- Não cria atendimentos fictícios. Não altera appointments.
-- =====================================================================

-- ---------- TABELA ----------
create table if not exists public.historical_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  revenue numeric not null check (revenue >= 0),
  expenses numeric not null default 0 check (expenses >= 0),
  result numeric not null,
  label text not null,
  origin text not null default 'histórico informado pelo usuário',
  type text not null default 'monthly_consolidated',
  notes text,
  discrepancy_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, period_start, period_end, type)
);

-- ---------- ÍNDICES ----------
create index if not exists historical_periods_user_start_idx
  on public.historical_periods (user_id, period_start desc);

create index if not exists historical_periods_user_type_idx
  on public.historical_periods (user_id, type);

-- ---------- PERMISSÕES ----------
grant select, insert, update, delete on public.historical_periods to authenticated;
grant all on public.historical_periods to service_role;

-- ---------- RLS ----------
alter table public.historical_periods enable row level security;

drop policy if exists "historical_periods_all_own" on public.historical_periods;
create policy "historical_periods_all_own" on public.historical_periods
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------- FUNÇÃO DE VALIDAÇÃO ----------
create or replace function public.historical_periods_check_result()
returns trigger
language plpgsql
as $$
begin
  if abs(new.result - (new.revenue - new.expenses)) > 0.01
     and (new.discrepancy_note is null or new.discrepancy_note = '') then
    raise exception 'result deve ser igual a revenue - expenses, ou forneça discrepancy_note';
  end if;
  return new;
end;
$$;

-- ---------- TRIGGER ----------
drop trigger if exists historical_periods_result_check on public.historical_periods;
create trigger historical_periods_result_check
  before insert or update on public.historical_periods
  for each row
  execute function public.historical_periods_check_result();

-- ---------- COMENTÁRIOS ----------
comment on table public.historical_periods is
  'Períodos financeiros consolidados informados pelo usuário. Não representa atendimentos individuais.';

comment on column public.historical_periods.result is
  'Deve ser igual a revenue - expenses (tolerância 0.01), salvo se discrepancy_note estiver preenchido.';

-- ---------- RELOAD POSTGREST ----------
notify pgrst, 'reload schema';

-- =====================================================================
-- Fim da migração. Execute o arquivo de validação em seguida.
-- =====================================================================
