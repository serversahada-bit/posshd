CREATE TABLE inventory_adjustments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  item_type ENUM('product', 'gift') NOT NULL,
  item_id INT NOT NULL,
  warehouse_id INT NOT NULL,
  quantity_before INT NOT NULL,
  quantity_change INT NOT NULL,
  quantity_after INT NOT NULL,
  reason VARCHAR(255) NULL,
  created_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_inventory_adjustments_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT fk_inventory_adjustments_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  INDEX idx_inventory_adjustments_item (item_type, item_id)
);
