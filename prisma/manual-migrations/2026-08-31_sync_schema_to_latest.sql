-- AlterTable
ALTER TABLE `shipments` ADD COLUMN `weight_multiplier` SMALLINT UNSIGNED NULL;

-- AlterTable
ALTER TABLE `shipments_crm` ADD COLUMN `weight_multiplier` SMALLINT UNSIGNED NULL;

-- AlterTable
ALTER TABLE `shipments_cso` ADD COLUMN `weight_multiplier` SMALLINT UNSIGNED NULL;

-- AlterTable
ALTER TABLE `warehouse_gift_stock` ADD COLUMN `bad_stock` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `warehouse_stock` ADD COLUMN `bad_stock` INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `cod_reconciliations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `courier_name` VARCHAR(100) NULL,
    `file_name` VARCHAR(255) NULL,
    `total_rows` INTEGER NOT NULL DEFAULT 0,
    `matched_count` INTEGER NOT NULL DEFAULT 0,
    `mismatch_count` INTEGER NOT NULL DEFAULT 0,
    `not_found_count` INTEGER NOT NULL DEFAULT 0,
    `created_by` INTEGER NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `fk_cod_reconciliations_user`(`created_by`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cod_reconciliation_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `reconciliation_id` INTEGER NOT NULL,
    `tracking_number` VARCHAR(100) NOT NULL,
    `reported_amount` BIGINT UNSIGNED NOT NULL DEFAULT 0,
    `expected_amount` BIGINT UNSIGNED NULL,
    `difference` BIGINT NULL,
    `order_code` VARCHAR(50) NULL,
    `source_table` VARCHAR(20) NULL,
    `status` ENUM('matched', 'mismatch', 'not_found') NOT NULL DEFAULT 'not_found',
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `fk_cod_reconciliation_items_batch`(`reconciliation_id`),
    INDEX `idx_cod_reconciliation_items_tracking`(`tracking_number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `crm_data_distributions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `entry_date` DATE NOT NULL,
    `total_data` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `created_by` INTEGER NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `crm_data_distributions_entry_date_key`(`entry_date`),
    INDEX `fk_crm_data_distributions_user`(`created_by`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inventory_adjustments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `item_type` ENUM('product', 'gift') NOT NULL,
    `item_id` INTEGER NOT NULL,
    `stock_type` ENUM('good', 'bad') NOT NULL DEFAULT 'good',
    `warehouse_id` INTEGER NOT NULL,
    `quantity_before` INTEGER NOT NULL,
    `quantity_change` INTEGER NOT NULL,
    `quantity_after` INTEGER NOT NULL,
    `reason` VARCHAR(255) NULL,
    `invoice_note` VARCHAR(255) NULL,
    `invoice_proof_url` VARCHAR(255) NULL,
    `created_by` INTEGER NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_inventory_adjustments_item`(`item_type`, `item_id`),
    INDEX `fk_inventory_adjustments_warehouse`(`warehouse_id`),
    INDEX `fk_inventory_adjustments_user`(`created_by`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `cod_reconciliations` ADD CONSTRAINT `fk_cod_reconciliations_user` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cod_reconciliation_items` ADD CONSTRAINT `fk_cod_reconciliation_items_batch` FOREIGN KEY (`reconciliation_id`) REFERENCES `cod_reconciliations`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `crm_data_distributions` ADD CONSTRAINT `fk_crm_data_distributions_user` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_adjustments` ADD CONSTRAINT `fk_inventory_adjustments_warehouse` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `inventory_adjustments` ADD CONSTRAINT `fk_inventory_adjustments_user` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

