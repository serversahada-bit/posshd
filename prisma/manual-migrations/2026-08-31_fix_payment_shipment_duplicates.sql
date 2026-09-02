-- Fix for: duplicate/orphaned rows in payment & shipment tables causing mismatched
-- Excel exports (Edit -> Simpan -> Export). See conversation history for the investigation.
--
-- BEFORE RUNNING ON PRODUCTION:
--   1. Take a full database backup (mysqldump or equivalent).
--   2. Run the "CHECK" queries below first (read-only) and review the counts/rows returned.
--      They will NOT match any row that belongs to a live order — a row only shows up here
--      if its order_id points to nothing in the corresponding orders table.
--   3. Only proceed to the DELETE/ALTER statements once you're comfortable with what the
--      CHECK queries returned. If the counts are unexpectedly huge, stop and investigate
--      instead of deleting.
--
-- This script was written and dry-run against the local dev database on 2026-08-31, where it
-- found ~46 orphaned shipments_crm rows and ~45 orphaned payments_crm rows (order_crm rows that
-- had been deleted directly in the database at some point, since this app has no delete-order
-- feature) and cleaned them up before adding the constraints below. Numbers on production will
-- likely differ — that's expected and fine, re-run the CHECK step there to see production's own
-- numbers before deleting.

-- ============================================================
-- STEP 1 (read-only) — see how many orphaned rows exist today.
-- ============================================================
SELECT 'shipments_crm orphans' AS what, COUNT(*) AS total
FROM shipments_crm s LEFT JOIN orders_crm o ON o.id = s.order_id WHERE o.id IS NULL
UNION ALL
SELECT 'payments_crm orphans', COUNT(*)
FROM payments_crm p LEFT JOIN orders_crm o ON o.id = p.order_id WHERE o.id IS NULL
UNION ALL
SELECT 'shipments duplicates (order_id)', COUNT(*) FROM (
  SELECT order_id FROM shipments GROUP BY order_id HAVING COUNT(*) > 1
) x
UNION ALL
SELECT 'shipments_cso duplicates (order_id)', COUNT(*) FROM (
  SELECT order_id FROM shipments_cso GROUP BY order_id HAVING COUNT(*) > 1
) x
UNION ALL
SELECT 'shipments_crm duplicates (order_id)', COUNT(*) FROM (
  SELECT order_id FROM shipments_crm GROUP BY order_id HAVING COUNT(*) > 1
) x
UNION ALL
SELECT 'payments duplicates (order_id)', COUNT(*) FROM (
  SELECT order_id FROM payments GROUP BY order_id HAVING COUNT(*) > 1
) x
UNION ALL
SELECT 'payments_cso duplicates (order_id)', COUNT(*) FROM (
  SELECT order_id FROM payments_cso GROUP BY order_id HAVING COUNT(*) > 1
) x
UNION ALL
SELECT 'payments_crm duplicates (order_id)', COUNT(*) FROM (
  SELECT order_id FROM payments_crm GROUP BY order_id HAVING COUNT(*) > 1
) x;

-- If any of the "duplicates" counts above are > 0, STOP — those are duplicate rows on a LIVE
-- order (not orphans) and need manual review (which row to keep) before the UNIQUE constraints
-- in step 3 can be added. This did not happen on the local dev database, but check production
-- separately since it has its own history.

-- ============================================================
-- STEP 2 — delete orphaned rows (order_id that matches no live order).
-- Safe by construction: a row can only match this condition if there is truly no order row
-- for it to belong to, so no data belonging to a real/live order is touched here.
-- ============================================================
DELETE s FROM shipments_crm s LEFT JOIN orders_crm o ON o.id = s.order_id WHERE o.id IS NULL;
DELETE p FROM payments_crm p LEFT JOIN orders_crm o ON o.id = p.order_id WHERE o.id IS NULL;

-- ============================================================
-- STEP 3 — close the referential-integrity gap: payments_crm/shipments_crm never had a
-- foreign key to orders_crm (unlike their CSO counterparts), which is how orphans could
-- accumulate silently with nothing cleaning them up. Add it, mirroring the CSO pattern.
-- ============================================================
ALTER TABLE payments_crm
  ADD CONSTRAINT fk_payments_crm_order FOREIGN KEY (order_id) REFERENCES orders_crm(id)
  ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE shipments_crm
  ADD CONSTRAINT fk_shipments_crm_order FOREIGN KEY (order_id) REFERENCES orders_crm(id)
  ON DELETE CASCADE ON UPDATE RESTRICT;

-- ============================================================
-- STEP 4 — add a UNIQUE constraint on order_id across all six payment/shipment tables so a
-- duplicate row for the same order becomes impossible to insert at the database level, not
-- just something the application code tries to avoid. This is what makes the export queries'
-- plain LEFT JOIN safe (at most one matching row per order, so no duplicated Excel rows).
-- ============================================================
ALTER TABLE payments      ADD CONSTRAINT uq_payments_order_id      UNIQUE (order_id);
ALTER TABLE payments_cso  ADD CONSTRAINT uq_payments_cso_order_id  UNIQUE (order_id);
ALTER TABLE payments_crm  ADD CONSTRAINT uq_payments_crm_order_id  UNIQUE (order_id);
ALTER TABLE shipments     ADD CONSTRAINT uq_shipments_order_id     UNIQUE (order_id);
ALTER TABLE shipments_cso ADD CONSTRAINT uq_shipments_cso_order_id UNIQUE (order_id);
ALTER TABLE shipments_crm ADD CONSTRAINT uq_shipments_crm_order_id UNIQUE (order_id);
