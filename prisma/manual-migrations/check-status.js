// Checks which of the SQL files in this folder have actually been applied to whatever
// database DATABASE_URL points to, by inspecting information_schema (tables/columns/constraints)
// instead of relying on a migrations-log table (this project doesn't use `prisma migrate`).
//
// Usage:
//   node prisma/manual-migrations/check-status.js                  -> checks .env / .env.local (local dev DB)
//   DATABASE_URL="mysql://user:pass@host:3306/db" node prisma/manual-migrations/check-status.js  -> checks any DB, e.g. Coolify production
//
// Read-only: only queries information_schema, never touches app data.

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.local'), override: false });

const mysql = require('mysql2/promise');

const migrations = [
  {
    file: '2026-08-31_sync_schema_to_latest.sql',
    checks: [
      { type: 'table', table: 'cod_reconciliations' },
      { type: 'table', table: 'cod_reconciliation_items' },
      { type: 'table', table: 'crm_data_distributions' },
      { type: 'table', table: 'inventory_adjustments' },
      { type: 'column', table: 'shipments', column: 'weight_multiplier' },
      { type: 'column', table: 'shipments_crm', column: 'weight_multiplier' },
      { type: 'column', table: 'shipments_cso', column: 'weight_multiplier' },
      { type: 'column', table: 'warehouse_gift_stock', column: 'bad_stock' },
      { type: 'column', table: 'warehouse_stock', column: 'bad_stock' },
    ],
  },
  {
    file: '2026-08-31_fix_payment_shipment_duplicates.sql',
    warning: 'Also DELETEs orphaned rows before adding these constraints. Run the CHECK queries in the file by hand on production first and take a backup — do not run the whole file blind just because this reports it as missing.',
    checks: [
      { type: 'constraint', table: 'payments_crm', name: 'fk_payments_crm_order' },
      { type: 'constraint', table: 'shipments_crm', name: 'fk_shipments_crm_order' },
      { type: 'constraint', table: 'payments', name: 'uq_payments_order_id' },
      { type: 'constraint', table: 'payments_cso', name: 'uq_payments_cso_order_id' },
      { type: 'constraint', table: 'payments_crm', name: 'uq_payments_crm_order_id' },
      { type: 'constraint', table: 'shipments', name: 'uq_shipments_order_id' },
      { type: 'constraint', table: 'shipments_cso', name: 'uq_shipments_cso_order_id' },
      { type: 'constraint', table: 'shipments_crm', name: 'uq_shipments_crm_order_id' },
    ],
  },
  {
    file: '2026-08-31_add_cod_courier_column_mappings.sql',
    checks: [{ type: 'table', table: 'cod_courier_column_mappings' }],
  },
  {
    file: '2026-08-31_add_disbursed_at.sql',
    checks: [
      { type: 'column', table: 'cod_reconciliation_items', column: 'disbursed_at' },
      { type: 'column', table: 'cod_courier_column_mappings', column: 'disbursed_at_header' },
    ],
  },
  {
    file: '2026-08-31_add_inventory_supplier_name.sql',
    checks: [{ type: 'column', table: 'inventory_adjustments', column: 'supplier_name' }],
  },
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set (checked .env, .env.local, and the shell environment).');
    process.exit(1);
  }

  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  const [[{ db }]] = await conn.query('SELECT DATABASE() AS db');
  console.log(`Checking database: ${db}\n`);

  const tableExists = async (table) => {
    const [rows] = await conn.query(
      `SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`,
      [table]
    );
    return rows.length > 0;
  };

  const columnExists = async (table, column) => {
    const [rows] = await conn.query(
      `SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
      [table, column]
    );
    return rows.length > 0;
  };

  const constraintExists = async (table, name) => {
    const [rows] = await conn.query(
      `SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`,
      [table, name]
    );
    return rows.length > 0;
  };

  let anyMissing = false;

  for (const migration of migrations) {
    const results = await Promise.all(
      migration.checks.map(async (check) => {
        let present;
        let label;
        if (check.type === 'table') {
          present = await tableExists(check.table);
          label = `table ${check.table}`;
        } else if (check.type === 'column') {
          present = await columnExists(check.table, check.column);
          label = `column ${check.table}.${check.column}`;
        } else {
          present = await constraintExists(check.table, check.name);
          label = `constraint ${check.table}.${check.name}`;
        }
        return { label, present };
      })
    );

    const missing = results.filter((r) => !r.present);
    const status = missing.length === 0 ? 'APPLIED' : missing.length === results.length ? 'NOT APPLIED' : 'PARTIALLY APPLIED';
    if (missing.length > 0) anyMissing = true;

    console.log(`[${status}] ${migration.file}`);
    if (migration.warning && missing.length > 0) {
      console.log(`  ⚠️  ${migration.warning}`);
    }
    for (const r of results) {
      console.log(`  ${r.present ? '✓' : '✗'} ${r.label}`);
    }
    console.log('');
  }

  await conn.end();
  process.exit(anyMissing ? 1 : 0);
}

main().catch((err) => {
  console.error('Failed to check migration status:', err.message);
  process.exit(1);
});
