ALTER TABLE orders
  ADD COLUMN scalev_synced_at TIMESTAMP NULL DEFAULT NULL AFTER scalev_order_id;
