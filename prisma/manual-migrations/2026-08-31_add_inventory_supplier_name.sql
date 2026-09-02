-- Adds "Nama Supplier" to the Tambah Inventori flow — a free-text field recorded alongside
-- the existing invoice note/proof, shown on the Riwayat Pergerakan Inventori history table.
--
-- Purely additive (one new nullable column) — safe to run any time.

ALTER TABLE inventory_adjustments
  ADD COLUMN supplier_name VARCHAR(150) NULL AFTER invoice_note;
