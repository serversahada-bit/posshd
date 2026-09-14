CREATE TABLE cod_reconciliations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  courier_name VARCHAR(100) NULL,
  file_name VARCHAR(255) NULL,
  total_rows INT NOT NULL DEFAULT 0,
  matched_count INT NOT NULL DEFAULT 0,
  mismatch_count INT NOT NULL DEFAULT 0,
  not_found_count INT NOT NULL DEFAULT 0,
  created_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cod_reconciliations_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE cod_reconciliation_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  reconciliation_id INT NOT NULL,
  tracking_number VARCHAR(100) NOT NULL,
  reported_amount BIGINT UNSIGNED NOT NULL DEFAULT 0,
  expected_amount BIGINT UNSIGNED NULL,
  difference BIGINT NULL,
  order_code VARCHAR(50) NULL,
  source_table VARCHAR(20) NULL,
  status ENUM('matched', 'mismatch', 'not_found') NOT NULL DEFAULT 'not_found',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cod_reconciliation_items_batch FOREIGN KEY (reconciliation_id) REFERENCES cod_reconciliations(id) ON DELETE CASCADE ON UPDATE RESTRICT,
  INDEX idx_cod_reconciliation_items_tracking (tracking_number)
);
