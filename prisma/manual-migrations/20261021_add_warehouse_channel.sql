-- Gudang diaktifkan per jenis pesanan: order_channels berisi daftar dipisah koma dari
-- akuisisi, cso, crm, resend, endorse. Gudang hanya muncul di form Buat Pesanan yang tercantum.
-- shipping_origin = asal tarif ongkir (madiun/bekasi/jakarta); sebelumnya dipetakan hardcode
-- per ID gudang di src/lib/shippingRates.ts, sekarang bisa diatur per gudang.
ALTER TABLE warehouses
  ADD COLUMN order_channels VARCHAR(100) NOT NULL DEFAULT 'akuisisi,cso,crm,resend' AFTER code,
  ADD COLUMN shipping_origin VARCHAR(20) NULL AFTER order_channels;

UPDATE warehouses SET shipping_origin = 'madiun' WHERE id IN (1, 2, 5) AND shipping_origin IS NULL;
UPDATE warehouses SET shipping_origin = 'bekasi' WHERE id = 3 AND shipping_origin IS NULL;
UPDATE warehouses SET shipping_origin = 'jakarta' WHERE id = 4 AND shipping_origin IS NULL;
