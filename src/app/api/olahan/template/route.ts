import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';

import prisma from '@/lib/db';

export const dynamic = 'force-dynamic';

type TemplateRow = {
  order_id: number;
  order_code: string;
  order_status: string;
  created_at: Date;
  source_table: string;
};

const buildCondition = (payload: { startDate?: string; endDate?: string; status?: string; selectedIds?: string }) => {
  const { startDate, endDate, status, selectedIds } = payload;
  let conditionQuery = '';
  const params: Array<string | number> = [];

  if (selectedIds && selectedIds.trim() !== '') {
    const tokens = selectedIds.split(',').map((item) => item.trim()).filter(Boolean);
    const pairConditions: string[] = [];

    for (const token of tokens) {
      if (!token.includes(':')) {
        continue;
      }

      const [sourceTable, orderIdStr] = token.split(':').map((item) => item.trim());
      const source = sourceTable.toUpperCase();
      const orderId = Number(orderIdStr);

      if (['CSO', 'CSO_AUTO', 'CRM'].includes(source) && orderId > 0) {
        pairConditions.push('(source_table = ? AND order_id = ?)');
        params.push(source, orderId);
      }
    }

    conditionQuery += pairConditions.length > 0 ? ` AND (${pairConditions.join(' OR ')})` : ' AND 1=0';
    return { conditionQuery, params };
  }

  if (startDate) {
    conditionQuery += ' AND DATE(created_at) >= ?';
    params.push(startDate);
  }
  if (endDate) {
    conditionQuery += ' AND DATE(created_at) <= ?';
    params.push(endDate);
  }
  if (status) {
    conditionQuery += ' AND order_status = ?';
    params.push(status);
  }

  return { conditionQuery, params };
};

export async function POST(request: Request) {
  try {
    const body = await request.json() as { startDate?: string; endDate?: string; status?: string; selectedIds?: string };
    const { conditionQuery, params } = buildCondition(body);

    const query = `
      SELECT * FROM (
        SELECT o.id as order_id, o.order_code, o.order_status, o.created_at, 'CSO' as source_table
        FROM orders o
        LEFT JOIN payments p ON o.id = p.order_id
        WHERE (p.payment_method IS NULL OR p.payment_method != 'bank_transfer' OR p.payment_status = 'paid')

        UNION ALL

        SELECT o.id as order_id, o.order_code, o.order_status, o.created_at, 'CSO_AUTO' as source_table
        FROM orders_cso o
        LEFT JOIN payments_cso p ON o.id = p.order_id
        WHERE (p.payment_method IS NULL OR p.payment_method != 'bank_transfer' OR p.payment_status = 'paid')

        UNION ALL

        SELECT o.id as order_id, o.order_code, o.order_status, o.created_at, 'CRM' as source_table
        FROM orders_crm o
        LEFT JOIN payments_crm p ON o.id = p.order_id
        WHERE (p.payment_method IS NULL OR p.payment_method != 'bank_transfer' OR p.payment_status = 'paid')
      ) as combined_orders
      WHERE 1=1 ${conditionQuery}
      ORDER BY created_at DESC
    `;

    const orders = await prisma.$queryRawUnsafe<TemplateRow[]>(query, ...params);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Template Status');
    
    // Setup Column Widths and Keys
    worksheet.columns = [
      { header: 'order_id', key: 'order_id', width: 25 },
      { header: 'status', key: 'status', width: 20 },
      { header: 'timestamp', key: 'timestamp', width: 25 },
      { header: 'shipment_receipt', key: 'shipment_receipt', width: 35 },
    ];

    // Style Header Row
    const headerRow = worksheet.getRow(1);
    headerRow.height = 25;
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF6366F1' }, // Tailwind Indigo 500
      };
      cell.font = {
        bold: true,
        color: { argb: 'FFFFFFFF' }, // White
        size: 12,
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: 'center',
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF4F46E5' } }, // Tailwind Indigo 600
        bottom: { style: 'thin', color: { argb: 'FF4F46E5' } },
        left: { style: 'thin', color: { argb: 'FF4F46E5' } },
        right: { style: 'thin', color: { argb: 'FF4F46E5' } },
      };
    });

    // Freeze header row
    worksheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];

    // Populate Data and Style Data Rows
    orders.forEach((order, index) => {
      const row = worksheet.addRow({
        order_id: order.order_code,
        status: order.order_status,
        timestamp: order.created_at,
        shipment_receipt: '',
      });

      const isEven = index % 2 === 0;

      row.eachCell((cell, colNumber) => {
        // Alternating background colors
        if (isEven) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF9FAFB' }, // Tailwind Gray 50
          };
        }

        cell.alignment = {
          vertical: 'middle',
          horizontal: colNumber === 3 ? 'center' : 'left',
          indent: colNumber === 3 ? 0 : 1, // Add little padding for left aligned text
        };

        // Format Date for timestamp
        if (colNumber === 3) {
          cell.numFmt = 'dd/mm/yyyy hh:mm:ss';
        }

        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE5E7EB' } }, // Tailwind Gray 200
          bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        };
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="Template_Update_Status.xlsx"`,
      },
    });
  } catch (error: unknown) {
    console.error('[API /olahan/template POST]', error);
    return NextResponse.json({ status: 'error', message: error instanceof Error ? error.message : 'Gagal membuat template status' }, { status: 500 });
  }
}
