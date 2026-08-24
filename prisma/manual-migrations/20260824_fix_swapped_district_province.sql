-- Fixes a bug in the CRM/Resend "pilih pelanggan lama" autofill: the district
-- (kecamatan) and province columns were swapped when building the
-- customer_addresses snapshot for a new order, because the frontend joined
-- [subdistrict, city, province] while the backend always parses the combined
-- string as [province, city, district]. City (middle position) was never
-- affected. Fixed in code on 2026-08-24 (buat_pesanan_crm & buat_pesanan_resend
-- pages); this script repairs already-affected rows.
--
-- Detection heuristic: district contains a known province-name keyword while
-- province does not -- same heuristic already used for address parsing in
-- src/app/api/olahan/export/route.ts.
--
-- IMPORTANT: run the SELECT below first and eyeball the results before
-- running the UPDATE further down. Take a database backup before either.

-- Step 1: preview affected rows (safe, read-only)
SELECT ca.id, ca.district, ca.city, ca.province, 'orders_crm' AS via
FROM customer_addresses ca
INNER JOIN orders_crm o ON o.customer_address_id = ca.id
WHERE ca.district IS NOT NULL
  AND UPPER(ca.district) REGEXP 'ACEH|SUMATERA|RIAU|JAMBI|BENGKULU|LAMPUNG|BANTEN|JAKARTA|DKI|JAWA|YOGYAKARTA|DIY|BALI|NTB|NUSA|KALIMANTAN|SULAWESI|GORONTALO|MALUKU|PAPUA'
  AND UPPER(ca.province) NOT REGEXP 'ACEH|SUMATERA|RIAU|JAMBI|BENGKULU|LAMPUNG|BANTEN|JAKARTA|DKI|JAWA|YOGYAKARTA|DIY|BALI|NTB|NUSA|KALIMANTAN|SULAWESI|GORONTALO|MALUKU|PAPUA'

UNION ALL

SELECT ca.id, ca.district, ca.city, ca.province, 'orders (resend)' AS via
FROM customer_addresses ca
INNER JOIN orders o ON o.customer_address_id = ca.id
WHERE o.notes LIKE '[RESEND]%'
  AND ca.district IS NOT NULL
  AND UPPER(ca.district) REGEXP 'ACEH|SUMATERA|RIAU|JAMBI|BENGKULU|LAMPUNG|BANTEN|JAKARTA|DKI|JAWA|YOGYAKARTA|DIY|BALI|NTB|NUSA|KALIMANTAN|SULAWESI|GORONTALO|MALUKU|PAPUA'
  AND UPPER(ca.province) NOT REGEXP 'ACEH|SUMATERA|RIAU|JAMBI|BENGKULU|LAMPUNG|BANTEN|JAKARTA|DKI|JAWA|YOGYAKARTA|DIY|BALI|NTB|NUSA|KALIMANTAN|SULAWESI|GORONTALO|MALUKU|PAPUA';

-- Step 2: apply the fix (swaps district <-> province on the matched rows only)
UPDATE customer_addresses ca
SET ca.district = ca.province,
    ca.province = ca.district
WHERE ca.id IN (
  SELECT id FROM (
    SELECT ca2.id
    FROM customer_addresses ca2
    INNER JOIN orders_crm o ON o.customer_address_id = ca2.id
    WHERE ca2.district IS NOT NULL
      AND UPPER(ca2.district) REGEXP 'ACEH|SUMATERA|RIAU|JAMBI|BENGKULU|LAMPUNG|BANTEN|JAKARTA|DKI|JAWA|YOGYAKARTA|DIY|BALI|NTB|NUSA|KALIMANTAN|SULAWESI|GORONTALO|MALUKU|PAPUA'
      AND UPPER(ca2.province) NOT REGEXP 'ACEH|SUMATERA|RIAU|JAMBI|BENGKULU|LAMPUNG|BANTEN|JAKARTA|DKI|JAWA|YOGYAKARTA|DIY|BALI|NTB|NUSA|KALIMANTAN|SULAWESI|GORONTALO|MALUKU|PAPUA'

    UNION

    SELECT ca3.id
    FROM customer_addresses ca3
    INNER JOIN orders o2 ON o2.customer_address_id = ca3.id
    WHERE o2.notes LIKE '[RESEND]%'
      AND ca3.district IS NOT NULL
      AND UPPER(ca3.district) REGEXP 'ACEH|SUMATERA|RIAU|JAMBI|BENGKULU|LAMPUNG|BANTEN|JAKARTA|DKI|JAWA|YOGYAKARTA|DIY|BALI|NTB|NUSA|KALIMANTAN|SULAWESI|GORONTALO|MALUKU|PAPUA'
      AND UPPER(ca3.province) NOT REGEXP 'ACEH|SUMATERA|RIAU|JAMBI|BENGKULU|LAMPUNG|BANTEN|JAKARTA|DKI|JAWA|YOGYAKARTA|DIY|BALI|NTB|NUSA|KALIMANTAN|SULAWESI|GORONTALO|MALUKU|PAPUA'
  ) AS affected
);
