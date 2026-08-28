ALTER TABLE warehouse_stock
  ADD COLUMN bad_stock INT NOT NULL DEFAULT 0 AFTER stock;

ALTER TABLE warehouse_gift_stock
  ADD COLUMN bad_stock INT NOT NULL DEFAULT 0 AFTER stock;

ALTER TABLE inventory_adjustments
  ADD COLUMN stock_type ENUM('good', 'bad') NOT NULL DEFAULT 'good' AFTER item_id;
