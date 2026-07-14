import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { Prisma } from '@prisma/client';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { emitEvent } from '@/lib/socket-server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

const pad2 = (value: number) => String(value).padStart(2, '0');

function getPaymentCode(paymentMethod: string) {
  switch (paymentMethod) {
    case 'cod':
      return 'C';
    case 'bank_transfer':
      return 'B';
    case 'ewallet':
      return 'E';
    case 'free':
      return 'F';
    default:
      return 'X';
  }
}

async function generateOrderCode(tx: Prisma.TransactionClient, payload: { warehouseId: number; courierName: string; paymentMethod: string }) {
  const now = new Date();
  const datePart = `${pad2(now.getFullYear() % 100)}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`;

  const warehouse = Number.isFinite(payload.warehouseId)
    ? await tx.warehouses.findUnique({
        where: { id: payload.warehouseId },
        select: { code: true, warehouse_name: true },
      })
    : null;

  const courier = payload.courierName
    ? await tx.couriers.findFirst({
        where: { courier_name: { equals: payload.courierName } },
        select: { code: true, courier_name: true },
      })
    : null;

  const warehouseCode = (warehouse?.code || warehouse?.warehouse_name || 'X').trim().charAt(0).toUpperCase() || 'X';
  const paymentCode = getPaymentCode(payload.paymentMethod);
  const courierCode = (courier?.code || courier?.courier_name || payload.courierName || 'X').trim().charAt(0).toUpperCase() || 'X';
  const prefix = `${datePart}R${warehouseCode}${paymentCode}${courierCode}`;

  for (let sequence = 1; sequence <= 99; sequence += 1) {
    const candidate = `${prefix}A${pad2(sequence)}`;
    const exists = await tx.orders_crm.findUnique({
      where: { order_code: candidate },
      select: { id: true },
    });

    if (!exists) {
      return candidate;
    }
  }

  throw new Error('Gagal membuat unique code CRM. Batas urutan harian sudah penuh.');
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const formData = await request.formData();
    const createdByUserId = Number(cookieStore.get('sahada_user_id')?.value || formData.get('user_id')) || null;
    
    // Parse Customer Data
    const customerIdStr = formData.get('customer_id') as string;
    const customerName = formData.get('customer_name') as string;
    const whatsapp = formData.get('whatsapp_number') as string;
    const email = formData.get('email') as string;
    const address = formData.get('address') as string;
    const subdistrict = formData.get('subdistrict') as string;
    const age = parseInt(formData.get('age') as string, 10) || null;
    const complaint = formData.get('complaint') as string;
    
    let customerId = parseInt(customerIdStr, 10);

    // If no customer ID but name is provided, create a new customer
    if (!customerId && customerName) {
      const parts = subdistrict ? subdistrict.split(',') : [];
      const province = parts[0]?.trim() || null;
      const city = parts[1]?.trim() || null;
      const district = parts[2]?.trim() || null;

      const newCust = await prisma.customers.create({
        data: {
          name: customerName,
          whatsapp_number: whatsapp,
          email: email,
          address: address,
          subdistrict: subdistrict,
          province: province,
          city: city,
          age: age,
          complaint: complaint,
          status: 'active',
        },
      });
      customerId = newCust.id;

      await prisma.customer_addresses.create({
        data: {
          customer_id: customerId,
          receiver_name: customerName,
          whatsapp_number: whatsapp,
          address: address,
          district: district,
          city: city,
          province: province,
          is_default: true,
        },
      });
    }

    if (!customerId) {
      return NextResponse.json({ status: 'error', message: 'Customer ID or Name is required' }, { status: 400 });
    }

    // Parse Order Totals & Settings
    const totalProductPrice = parseInt(formData.get('total_product_price') as string, 10) || 0;
    const productDiscount = parseInt(formData.get('product_discount') as string, 10) || 0;
    const shippingCost = parseInt(formData.get('shipping_cost') as string, 10) || 0;
    const manualFeeCod = parseInt(formData.get('manual_fee_cod') as string, 10) || 0;
    const otherFee = parseInt(formData.get('other_fee') as string, 10) || 0;
    const totalPayment = parseInt(formData.get('total_payment') as string, 10) || 0;
    
    const warehouseId = parseInt(formData.get('warehouse_id') as string, 10);
    const courierName = formData.get('courier_name') as string;
    const paymentMethod = formData.get('payment_method') as string;
    const notes = formData.get('notes') as string;
    const roCount = parseInt(formData.get('ro_count') as string, 10) || 0;
    const isRo = roCount > 0 ? true : false;
    const scalevOrderId = formData.get('order_code') as string || null;
    const promoId = formData.get('promo_id') as string; // Assume single promo for now

    // Handle File Upload (Payment Proof)
    let paymentProofUrl = null;
    const file = formData.get('payment_proof') as File | null;
    if (file && file.size > 0) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const ext = file.name.split('.').pop() || 'jpg';
      const filename = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
      
      const uploadDir = join(process.cwd(), 'public', 'uploads', 'payments');
      if (!fs.existsSync(uploadDir)) {
        await mkdir(uploadDir, { recursive: true });
      }
      const path = join(uploadDir, filename);
      await writeFile(path, buffer);
      paymentProofUrl = `/uploads/payments/${filename}`;
    }

    // Parse Items (Products)
    const pIds = formData.getAll('item_product_id[]') as string[];
    const isGifts = formData.getAll('item_is_gift[]') as string[];
    const pPrices = formData.getAll('item_price[]') as string[];
    const pDiscs = formData.getAll('item_discount[]') as string[];
    const pQtys = formData.getAll('item_qty[]') as string[];

    const orderResult = await prisma.$transaction(async (tx) => {
      const orderCode = await generateOrderCode(tx, { warehouseId, courierName, paymentMethod });

      // 1. Create Order
      const order = await tx.orders_crm.create({
        data: {
          order_code: orderCode,
          scalev_order_id: scalevOrderId,
          customer_id: customerId,
          created_by_user_id: createdByUserId,
          order_type: 'normal',
          order_source: 'CRM',
          order_status: 'pending',
          total_product_price: totalProductPrice,
          product_discount: productDiscount,
          shipping_cost: shippingCost,
          shipping_discount: 0,
          other_fee: manualFeeCod + otherFee,
          promo_id: promoId,
          total_payment: totalPayment,
          notes: notes,
          is_ro: isRo,
          ro_count: roCount,
          warehouse_id: warehouseId,
        }
      });

      // 2. Create Items & Deduct Stock
      let totalWeightGrams = 0;
      for (let i = 0; i < pIds.length; i++) {
        const pId = parseInt(pIds[i], 10);
        const isGift = isGifts[i] === '1';
        const price = parseInt(pPrices[i], 10) || 0;
        const discount = parseInt(pDiscs[i], 10) || 0;
        const qty = parseInt(pQtys[i], 10) || 1;
        const subtotal = (price - discount) * qty;

        let name = '';
        if (isGift) {
          const g = await tx.gifts.findUnique({ where: { id: pId } });
          if (g) {
            name = g.gift_name;
            totalWeightGrams += (g.weight_gram || 0) * qty;
          }
          if (warehouseId) {
            await tx.warehouse_gift_stock.updateMany({
              where: { gift_id: pId, warehouse_id: warehouseId },
              data: { stock: { decrement: qty } },
            });
          }
        } else {
          const p = await tx.products.findUnique({ where: { id: pId } });
          if (p) {
            name = p.product_name;
            totalWeightGrams += (p.weight_gram || 0) * qty;
          }
          if (warehouseId) {
            await tx.warehouse_stock.updateMany({
              where: { product_id: pId, warehouse_id: warehouseId },
              data: { stock: { decrement: qty } },
            });
          }
        }

        await tx.order_items_crm.create({
          data: {
            order_id: order.id,
            product_id: pId,
            product_name: name,
            qty: qty,
            price: price,
            discount: discount,
            subtotal: subtotal,
            is_gift: isGift,
          }
        });
      }

      // 3. Create Shipment
      if (courierName) {
        await tx.shipments_crm.create({
          data: {
            order_id: order.id,
            warehouse_id: warehouseId,
            courier_name: courierName,
            courier_service: 'Reguler',
            shipping_cost: shippingCost,
            total_weight_gram: totalWeightGrams,
            shipment_status: 'pending',
          }
        });
      }

      // 4. Create Payment
      let finalPaymentMethod: 'bank_transfer' | 'cod' | 'ewallet' | 'free' = 'bank_transfer';
      if (paymentMethod === 'cod') finalPaymentMethod = 'cod';
      if (paymentMethod === 'free') finalPaymentMethod = 'free';

      let bankName = null;
      let accountName = null;
      let accountNo = null;

      if (paymentMethod === 'bank_transfer') {
        const accId = parseInt(formData.get('payment_account_id') as string, 10);
        if (accId) {
          const acc = await tx.payment_accounts.findUnique({ where: { id: accId } });
          if (acc) {
            bankName = acc.bank_name;
            accountName = acc.account_name;
            accountNo = acc.account_number;
          }
        }
      }

      await tx.payments_crm.create({
        data: {
          order_id: order.id,
          payment_method: finalPaymentMethod,
          bank_name: bankName,
          account_name: accountName,
          account_number: accountNo,
          payment_proof_url: paymentProofUrl,
          payment_status: paymentMethod === 'cod' ? 'unpaid' : (paymentProofUrl ? 'waiting_confirmation' : 'unpaid'),
        }
      });

      return order;
    });

    await emitEvent('NEW_ORDER');
    await emitEvent('REFRESH_OLAHAN');

    return NextResponse.json({
      status: 'success',
      message: 'Pesanan berhasil dibuat',
      order_code: orderResult.order_code,
    });

  } catch (error: unknown) {
    console.error('Error creating order:', error);
    return NextResponse.json(
      { status: 'error', message: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

