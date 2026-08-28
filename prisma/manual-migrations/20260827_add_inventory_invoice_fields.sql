ALTER TABLE inventory_adjustments
  ADD COLUMN invoice_note VARCHAR(255) NULL AFTER reason,
  ADD COLUMN invoice_proof_url VARCHAR(255) NULL AFTER invoice_note;
