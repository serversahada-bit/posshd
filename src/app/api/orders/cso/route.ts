import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { join } from 'path';
import crypto from 'crypto';
import { cookies } from 'next/headers';
import { emitEvent } from '@/lib/socket-server';
import { resolveOrderItem } from '@/lib/orderItems';
import { upsertCustomerAddressSnapshot } from '@/lib/customerAddress';
import { saveUploadBuffer } from '@/lib/uploadStorage';
import { getScalevBaseUrl, syncPosOrderToScalev } from '@/lib/scalev';

export const dynamic = 'force-dynamic';

type NoPaymentMethodRow = {
  method_name: string;
};

function generateOrderCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'CSO';
  for (let i = 0; i < 10; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
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

    let customerId = 0;
    if (whatsapp) {
      const existing = await prisma.customers.findFirst({
        where: { whatsapp_number: whatsapp },
        orderBy: { id: 'desc' }
      });
      if (existing) {
        customerId = existing.id;
      }
    }

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
    const noPaymentMethodId = parseInt(formData.get('no_payment_method_id') as string, 10) || 0;
    const notes = formData.get('notes') as string;
    const advertiserName = formData.get('advertiser_name') as string;
    const adSource = formData.get('ad_source') as string;
    const scalevOrderId = ((formData.get('order_code') as string) || '').trim() || null;
    const promoId = formData.get('promo_id') as string; // Assume single promo for now

    // Handle File Upload (Payment Proof)
    let paymentProofUrl = null;
    const file = formData.get('payment_proof') as File | null;
    if (file && file.size > 0) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const ext = file.name.split('.').pop() || 'jpg';
      const filename = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;

      const stored = await saveUploadBuffer(['payments'], filename, buffer);
      paymentProofUrl = stored.url;
    }

    if (paymentMethod === 'bank_transfer' && !paymentProofUrl) {
      throw new Error('Bukti transfer wajib diupload untuk Bank Transfer (Manual)');
    }

    if (paymentMethod === 'free' && !paymentProofUrl) {
      throw new Error('Bukti approval wajib diupload untuk Free / Tanpa Pembayaran');
    }

    // Parse Items (Products)
    const pIds = formData.getAll('item_product_id[]') as string[];
    const isGifts = formData.getAll('item_is_gift[]') as string[];
    const isBundles = formData.getAll('item_is_bundle[]') as string[];
    const pPrices = formData.getAll('item_price[]') as string[];
    const pDiscs = formData.getAll('item_discount[]') as string[];
    const pQtys = formData.getAll('item_qty[]') as string[];

    if (scalevOrderId && scalevOrderId.length !== 13) {
      return NextResponse.json({ status: 'error', message: 'Kode Scalev harus tepat 13 karakter' }, { status: 400 });
    }

    const orderCode = scalevOrderId || generateOrderCode();

    const existingOrder = await prisma.orders.findFirst({
      where: { order_code: orderCode },
      select: { id: true },
    });

    if (existingOrder) {
      return NextResponse.json({ status: 'error', message: 'ID Order sudah digunakan' }, { status: 400 });
    }

    // We will do this in a transaction

    const orderResult = await prisma.$transaction(async (tx) => {
      const regionParts = subdistrict ? subdistrict.split(',').map((part) => part.trim()) : [];
      const addressSnapshot = await upsertCustomerAddressSnapshot(tx, {
        customerId,
        receiverName: customerName,
        whatsappNumber: whatsapp,
        address,
        district: regionParts[2] || null,
        city: regionParts[1] || null,
        province: regionParts[0] || null,
      });
      // 1. Create Order
      const order = await tx.orders.create({
        data: {
          order_code: orderCode,
          scalev_order_id: scalevOrderId,
          customer_id: customerId,
          customer_address_id: addressSnapshot.id,
          created_by_user_id: createdByUserId,
          order_type: 'normal',
          order_source: 'CSO',
          order_status: 'pending',
          total_product_price: totalProductPrice,
          product_discount: productDiscount,
          shipping_cost: shippingCost,
          shipping_discount: 0,
          other_fee: manualFeeCod,
          additional_shipping_cost: otherFee,
          promo_id: promoId,
          total_payment: totalPayment,
          notes: notes,
          advertiser_name: advertiserName,
          ad_source: adSource,
          warehouse_id: warehouseId,
        }
      });

      // 2. Create Items & Deduct Stock
      let totalWeightGrams = 0;
      for (let i = 0; i < pIds.length; i++) {
        const pId = parseInt(pIds[i], 10);
        const isGift = isGifts[i] === '1';
        const isBundle = isBundles?.[i] === '1';
        const price = parseInt(pPrices[i], 10) || 0;
        const discount = parseInt(pDiscs[i], 10) || 0;
        const qty = parseInt(pQtys[i], 10) || 1;
        const subtotal = (price - discount) * qty;
        const resolvedItem = await resolveOrderItem(tx, { itemId: pId, isGift, isBundle });

        let name = '';
        if (resolvedItem.kind === 'gift') {
          name = resolvedItem.name;
          totalWeightGrams += resolvedItem.weightGram * qty;
          // Deduct gift stock
          if (warehouseId) {
            await tx.warehouse_gift_stock.updateMany({
              where: { gift_id: pId, warehouse_id: warehouseId },
              data: { stock: { decrement: qty } },
            });
          }
        } else if (resolvedItem.kind === 'bundle') {
          const bundleTotalQty = resolvedItem.components.reduce((sum, item) => sum + item.qtyPerBundle, 0);
          const bundlesBought = bundleTotalQty > 0 ? (qty / bundleTotalQty) : 0;

          for (const item of resolvedItem.components) {
            const deductQty = item.qtyPerBundle * bundlesBought;
            totalWeightGrams += item.weightGram * deductQty;
            if (warehouseId) {
              await tx.warehouse_stock.updateMany({
                where: { product_id: item.productId, warehouse_id: warehouseId },
                data: { stock: { decrement: deductQty } },
              });
            }

            await tx.order_items.create({
              data: {
                order_id: order.id,
                product_id: item.productId,
                product_name: item.productName,
                qty: deductQty,
                price: price,
                discount: discount,
                subtotal: (price - discount) * deductQty,
                is_gift: false,
                is_bundle: true,
              }
            });
          }
          continue;
        } else {
          name = resolvedItem.name;
          totalWeightGrams += resolvedItem.weightGram * qty;
          // Deduct product stock
          if (warehouseId) {
            await tx.warehouse_stock.updateMany({
              where: { product_id: pId, warehouse_id: warehouseId },
              data: { stock: { decrement: qty } },
            });
          }
        }

        await tx.order_items.create({
          data: {
            order_id: order.id,
            product_id: (isBundle || isGift) ? null : pId,
            product_name: name,
            qty: qty,
            price: price,
            discount: discount,
            subtotal: subtotal,
            is_gift: isGift,
            is_bundle: isBundle,
          }
        });
      }

      // 3. Create Shipment
      if (courierName) {
        await tx.shipments.create({
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

      if (paymentMethod === 'free' && noPaymentMethodId) {
        const methods = await tx.$queryRawUnsafe<NoPaymentMethodRow[]>(
          'SELECT method_name FROM no_payment_methods WHERE id = ? LIMIT 1',
          noPaymentMethodId,
        );
        const method = methods[0];
        if (method) {
          bankName = method.method_name;
          accountName = 'No Payment';
          accountNo = '-';
        }
      }

      await tx.payments.create({
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

    // Pesanan ini berasal dari draft Scalev (order_code = ID order Scalev) — dorong balik ke Scalev
    // (lengkapi kurir/gudang/alamat lalu ubah status draft -> pending, lihat syncPosOrderToScalev).
    // Best-effort & tidak pernah menggagalkan pembuatan pesanan di POS: kalau gagal, masuk antrean
    // retry (scalev_sync_queue), dan tetap bisa dikirim ulang manual lewat tombol "Kirim ke Scalev"
    // di halaman POS to Scalev.
    if (scalevOrderId) {
      try {
        const scalevSetting = await prisma.scalev.findFirst({
          where: { status: 'active' },
          orderBy: { id: 'desc' },
        });

        if (scalevSetting?.api_key) {
          const apiKey = scalevSetting.api_key;
          const baseUrl = getScalevBaseUrl(scalevSetting.url);

          const warehouse = warehouseId
            ? await prisma.warehouses.findUnique({ where: { id: warehouseId }, select: { code: true } })
            : null;
          const regionParts = subdistrict ? subdistrict.split(',').map((part) => part.trim()) : [];

          const syncResult = await syncPosOrderToScalev({
            apiKey,
            baseUrl,
            scalevOrderId,
            courierName,
            warehouseCode: warehouse?.code,
            province: regionParts[0] || null,
            city: regionParts[1] || null,
            district: regionParts[2] || null,
            address,
            customerName,
            customerPhone: whatsapp,
            paymentMethod,
            shippingCost,
            shippingDiscount: 0,
            productDiscount,
            otherIncome: manualFeeCod + otherFee,
            expectedTotalPayment: totalPayment,
          });

          if (!syncResult.ok) {
            throw new Error(syncResult.message);
          }

          await prisma.orders.update({
            where: { id: orderResult.id },
            data: { scalev_synced_at: new Date() },
          });
        }
      } catch (syncError: unknown) {
        console.error('[API /orders/cso] Gagal sinkron status ke Scalev, dimasukkan ke antrean retry:', syncError);
        try {
          await prisma.scalev_sync_queue.upsert({
            where: { scalev_order_id: scalevOrderId },
            update: { target_status: 'pending' },
            create: { scalev_order_id: scalevOrderId, target_status: 'pending' },
          });
        } catch (queueError: unknown) {
          console.error('[API /orders/cso] Gagal menambahkan ke antrean retry Scalev:', queueError);
        }
      }
    }

    return NextResponse.json({
      status: 'success',
      message: 'Pesanan berhasil dibuat',
      order_code: orderResult.order_code,
    });

  } catch (error: any) {
    console.error('Error creating order:', error);
    return NextResponse.json(
      { status: 'error', message: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
