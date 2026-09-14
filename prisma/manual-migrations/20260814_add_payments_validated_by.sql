ALTER TABLE payments
  ADD COLUMN validated_by INT NULL AFTER reject_reason,
  ADD CONSTRAINT fk_payments_validated_by FOREIGN KEY (validated_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE payments_cso
  ADD COLUMN validated_by INT NULL AFTER reject_reason,
  ADD CONSTRAINT fk_payments_cso_validated_by FOREIGN KEY (validated_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE payments_crm
  ADD COLUMN validated_by INT NULL AFTER reject_reason,
  ADD CONSTRAINT fk_payments_crm_validated_by FOREIGN KEY (validated_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;
