# Historical financial import

- [x] Read the import requirements and verify the supplied weekly totals.
- [x] Check available database access: the existing external connection is not accessible through database tools or managed credentials.
- [ ] Resolve August's R$ 5.00 discrepancy with the user before any financial writes.
- [ ] Confirm August and October week periods, or explicitly retain month/week granularity without invented dates.
- [ ] Obtain access to the existing database and identify the correct account and any existing equivalent records; do not provision a replacement database.
- [ ] Implement only the necessary historical aggregate storage and integrations after confirming the existing live schema; do not fabricate appointments or payment methods.
- [ ] Import idempotently and verify persisted monthly totals; blocked by the data discrepancy and unavailable database access.