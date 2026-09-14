-- Adds "Tanggal Cair" support: a per-tracking-number disbursement date read from an optional
-- column in the courier's own report (picked via a new "Kolom Tanggal Cair" dropdown on
-- /reconsil_cod), stored per reconciliation item, and surfaced as a new "Tanggal Cair" column
-- at the end of the Data Lengkap Customer export.
--
-- Purely additive (two new nullable columns) — safe to run any time.

ALTER TABLE cod_reconciliation_items
  ADD COLUMN disbursed_at DATE NULL AFTER status;

ALTER TABLE cod_courier_column_mappings
  ADD COLUMN disbursed_at_header VARCHAR(255) NULL AFTER amount_header;
