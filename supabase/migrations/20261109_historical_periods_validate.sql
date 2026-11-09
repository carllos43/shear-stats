-- =====================================================================
-- Validação: historical_periods
-- Execute no SQL Editor após a migração.
-- Apenas consultas de leitura — não altera dados.
-- =====================================================================

-- 1. Tabela existe?
select exists (
  select 1 from information_schema.tables
  where table_schema = 'public' and table_name = 'historical_periods'
) as table_exists;

-- 2. Colunas e tipos
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'historical_periods'
order by ordinal_position;

-- 3. RLS habilitado?
select relname, relrowsecurity
from pg_class
where relname = 'historical_periods';

-- 4. Políticas
select polname, polcmd, polroles::regrole[]
from pg_policy
where polrelid = 'public.historical_periods'::regclass;

-- 5. Índices
select indexname, indexdef
from pg_indexes
where tablename = 'historical_periods' and schemaname = 'public';

-- 6. Trigger existe?
select tgname, tgenabled
from pg_trigger
where tgrelid = 'public.historical_periods'::regclass
  and not tgisinternal;

-- 7. Função existe?
select proname
from pg_proc
where proname = 'historical_periods_check_result';

-- 8. Constraint unique
select conname, contype
from pg_constraint
where conrelid = 'public.historical_periods'::regclass;

-- 9. Períodos importados (após rodar o import no app)
-- Substitua :user_id se quiser filtrar, ou remova o where para ver todos (só com service role)
select label, period_start, period_end, revenue, expenses, result, origin, type
from public.historical_periods
order by period_start;

-- 10. Totais
select
  count(*) as periods,
  sum(revenue) as total_revenue,
  sum(expenses) as total_expenses,
  sum(result) as total_result
from public.historical_periods;

-- 11. Duplicatas (deve retornar 0 linhas)
select user_id, period_start, period_end, type, count(*)
from public.historical_periods
group by user_id, period_start, period_end, type
having count(*) > 1;

-- 12. Consistência de result (deve retornar 0 linhas se tudo ok)
select id, label, revenue, expenses, result,
       (revenue - expenses) as expected,
       abs(result - (revenue - expenses)) as diff
from public.historical_periods
where abs(result - (revenue - expenses)) > 0.01
  and (discrepancy_note is null or discrepancy_note = '');

-- =====================================================================
-- Resultado esperado após migração + import:
-- table_exists = true
-- RLS = true
-- 1 policy "historical_periods_all_own"
-- trigger historical_periods_result_check ativo
-- 3 períodos (ago/set/out 2026)
-- total_revenue ≈ 12850.60
-- total_expenses ≈ 5852.00
-- total_result ≈ 6998.60
-- 0 duplicatas
-- 0 inconsistências de result
-- =====================================================================
