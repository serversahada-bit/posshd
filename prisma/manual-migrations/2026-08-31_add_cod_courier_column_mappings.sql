-- Adds the table backing the "remember column mapping per courier" feature on
-- /reconsil_cod: after picking No Resi / Nominal COD columns for a courier once, the
-- next upload for that same courier auto-selects the same columns instead of relying
-- purely on generic keyword guessing.
--
-- Purely additive (new table, no changes to existing tables) — safe to run any time,
-- no need to coordinate with a specific deploy window like the other migrations here.

CREATE TABLE IF NOT EXISTS cod_courier_column_mappings (
  id INT NOT NULL AUTO_INCREMENT,
  courier_name VARCHAR(100) NOT NULL,
  resi_header VARCHAR(255) NOT NULL,
  amount_header VARCHAR(255) NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cod_courier_column_mappings_courier (courier_name)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
