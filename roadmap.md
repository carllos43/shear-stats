# Historical financial import

## SaaS error review
- [ ] Fix durable sync, deletion races, account isolation, and incomplete history downloads.
- [ ] Correct overlapping occupancy, idle gaps, weekly trend, and historical ticket calculations.
- [ ] Validate appointment dates and inspect login, navigation, and report errors.
- [ ] Run regression tests and public desktop/mobile checks; authenticated checks require access to the existing account.

- [x] Read the import requirements and verify the supplied weekly totals.
- [x] Check available database access: the existing external connection is not accessible through database tools or managed credentials.
- [x] Resolve August's R$ 5.00 discrepancy with the user before any financial writes. (Usando valores consolidados informados; nota registrada.)
- [x] Confirm August and October week periods, or explicitly retain month/week granularity without invented dates. (Migrado para períodos mensais consolidados.)
- [ ] Obtain access to the existing database and identify the correct account and any existing equivalent records; do not provision a replacement database.
- [x] Implement only the necessary historical aggregate storage and integrations after confirming the existing live schema; do not fabricate appointments or payment methods.
  - Criada tabela `historical_periods` (idempotente, RLS).
  - Importador reescrito: não cria appointments fictícios.
  - Upsert idempotente dos períodos ago/set/out 2026.
- [ ] Import idempotently and verify persisted monthly totals; blocked by the data discrepancy and unavailable database access.
  - Código de upsert + soma de conferência implementado. Verificação no banco depende de acesso real.
