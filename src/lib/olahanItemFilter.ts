// Filter "Produk Utama" dan "Hadiah" untuk Data Pesanan (/olahan), dipakai bersama oleh
// /api/olahan, /api/olahan/export, dan /api/olahan/template supaya hasil tampilan = hasil ekspor.
//
// Aturan pencocokan:
//   - Sifatnya "mengandung", item lain di order tidak memengaruhi hasil.
//   - Mode 'all' (bawaan): order harus memuat SEMUA item yang dipilih di satu filter.
//     Mode 'any': order cukup memuat SALAH SATU. Mode berlaku untuk Produk Utama dan Hadiah sekaligus.
//   - Filter Produk Utama dan Hadiah digabung dengan AND.
//   - Produk Utama dicocokkan lewat product_id (item bundling sudah dipecah per komponen dengan
//     product_id asli, jadi ikut ketemu). Hadiah tidak menyimpan ID — hanya nama saat order dibuat
//     (is_gift = 1, product_id NULL) — jadi dicocokkan lewat nama.

export type ItemMatchMode = 'all' | 'any';

export type OrderItemFilters = {
  productIds: string[];
  giftNames: string[];
  matchMode?: ItemMatchMode;
};

export const parseItemMatchMode = (value: unknown): ItemMatchMode => (value === 'any' ? 'any' : 'all');

// Tabel item yang dibaca per source_table, sama dengan yang dipakai kolom "Produk" di /api/olahan.
const ITEM_TABLES_BY_SOURCE: Record<string, string[]> = {
  CSO: ['order_items', 'order_items_resend'],
  CSO_AUTO: ['order_items_cso'],
  CRM: ['order_items_crm'],
};

const buildExistsForSources = (orderIdColumn: string, itemCondition: string, itemParams: Array<string | number>, params: Array<string | number>) => {
  const perSource = Object.entries(ITEM_TABLES_BY_SOURCE).map(([sourceTable, tables]) => {
    const exists = tables.map((table) => {
      params.push(...itemParams);
      return `EXISTS (SELECT 1 FROM ${table} i WHERE i.order_id = ${orderIdColumn} AND ${itemCondition})`;
    });

    return `(combined_orders.source_table = '${sourceTable}' AND (${exists.join(' OR ')}))`;
  });

  return `(${perSource.join(' OR ')})`;
};

// `orderIdColumn` = kolom id order di hasil UNION (berbeda antar endpoint: `order_id` atau `id`).
// Mengembalikan potongan " AND ..." beserta params-nya, dalam urutan yang sama dengan teks SQL.
export function buildOrderItemFilterCondition(filters: OrderItemFilters, orderIdColumn: string) {
  const params: Array<string | number> = [];
  let conditionQuery = '';
  const matchMode = filters.matchMode ?? 'all';

  // Mode 'any' = satu pengecekan dengan IN (...); mode 'all' = satu pengecekan per item, digabung AND.
  const appendFilter = (values: Array<string | number>, buildItemCondition: (placeholders: string) => string) => {
    const groups = matchMode === 'all' ? values.map((value) => [value]) : [values];

    for (const group of groups) {
      const placeholders = group.map(() => '?').join(',');
      conditionQuery += ` AND ${buildExistsForSources(orderIdColumn, buildItemCondition(placeholders), group, params)}`;
    }
  };

  if (filters.productIds.length > 0) {
    const productIds = [...new Set(filters.productIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))];

    if (productIds.length === 0) {
      conditionQuery += ' AND 1=0';
    } else {
      appendFilter(productIds, (placeholders) => `(i.is_gift IS NULL OR i.is_gift = 0) AND i.product_id IN (${placeholders})`);
    }
  }

  if (filters.giftNames.length > 0) {
    appendFilter([...new Set(filters.giftNames)], (placeholders) => `i.is_gift = 1 AND i.product_name IN (${placeholders})`);
  }

  return { conditionQuery, params };
}
