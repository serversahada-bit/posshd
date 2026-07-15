import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import ExcelJS from 'exceljs';

export const dynamic = 'force-dynamic';

async function hasColumn(tableName: string, columnName: string) {
  const rows = await prisma.$queryRaw<Array<{ total: bigint | number }>>`
    SELECT COUNT(*) AS total
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ${tableName}
      AND COLUMN_NAME = ${columnName}
  `;

  return Number(rows[0]?.total || 0) > 0;
}

const toSafeNumber = (value: unknown): number => {
  if (typeof value === 'bigint') {
    return Number(value);
  }

  return Number(value || 0);
};

const toSafeString = (value: unknown): string => {
  if (value == null) {
    return '';
  }

  return typeof value === 'bigint' ? value.toString() : String(value);
};

const toExcelValue = (value: unknown): string | number | Date => {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === 'bigint') {
    const numeric = Number(value);
    return Number.isSafeInteger(numeric) ? numeric : value.toString();
  }

  if (typeof value === 'number' || typeof value === 'string') {
    return value;
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (value == null) {
    return '';
  }

  return String(value);
};

const EXCEL_TIME_ZONE = 'Asia/Jakarta';

const toDateObject = (value: unknown): Date | null => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDateParts = (value: unknown): Record<'day' | 'month' | 'year' | 'hour' | 'minute', string> | null => {
  const date = toDateObject(value);
  if (!date) {
    return null;
  }

  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: EXCEL_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const map = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));

  return {
    day: map.day || '00',
    month: map.month || '00',
    year: map.year || '0000',
    hour: map.hour || '00',
    minute: map.minute || '00',
  };
};

const formatExcelDate = (value: unknown): string => {
  const parts = formatDateParts(value);
  if (!parts) {
    return '';
  }

  return `${parts.day}/${parts.month}/${parts.year}`;
};

const formatExcelDateTime = (value: unknown): string => {
  const parts = formatDateParts(value);
  if (!parts) {
    return '';
  }

  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { startDate, endDate, status, creatorName, selectedIds } = body;

    const [ordersCsoHasAdvertiser, ordersCsoHasAdSource, ordersCrmHasAdvertiser, ordersCrmHasAdSource] = await Promise.all([
      hasColumn('orders_cso', 'advertiser_name'),
      hasColumn('orders_cso', 'ad_source'),
      hasColumn('orders_crm', 'advertiser_name'),
      hasColumn('orders_crm', 'ad_source'),
    ]);

    const ordersCsoAdvertiserSelect = ordersCsoHasAdvertiser ? 'o.advertiser_name' : 'NULL';
    const ordersCsoAdSourceSelect = ordersCsoHasAdSource ? 'o.ad_source' : 'NULL';
    const ordersCrmAdvertiserSelect = ordersCrmHasAdvertiser ? 'o.advertiser_name' : 'NULL';
    const ordersCrmAdSourceSelect = ordersCrmHasAdSource ? 'o.ad_source' : 'NULL';

    let conditionQuery = '';
    const params: any[] = [];

    // Parse Selected IDs
    if (selectedIds && selectedIds.trim() !== '') {
      const tokens = selectedIds.split(',').map((t: string) => t.trim()).filter(Boolean);
      const pairConditions: string[] = [];

      for (const token of tokens) {
        if (token.includes(':')) {
          const [sourceTable, orderIdStr] = token.split(':').map((s: string) => s.trim());
          const sTable = sourceTable.toUpperCase();
          const orderId = parseInt(orderIdStr, 10);
          if (['CSO', 'CSO_AUTO', 'CRM'].includes(sTable) && orderId > 0) {
            pairConditions.push(`(source_table = ? AND id = ?)`);
            params.push(sTable, orderId);
          }
        } else {
          const orderId = parseInt(token, 10);
          if (orderId > 0) {
            pairConditions.push(`id = ?`);
            params.push(orderId);
          }
        }
      }

      if (pairConditions.length > 0) {
        conditionQuery += ` AND (${pairConditions.join(' OR ')})`;
      } else {
        conditionQuery += ` AND 1=0`;
      }
    } else {
      if (startDate) {
        conditionQuery += ` AND DATE(created_at) >= ?`;
        params.push(startDate);
      }
      if (endDate) {
        conditionQuery += ` AND DATE(created_at) <= ?`;
        params.push(endDate);
      }
      if (status) {
        conditionQuery += ` AND order_status = ?`;
        params.push(status);
      }
      if (creatorName) {
        conditionQuery += ` AND creator_name = ?`;
        params.push(creatorName);
      }
    }

    const rawQuery = `
      SELECT * FROM (
          SELECT 
              o.id, o.order_code, o.customer_id, o.created_at, o.updated_at, 
              o.total_product_price, o.shipping_cost, o.total_payment, o.product_discount, o.other_fee,
              o.additional_shipping_cost,
              o.order_status, o.notes, o.promo_id, o.warehouse_id,
              o.advertiser_name, o.ad_source,
              c.name as customer_name, c.whatsapp_number, c.email, c.address, c.subdistrict, c.age, c.complaint,
              p.payment_method,
              s.courier_name, s.courier_service, s.tracking_number, s.total_weight_gram,
              w.warehouse_name,
              w.code as warehouse_code,
              0 as is_ro, 0 as ro_count,
              'CSO' as source_table,
              COALESCE(NULLIF(cu.email, ''), NULLIF(cu.name, ''), (SELECT COALESCE(NULLIF(u.email, ''), NULLIF(u.name, '')) FROM activity_logs a JOIN users u ON a.user_id = u.id WHERE a.details LIKE CONCAT('%(Order: ', o.order_code, ',%') OR a.details LIKE CONCAT('%(Order: ', o.order_code, ')%') ORDER BY a.id DESC LIMIT 1), 'User') as creator_name
          FROM orders o
          LEFT JOIN customers c ON o.customer_id = c.id
          LEFT JOIN payments p ON o.id = p.order_id
          LEFT JOIN shipments s ON o.id = s.order_id
          LEFT JOIN warehouses w ON COALESCE(s.warehouse_id, o.warehouse_id) = w.id
          LEFT JOIN users cu ON cu.id = o.created_by_user_id
          
          UNION ALL
          
          SELECT 
              o.id, o.order_code, o.customer_id, o.created_at, o.updated_at, 
              o.total_product_price, o.shipping_cost, o.total_payment, o.product_discount, o.other_fee,
              o.additional_shipping_cost,
              o.order_status, o.notes, o.promo_id, o.warehouse_id,
              ${ordersCsoAdvertiserSelect} as advertiser_name, ${ordersCsoAdSourceSelect} as ad_source,
              c.name as customer_name, c.whatsapp_number, c.email, c.address, c.subdistrict, c.age, c.complaint,
              p.payment_method,
              s.courier_name, s.courier_service, s.tracking_number, s.total_weight_gram,
              w.warehouse_name,
              w.code as warehouse_code,
              COALESCE(o.is_ro, 0) as is_ro, COALESCE(o.ro_count, 0) as ro_count,
              'CSO_AUTO' as source_table,
              COALESCE(NULLIF(cu.email, ''), NULLIF(cu.name, ''), (SELECT COALESCE(NULLIF(u.email, ''), NULLIF(u.name, '')) FROM activity_logs a JOIN users u ON a.user_id = u.id WHERE a.details LIKE CONCAT('%(Order: ', o.order_code, ',%') OR a.details LIKE CONCAT('%(Order: ', o.order_code, ')%') ORDER BY a.id DESC LIMIT 1), 'User') as creator_name
          FROM orders_cso o
          LEFT JOIN customers c ON o.customer_id = c.id
          LEFT JOIN payments_cso p ON o.id = p.order_id
          LEFT JOIN shipments_cso s ON o.id = s.order_id
          LEFT JOIN warehouses w ON COALESCE(s.warehouse_id, o.warehouse_id) = w.id
          LEFT JOIN users cu ON cu.id = o.created_by_user_id

          UNION ALL
          
          SELECT 
              o.id, o.order_code, o.customer_id, o.created_at, o.updated_at, 
              o.total_product_price, o.shipping_cost, o.total_payment, o.product_discount, o.other_fee,
              o.additional_shipping_cost,
              o.order_status, o.notes, o.promo_id, o.warehouse_id,
              ${ordersCrmAdvertiserSelect} as advertiser_name, ${ordersCrmAdSourceSelect} as ad_source,
              c.name as customer_name, c.whatsapp_number, c.email, c.address, c.subdistrict, c.age, c.complaint,
              p.payment_method,
              s.courier_name, s.courier_service, s.tracking_number, s.total_weight_gram,
              w.warehouse_name,
              w.code as warehouse_code,
              COALESCE(o.is_ro, 0) as is_ro, COALESCE(o.ro_count, 0) as ro_count,
              'CRM' as source_table,
              COALESCE(NULLIF(cu.email, ''), NULLIF(cu.name, ''), (SELECT COALESCE(NULLIF(u.email, ''), NULLIF(u.name, '')) FROM activity_logs a JOIN users u ON a.user_id = u.id WHERE a.details LIKE CONCAT('%(Order: ', o.order_code, ',%') OR a.details LIKE CONCAT('%(Order: ', o.order_code, ')%') ORDER BY a.id DESC LIMIT 1), 'User') as creator_name
          FROM orders_crm o
          LEFT JOIN customers c ON o.customer_id = c.id
          LEFT JOIN payments_crm p ON o.id = p.order_id
          LEFT JOIN shipments_crm s ON o.id = s.order_id
          LEFT JOIN warehouses w ON COALESCE(s.warehouse_id, o.warehouse_id) = w.id
          LEFT JOIN users cu ON cu.id = o.created_by_user_id
      ) as combined_orders
      WHERE 1=1 ${conditionQuery}
      ORDER BY created_at DESC
    `;

    const orders: any[] = await prisma.$queryRawUnsafe(rawQuery, ...params);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = '';
    const worksheet = workbook.addWorksheet('Sheet1');

    const headers = [
      'Tanggal Proses', 'No Resi', 'Timestamp', 'Unique Code', 'Data Lengkap Pesanan Pembeli', 
      'FIRST NAME', 'CONTACT*', 'Desa', 'kota/kabupaten', 'kecamatan', 'Provinsi', 'BERAT', 
      'JUMLAH BARANG', 'Harga Barang', 'HADIAH / BONUS', 'ISI PAKET', 'COD VALUE', 'Keterangan', 
      'Ekspedisi', 'Tipe Pembayaran', 'Bukti Transfer Paket Non COD', 'Usia Customer', 
      'Keluhan / Penyakit Customer', 'Keterangan Ninja', 
      'product_name_1st', 'product_qty_1st', 'product_price_1st', 
      'product_name_2nd', 'product_qty_2nd', 'product_price_2nd', 
      'product_name_3rd', 'product_qty_3rd', 'product_price_3rd', 
      'product_name_4rd', 'product_qty_4rd', 'product_price_4rd', 
      'product_name_5rd', 'product_qty_5rd', 'product_price_5rd'
    ];

    const headerRow = worksheet.addRow(headers);
    headerRow.eachCell((cell) => {
      cell.font = {
        name: 'Calibri',
        family: 2,
        size: 10,
        bold: true,
      };
    });

    const promoCache: Record<string, string> = {};

    for (const order of orders) {
      let itemsTable = 'order_items';
      if (order.source_table === 'CRM') itemsTable = 'order_items_crm';
      else if (order.source_table === 'CSO_AUTO') itemsTable = 'order_items_cso';

      const items: any[] = await prisma.$queryRawUnsafe(`
        SELECT oi.product_name, oi.qty, oi.price, oi.discount, oi.is_gift, oi.is_bundle, p.product_code 
        FROM ${itemsTable} oi
        LEFT JOIN products p ON oi.product_id = p.id AND (oi.is_gift IS NULL OR oi.is_gift = 0) AND (oi.is_bundle IS NULL OR oi.is_bundle = 0)
        WHERE oi.order_id = ?
      `, order.id);

      const productItems = [];
      const giftItems = [];
      let totalQty = 0;

      for (const item of items) {
        if (item.is_gift) {
          giftItems.push(item);
        } else {
          productItems.push(item);
          totalQty += Number(item.qty);
        }
      }

      // --- ISI PAKET ---
      const paketParts = productItems.map(pi => `${pi.qty}_${pi.product_code || pi.product_name}`);
      let productString = paketParts.join('_');

      if (order.source_table === 'CRM' && productString) {
        productString = 'R-' + productString;
      } else if ((order.source_table === 'CSO' || order.source_table === 'CSO_AUTO') && productString) {
        productString = 'S-' + productString;
      }

      const hadiahParts = giftItems.map(gi => `${gi.qty}_${gi.product_name}`);
      const hadiahStr = hadiahParts.length > 0 ? hadiahParts.join('; ') + ';' : '';

      let isiPaketStr = productString;
      if (hadiahStr) {
        isiPaketStr += ' dan ' + hadiahStr;
      }
      isiPaketStr += ' | Kurir Hubungi Dulu Sebelum Antar Lewat Whatsapp | Ketuk Pintu/Gerbang';

      let notesStr = (order.notes || '').trim();
      if (notesStr) {
        notesStr = notesStr.replace(/[\r\n]+/g, ' ');
        isiPaketStr += ' | ' + notesStr;
      }

      // --- Address Parsing ---
      const subdistrictStr = (order.subdistrict || '').trim();
      const parts = subdistrictStr.split(',').map((p: string) => p.trim()).filter(Boolean);
      let kecamatan = '', kotaKab = '', provinsi = '';

      if (parts.length >= 3) {
        const firstPart = parts[0].toUpperCase();
        const provinceHints = ['ACEH', 'SUMATERA', 'RIAU', 'JAMBI', 'BENGKULU', 'LAMPUNG', 'BANTEN', 'JAKARTA', 'DKI', 'JAWA', 'YOGYAKARTA', 'DIY', 'BALI', 'NTB', 'NUSA', 'KALIMANTAN', 'SULAWESI', 'GORONTALO', 'MALUKU', 'PAPUA'];
        const looksLikeProvinceFirst = provinceHints.some(hint => firstPart.includes(hint));

        if (looksLikeProvinceFirst) {
          provinsi = parts[0] || '';
          kotaKab = parts[1] || '';
          kecamatan = parts[2] || '';
        } else {
          kecamatan = parts[0] || '';
          kotaKab = parts[1] || '';
          provinsi = parts[2] || '';
        }
      } else {
        kecamatan = parts[0] || '';
        kotaKab = parts[1] || (order.city || '');
        provinsi = order.province || '';
      }

      let ekspedisi = order.courier_name || '';
      if (ekspedisi && order.courier_service) {
        ekspedisi += ' ' + order.courier_service;
      }

      let berat = 1;
      const weightGram = Number(order.total_weight_gram || 0);
      if (weightGram > 0) {
        berat = Math.ceil(weightGram / 1000);
      }

      let codValue: string | number = '';
      if (order.payment_method === 'cod' || order.payment_method === 'no_payment') {
        codValue = toSafeNumber(order.total_payment);
      }

      const processedAt = order.updated_at || order.created_at || null;
      const tanggalProses = formatExcelDate(processedAt);
      const timestamp = formatExcelDateTime(processedAt);
      const noResiStr = order.tracking_number ? toSafeString(order.tracking_number) : '';

      const usia = order.age != null ? toExcelValue(order.age) : '-';
      const keluhan = order.complaint || '-';

      let addressUpper = (order.address || '').toUpperCase();
      addressUpper = addressUpper.replace(/[:\.]/g, '');

      // Promo
      let promoName = '-';
      if (order.promo_id) {
        const promoIds = order.promo_id.split(',').map((pid: string) => pid.trim()).filter(Boolean);
        const promoNames = [];
        for (const pid of promoIds) {
          if (!promoCache[pid]) {
            const result: any[] = await prisma.$queryRawUnsafe(`SELECT promo_name FROM promos WHERE id = ?`, parseInt(pid, 10));
            promoCache[pid] = result[0]?.promo_name || '-';
          }
          promoNames.push(promoCache[pid]);
        }
        if (promoNames.length > 0) {
          promoName = promoNames.join(', ');
        }
      }

      const csCrm = order.source_table;
      let adv = order.advertiser_name || '';
      if (csCrm === 'CRM') adv = '';
      
      const legacyOtherFee = Number(order.other_fee || 0);
      const fee = Number(order.additional_shipping_cost || 0) > 0
        ? Number(order.additional_shipping_cost || 0)
        : (order.payment_method === 'cod' && legacyOtherFee > 0 ? legacyOtherFee : 0);
      const ro = (order.is_ro == 1) ? (order.ro_count || '') : '';

      let keteranganNinja = '';
      if (order.order_code && order.created_at) {
        const dObj = new Date(order.created_at);
        const y = String(dObj.getFullYear()).slice(-2);
        const m = String(dObj.getMonth() + 1).padStart(2, '0');
        const day = String(dObj.getDate()).padStart(2, '0');
        const h = String(dObj.getHours()).padStart(2, '0');
        const i = String(dObj.getMinutes()).padStart(2, '0');
        const s = String(dObj.getSeconds()).padStart(2, '0');
        keteranganNinja = `${order.order_code}#${y}${m}${day}/${h}${i}${s}`;
      }

      const payLabel = order.payment_method === 'cod' ? 'COD' : (order.payment_method === 'bank_transfer' ? 'transfer' : order.payment_method);
      
      const creatorName = order.creator_name || 'User';
      const sessionUserName = creatorName.replace(/ /g, '.');
      let advName = (order.advertiser_name || '')
        .replace(/\s*-\s*(?=\()/g, '')
        .replace(/\s+/g, '.');
      let advSource = order.ad_source || '';

      if (csCrm === 'CRM') {
        advName = 'CRM';
        if (notesStr.toLowerCase().includes('meta ads')) {
          advSource = 'Meta Ads';
        } else {
          advSource = '';
        }
      }

      let csAdvStr = `${sessionUserName}.${advName}`.replace(/^\.+|\.+$/g, '');
      if (!csAdvStr) csAdvStr = '-';

      const ongkirVal = Number(order.shipping_cost || 0);
      const diskonVal = Number(order.product_discount || 0);

      const roVal = ro ? `RO${ro}` : '-';
      const promoVal = promoName !== '-' ? promoName : '-';

      let advSourcePart = advSource ? ':' + advSource : ':-';
      if (csCrm === 'CRM' && !advSource) {
        advSourcePart = ':-';
      }

      const warehouseCode = (order.warehouse_code || 'J').toString().trim() || 'J';
      const keteranganStr = `${warehouseCode}.${csAdvStr}${advSourcePart}.${ongkirVal}.${fee}.${diskonVal}.${roVal}.${promoVal}`;

      let isiPaketShort = productString;
      if (giftItems.length > 0) {
        const hShort = giftItems.map(gi => `${gi.qty}_${gi.product_name}`);
        isiPaketShort += ` #${hShort.join('; ')}; #`;
      } else {
        isiPaketShort += ' ##';
      }

      const dataLengkap = `"${order.customer_name || ''}" "${order.whatsapp_number || ''}" "${order.address || ''}" "${isiPaketShort}" ${payLabel} : ${ekspedisi} "${order.total_product_price || 0}" "${keteranganStr}" `;

      if (keteranganNinja) {
        keteranganNinja += '$' + keteranganStr;
      }

      let buktiTransfer = '';
      if (['processing', 'ready_to_ship', 'shipped'].includes(order.order_status)) {
        buktiTransfer = 'Process';
      }

      let customerNameMod = order.customer_name || '';
      if (notesStr.includes('[RESEND]')) {
        const match = notesStr.match(/\[OLD:(.*?)\]/);
        if (match && match[1]) {
          customerNameMod += ' - ' + match[1].trim();
        }
      }

      const rowData: any[] = [
        tanggalProses,
        noResiStr, // treated as string by exceljs if string
        timestamp,
        order.order_code,
        dataLengkap,
        customerNameMod,
        order.whatsapp_number ? String(order.whatsapp_number) : '',
        addressUpper,
        kotaKab,
        kecamatan,
        provinsi,
        berat,
        totalQty,
        Number(order.total_product_price),
        hadiahStr,
        isiPaketStr,
        codValue,
        keteranganStr,
        ekspedisi,
        order.payment_method,
        buktiTransfer,
        usia,
        keluhan,
        keteranganNinja
      ];

      const exportItems = [...productItems, ...giftItems];
      for (let i = 0; i < 5; i++) {
        if (exportItems[i]) {
          rowData.push(
            (exportItems[i].product_name || '').toUpperCase(),
            toSafeNumber(exportItems[i].qty),
            (toSafeNumber(exportItems[i].price) - toSafeNumber(exportItems[i].discount || 0)) * toSafeNumber(exportItems[i].qty)
          );
        } else {
          rowData.push('', '', '');
        }
      }

      const outputRow = worksheet.addRow(rowData.map(toExcelValue));
      outputRow.getCell(2).value = noResiStr;
      outputRow.getCell(7).value = order.whatsapp_number ? toSafeString(order.whatsapp_number) : '';
    }

    const referenceWidths = [
      15, 15, 20, 14, 60, 11, 14, 60, 20, 10, 11, 6, 14,
      13, 18, 60, 10, 28, 10, 16, 29, 14, 28, 56, 17, 16,
      18, 17, 16, 18, 17, 16, 18, 17, 16, 18, 17, 16, 18,
    ];
    referenceWidths.forEach((width, index) => {
      worksheet.getColumn(index + 1).width = width;
    });

    const buffer = await workbook.xlsx.writeBuffer();

    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, '0');
    const timestampName = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="Data_Pesanan_Olahan_${timestampName}.xlsx"`
      }
    });

  } catch (error: any) {
    console.error('Error generating export:', error);
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
  }
}



