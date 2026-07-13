'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Loader2, Plus, Save, ShieldCheck, ShoppingCart, Trash2, Truck, UserRound } from 'lucide-react';
import Swal from 'sweetalert2';

type Item = {
  product_id: number;
  product_name: string;
  qty: number;
  price: number;
  discount: number;
  is_gift: boolean;
  is_bundle: boolean;
  image_url?: string;
};

type Data = Record<string, any> & {
  order: Record<string, any>;
  items: any[];
  payment: any;
  shipment: any;
};

const money = (value: number) => new Intl.NumberFormat('id-ID').format(value || 0);
const number = (value: any) => Number(value || 0);

const inputClass = 'w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-700 outline-none transition-colors focus:border-purple-300 focus:ring-1 focus:ring-purple-300';
const textareaClass = `${inputClass} min-h-[96px] resize-y`;
const sectionClass = 'overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm';
const sectionHeadClass = 'border-b border-slate-100 bg-slate-50/80 px-5 py-4';
const sectionBodyClass = 'p-5';

export default function EditOrderForm() {
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get('id') || '';
  const source = params.get('source') || 'CSO';

  const [data, setData] = useState<Data | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(Boolean(id));
  const [saving, setSaving] = useState(false);
  const [proof, setProof] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState('');
  const [destOptions, setDestOptions] = useState<any[]>([]);
  const [showDest, setShowDest] = useState(false);
  const [addProduct, setAddProduct] = useState('');
  const [addGift, setAddGift] = useState('');
  const [addBundle, setAddBundle] = useState('');

  useEffect(() => {
    if (!proof) {
      setProofPreview('');
      return;
    }

    const objectUrl = URL.createObjectURL(proof);
    setProofPreview(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [proof]);

  useEffect(() => {
    if (!id) {
      return;
    }

    fetch(`/api/olahan/edit?id=${encodeURIComponent(id)}&source=${encodeURIComponent(source)}`)
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok) {
          throw new Error(json.message);
        }
        return json.data;
      })
      .then((loaded: Data) => {
        const order = loaded.order;
        const payment = loaded.payment || {};
        const shipment = loaded.shipment || {};
        const additionalShippingCost = number(order.additional_shipping_cost);
        const otherFee = number(order.other_fee);
        const fallbackManualFeeCod = payment.payment_method === 'cod' && additionalShippingCost === 0 ? otherFee : 0;
        const selectedAccount = loaded.paymentAccounts?.find((item: any) => item.account_number === payment.account_number);
        const selectedNoPay = loaded.noPaymentMethods?.find((item: any) => item.method_name === payment.bank_name);
        const courier = order.courier_id || loaded.couriers?.find((item: any) => String(item.courier_name).toUpperCase() === String(shipment.courier_name || order.courier_name || '').toUpperCase())?.id || '';

        setData(loaded);
        setItems(
          loaded.items.map((item: any) => ({
            product_id: number(item.product_id),
            product_name: item.product_name,
            qty: number(item.qty),
            price: number(item.price),
            discount: number(item.discount),
            is_gift: Boolean(item.is_gift),
            is_bundle: Boolean(item.is_bundle),
            image_url: item.image_url,
          })),
        );
        setForm({
          customer_name: order.customer_name || '',
          whatsapp_number: order.whatsapp_number || '',
          email: order.email || '',
          address: order.address || '',
          subdistrict: order.subdistrict || '',
          desa: order.desa || '',
          age: order.age ?? '',
          complaint: order.complaint || '',
          order_status: order.order_status || 'pending',
          ro_count: order.ro_count || 0,
          advertiser_name: order.advertiser_name || '',
          ad_source: order.ad_source || '',
          promo_id: order.promo_id || '',
          notes: order.notes || '',
          warehouse_id: order.warehouse_id || shipment.warehouse_id || '',
          courier_id: courier,
          shipping_cost: number(order.shipping_cost || shipment.shipping_cost),
          product_discount: number(order.product_discount),
          manual_fee_cod: additionalShippingCost || fallbackManualFeeCod,
          other_fee: additionalShippingCost === 0 && fallbackManualFeeCod > 0 ? 0 : otherFee,
          shipping_discount: number(order.shipping_discount),
          payment_method: payment.payment_method || 'cod',
          payment_status: payment.payment_status || 'pending',
          payment_account_id: selectedAccount?.id || '',
          no_payment_method_id: selectedNoPay?.id || '',
          id_reff: payment.fat_proof_url || '',
          payment_proof_url: payment.payment_proof_url || '',
        });
        setLoading(false);
      })
      .catch((error) => {
        setLoading(false);
        Swal.fire('Gagal', error.message, 'error');
      });
  }, [id, source]);

  const subtotal = useMemo(
    () => items.filter((item) => !item.is_gift).reduce((sum, item) => sum + (number(item.price) - number(item.discount)) * number(item.qty), 0),
    [items],
  );

  const total = Math.max(
    0,
    subtotal - number(form.product_discount) + number(form.shipping_cost) + number(form.manual_fee_cod) + number(form.other_fee) - number(form.shipping_discount),
  );

  const set = (key: string, value: any) => setForm((prev) => ({ ...prev, [key]: value }));

  const updateItem = (index: number, key: keyof Item, value: any) => {
    setItems((prev) => prev.map((item, itemIndex) => (itemIndex === index ? { ...item, [key]: value } : item)));
  };

  const add = (kind: 'product' | 'gift' | 'bundle', rawId: string) => {
    if (!rawId || !data) {
      return;
    }

    const list = kind === 'product' ? data.products : kind === 'gift' ? data.gifts : data.bundles;
    const found = list.find((entry: any) => String(entry.id) === rawId);
    if (!found) {
      return;
    }

    const isGift = kind === 'gift';
    const isBundle = kind === 'bundle';

    if (items.some((item) => item.product_id === number(found.id) && item.is_gift === isGift && item.is_bundle === isBundle)) {
      void Swal.fire('Info', 'Item sudah ada dalam pesanan', 'info');
      return;
    }

    setItems((prev) => [
      ...prev,
      {
        product_id: number(found.id),
        product_name: found.product_name,
        qty: 1,
        price: isGift ? 0 : number(found.price),
        discount: 0,
        is_gift: isGift,
        is_bundle: isBundle,
        image_url: found.image_url,
      },
    ]);
  };

  const searchDest = async (query: string) => {
    set('subdistrict', query);
    const response = await fetch(`/api/shipping/destinations?q=${encodeURIComponent(query)}`);
    if (response.ok) {
      setDestOptions(await response.json());
      setShowDest(true);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!form.warehouse_id) {
      await Swal.fire('Periksa Form', 'Gudang wajib dipilih', 'warning');
      return;
    }

    setSaving(true);
    try {
      const body = new FormData();
      body.append('payload', JSON.stringify({ ...form, id, source, total_product_price: subtotal, total_payment: total, items }));
      if (proof) {
        body.append('payment_proof', proof);
      }

      const response = await fetch('/api/olahan/edit', { method: 'PUT', body });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.message || 'Gagal menyimpan');
      }

      await Swal.fire('Berhasil', json.message, 'success');
      router.push('/olahan');
    } catch (error: any) {
      await Swal.fire('Gagal', error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center bg-slate-50 px-4 py-10">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
          <Loader2 className="h-6 w-6 animate-spin text-purple-500" />
          <div>
            <p className="font-semibold text-slate-800">Memuat pesanan...</p>
            <p className="text-sm text-slate-500">Menyiapkan data edit untuk Anda.</p>
          </div>
        </div>
      </div>
    );
  }

  if (!id || !data) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-3xl items-center justify-center px-4 py-10">
        <div className="rounded-2xl border border-red-100 bg-white p-8 text-center shadow-sm">
          <p className="text-base font-semibold text-red-600">Pesanan tidak ditemukan atau parameter ID tidak tersedia.</p>
          <button
            type="button"
            onClick={() => router.push('/olahan')}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-200"
          >
            <ArrowLeft className="h-4 w-4" />
            Kembali ke Olahan
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full px-4 py-6 md:px-8 lg:px-12">
      <form onSubmit={submit} className="space-y-6">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <button
              type="button"
              onClick={() => router.push('/olahan')}
              className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-purple-600"
            >
              <ArrowLeft className="h-4 w-4" />
              Kembali ke Olahan
            </button>
            <h1 className="text-2xl font-bold text-slate-800">Edit Pesanan</h1>
            <p className="mt-1 text-sm text-slate-500">Perbarui detail pesanan dengan tampilan yang konsisten seperti halaman input pesanan lain.</p>
          </div>

          <div className="rounded-2xl border border-purple-100 bg-white px-5 py-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-500">Ringkasan Pesanan</p>
            <p className="mt-2 text-lg font-bold text-slate-800">{data.order.order_code}</p>
            <p className="mt-1 text-sm text-slate-500">Sumber: {source.replace('_', ' ')}</p>
            <button
              type="submit"
              disabled={saving}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-purple-200 px-4 py-3 text-sm font-bold text-purple-900 shadow-[0_4px_14px_0_rgba(216,180,226,0.5)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-purple-300 disabled:transform-none disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Simpan Perubahan
            </button>
          </div>
        </div>

        <div className="space-y-6">
            <section className={sectionClass}>
              <div className={sectionHeadClass}>
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-purple-100 p-2 text-purple-500">
                    <UserRound className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-bold text-slate-800">Informasi Pelanggan & Pengiriman</h2>
                    <p className="text-sm text-slate-500">Samakan data penerima, alamat, dan detail pengiriman.</p>
                  </div>
                </div>
              </div>
              <div className={`${sectionBodyClass} grid grid-cols-1 gap-5 md:grid-cols-2`}>
                <Field label="Nomor WhatsApp *">
                  <input required className={inputClass} value={form.whatsapp_number} onChange={(event) => set('whatsapp_number', event.target.value)} />
                </Field>
                <Field label="Nama Pelanggan *">
                  <input required className={inputClass} value={form.customer_name} onChange={(event) => set('customer_name', event.target.value)} />
                </Field>
                <Field label="Email">
                  <input type="email" className={inputClass} value={form.email} onChange={(event) => set('email', event.target.value)} />
                </Field>
                {source !== 'CSO' ? (
                  <Field label="Repeat Order (RO)">
                    <input type="number" min="0" className={inputClass} value={form.ro_count} onChange={(event) => set('ro_count', event.target.value)} />
                  </Field>
                ) : null}
                {source === 'CSO' ? (
                  <>
                    <Field label="Advertiser">
                      <select className={inputClass} value={form.advertiser_name} onChange={(event) => set('advertiser_name', event.target.value)}>
                        <option value="">Pilih advertiser</option>
                        {data.advertisers.map((item: any) => (
                          <option key={item.id} value={item.name}>{item.name}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Sumber Iklan">
                      <select className={inputClass} value={form.ad_source} onChange={(event) => set('ad_source', event.target.value)}>
                        <option value="">Pilih sumber</option>
                        {data.adSources.map((item: any) => (
                          <option key={item.id} value={item.name}>{item.name}</option>
                        ))}
                      </select>
                    </Field>
                  </>
                ) : null}
                <Field label="Alamat Lengkap *" fullWidth>
                  <textarea required rows={4} className={textareaClass} value={form.address} onChange={(event) => set('address', event.target.value)} />
                </Field>
                <div className="relative md:col-span-2">
                  <Field label="Kecamatan / Kota / Provinsi *">
                    <input
                      required
                      className={inputClass}
                      value={form.subdistrict}
                      onFocus={() => void searchDest(form.subdistrict)}
                      onBlur={() => setTimeout(() => setShowDest(false), 200)}
                      onChange={(event) => void searchDest(event.target.value)}
                    />
                    {showDest && destOptions.length > 0 ? (
                      <div className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
                        {destOptions.map((item: any) => (
                          <button
                            type="button"
                            key={item.id}
                            onClick={() => {
                              set('subdistrict', item.id);
                              setShowDest(false);
                            }}
                            className="block w-full border-b border-slate-100 px-4 py-3 text-left text-sm text-slate-700 transition-colors hover:bg-purple-50"
                          >
                            {item.text}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </Field>
                </div>
                <Field label="Desa">
                  <input className={inputClass} value={form.desa} onChange={(event) => set('desa', event.target.value)} />
                </Field>
                <Field label="Usia">
                  <input type="number" min="0" className={inputClass} value={form.age} onChange={(event) => set('age', event.target.value)} />
                </Field>
                <Field label="Keluhan" fullWidth>
                  <textarea rows={3} className={textareaClass} value={form.complaint} onChange={(event) => set('complaint', event.target.value)} />
                </Field>
              </div>
            </section>

            <section className={sectionClass}>
              <div className={sectionHeadClass}>
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-purple-100 p-2 text-purple-500">
                    <ShoppingCart className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-bold text-slate-800">Produk, Bundling & Hadiah</h2>
                    <p className="text-sm text-slate-500">Tambahkan atau sesuaikan isi pesanan seperti pada halaman buat pesanan.</p>
                  </div>
                </div>
              </div>
              <div className={sectionBodyClass}>
                <div className="mb-5 grid gap-3 md:grid-cols-3">
                  <AddSelect value={addProduct} onChange={(value) => { setAddProduct(value); add('product', value); setAddProduct(''); }} title="Tambah produk" options={data.products} />
                  <AddSelect value={addBundle} onChange={(value) => { setAddBundle(value); add('bundle', value); setAddBundle(''); }} title="Tambah bundling" options={data.bundles} />
                  <AddSelect value={addGift} onChange={(value) => { setAddGift(value); add('gift', value); setAddGift(''); }} title="Tambah hadiah" options={data.gifts} />
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full min-w-[820px] text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="p-4">Item</th>
                        <th className="p-4">Jenis</th>
                        <th className="p-4">Harga</th>
                        <th className="p-4">Diskon / Item</th>
                        <th className="p-4">Qty</th>
                        <th className="p-4 text-right">Subtotal</th>
                        <th className="p-4 text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {items.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                            Belum ada item dalam pesanan ini.
                          </td>
                        </tr>
                      ) : (
                        items.map((item, index) => (
                          <tr key={`${item.is_gift}-${item.is_bundle}-${item.product_id}`} className="hover:bg-slate-50/50">
                            <td className="p-4">
                              <div className="font-semibold text-slate-800">{item.product_name}</div>
                            </td>
                            <td className="p-4">
                              <span className="inline-flex rounded-full bg-purple-50 px-2.5 py-1 text-xs font-semibold text-purple-700">
                                {item.is_gift ? 'Hadiah' : item.is_bundle ? 'Bundling' : 'Produk'}
                              </span>
                            </td>
                            <td className="p-4">
                              <input
                                disabled={item.is_gift}
                                type="number"
                                min="0"
                                className={`${inputClass} w-28`}
                                value={item.price}
                                onChange={(event) => updateItem(index, 'price', number(event.target.value))}
                              />
                            </td>
                            <td className="p-4">
                              <input
                                disabled={item.is_gift}
                                type="number"
                                min="0"
                                className={`${inputClass} w-28`}
                                value={item.discount}
                                onChange={(event) => updateItem(index, 'discount', number(event.target.value))}
                              />
                            </td>
                            <td className="p-4">
                              <input
                                type="number"
                                min="1"
                                className={`${inputClass} w-20`}
                                value={item.qty}
                                onChange={(event) => updateItem(index, 'qty', Math.max(1, number(event.target.value)))}
                              />
                            </td>
                            <td className="p-4 text-right font-bold text-slate-800">Rp {money((item.price - item.discount) * item.qty)}</td>
                            <td className="p-4 text-center">
                              <button
                                type="button"
                                onClick={() => setItems((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}
                                className="rounded-lg p-2 text-red-500 transition-colors hover:bg-red-50"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            <section className={sectionClass}>
              <div className={sectionHeadClass}>
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-purple-100 p-2 text-purple-500">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-bold text-slate-800">Pembayaran</h2>
                    <p className="text-sm text-slate-500">Pastikan metode dan bukti pembayaran sudah sesuai.</p>
                  </div>
                </div>
              </div>
              <div className={`${sectionBodyClass} space-y-4`}>
                <Field label="Metode Pembayaran">
                  <select className={inputClass} value={form.payment_method} onChange={(event) => set('payment_method', event.target.value)}>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cod">COD</option>
                    <option value="free">Free / Tanpa Pembayaran</option>
                  </select>
                </Field>
                <Field label="Status Pembayaran">
                  <select className={inputClass} value={form.payment_status} onChange={(event) => set('payment_status', event.target.value)}>
                    <option value="pending">Pending</option>
                    <option value="paid">Paid</option>
                    <option value="failed">Failed</option>
                    <option value="refunded">Refunded</option>
                  </select>
                </Field>
                {form.payment_method === 'bank_transfer' ? (
                  <Field label="Rekening">
                    <select className={inputClass} value={form.payment_account_id} onChange={(event) => set('payment_account_id', event.target.value)}>
                      <option value="">Pilih rekening</option>
                      {data.paymentAccounts.map((item: any) => (
                        <option key={item.id} value={item.id}>{item.bank_name} - {item.account_name} ({item.account_number})</option>
                      ))}
                    </select>
                  </Field>
                ) : null}
                {form.payment_method === 'free' ? (
                  <Field label="Alasan tanpa pembayaran">
                    <select className={inputClass} value={form.no_payment_method_id} onChange={(event) => set('no_payment_method_id', event.target.value)}>
                      <option value="">Pilih alasan</option>
                      {data.noPaymentMethods.map((item: any) => (
                        <option key={item.id} value={item.id}>{item.method_name}</option>
                      ))}
                    </select>
                  </Field>
                ) : null}
                <Field label="ID Referensi">
                  <input className={inputClass} value={form.id_reff} onChange={(event) => set('id_reff', event.target.value)} />
                </Field>
                <Field label="Ganti Bukti Pembayaran">
                  <input type="file" accept="image/jpeg,image/png,image/webp" className={inputClass} onChange={(event) => setProof(event.target.files?.[0] || null)} />
                  {proofPreview ? (
                    <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Preview baru</p>
                      <img src={proofPreview} alt="Preview bukti pembayaran baru" className="max-h-72 w-auto rounded-lg border border-slate-200 bg-white object-contain" />
                    </div>
                  ) : null}
                  {form.payment_proof_url ? (
                    <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Bukti saat ini</p>
                      <a className="mb-3 inline-block text-xs font-medium text-purple-600 hover:text-purple-700" href={form.payment_proof_url.startsWith('http') ? form.payment_proof_url : "/" + form.payment_proof_url.replace(/^\/+/, '')} target="_blank" rel="noreferrer">
                        Buka gambar penuh
                      </a>
                      <img
                        src={form.payment_proof_url.startsWith('http') ? form.payment_proof_url : "/" + form.payment_proof_url.replace(/^\/+/, '')}
                        alt="Bukti pembayaran saat ini"
                        className="max-h-72 w-auto rounded-lg border border-slate-200 bg-white object-contain"
                      />
                    </div>
                  ) : null}
                </Field>
              </div>
            </section>

            <section className={sectionClass}>
              <div className={sectionHeadClass}>
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-purple-100 p-2 text-purple-500">
                    <Truck className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-bold text-slate-800">Gudang, Kurir & Ringkasan</h2>
                    <p className="text-sm text-slate-500">Atur logistik dan lihat ringkasan pembayaran akhir.</p>
                  </div>
                </div>
              </div>
              <div className={`${sectionBodyClass} space-y-4`}>
                <Field label="Gudang *">
                  <select required className={inputClass} value={form.warehouse_id} onChange={(event) => set('warehouse_id', event.target.value)}>
                    <option value="">Pilih gudang</option>
                    {data.warehouses.map((item: any) => (
                      <option key={item.id} value={item.id}>{item.warehouse_name} - {item.city}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Kurir">
                  <select className={inputClass} value={form.courier_id} onChange={(event) => set('courier_id', event.target.value)}>
                    <option value="">Pilih kurir</option>
                    {data.couriers.map((item: any) => (
                      <option key={item.id} value={item.id}>{item.courier_name} {item.service_type ? `- ${item.service_type}` : ''}</option>
                    ))}
                  </select>
                </Field>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Ongkir">
                    <input type="number" min="0" className={inputClass} value={form.shipping_cost} onChange={(event) => set('shipping_cost', number(event.target.value))} />
                  </Field>
                  <Field label="Diskon Produk">
                    <input type="number" min="0" className={inputClass} value={form.product_discount} onChange={(event) => set('product_discount', number(event.target.value))} />
                  </Field>
                  <Field label="Biaya COD">
                    <input type="number" min="0" className={inputClass} value={form.manual_fee_cod} onChange={(event) => set('manual_fee_cod', number(event.target.value))} />
                  </Field>
                  <Field label="Biaya Lain">
                    <input type="number" min="0" className={inputClass} value={form.other_fee} onChange={(event) => set('other_fee', number(event.target.value))} />
                  </Field>
                </div>
                <Field label="Promo">
                  <select className={inputClass} value={form.promo_id} onChange={(event) => set('promo_id', event.target.value)}>
                    <option value="">Tanpa promo</option>
                    {data.promos.map((item: any) => (
                      <option key={item.id} value={item.id}>{item.promo_name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Status Pesanan">
                  <select className={inputClass} value={form.order_status} onChange={(event) => set('order_status', event.target.value)}>
                    <option value="pending">Pending</option>
                    <option value="processing">Processing</option>
                    <option value="shipped">Shipped</option>
                    <option value="delivered">Delivered</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </Field>
                <Field label="Catatan">
                  <textarea rows={3} className={textareaClass} value={form.notes} onChange={(event) => set('notes', event.target.value)} />
                </Field>
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between text-sm text-slate-600">
                    <span>Total Harga Produk</span>
                    <span className="font-bold text-slate-800">Rp {money(subtotal)}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3">
                    <span className="font-bold uppercase tracking-wide text-slate-800">Total Pembayaran</span>
                    <span className="text-2xl font-black tracking-tight text-purple-500">Rp {money(total)}</span>
                  </div>
                </div>
              </div>
            </section>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <button
            type="submit"
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-purple-200 py-4 text-sm font-bold tracking-wide text-purple-900 shadow-[0_4px_14px_0_rgba(216,180,226,0.5)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-purple-300 disabled:transform-none disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
            Simpan Semua Perubahan
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children, fullWidth = false }: { label: string; children: ReactNode; fullWidth?: boolean }) {
  return (
    <label className={fullWidth ? 'block md:col-span-2' : 'block'}>
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function AddSelect({ value, onChange, title, options }: { value: string; onChange: (value: string) => void; title: string; options: any[] }) {
  return (
    <div className="flex gap-2">
      <select className={inputClass} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{title}...</option>
        {options.map((item) => (
          <option key={item.id} value={item.id}>
            {item.product_name}
            {item.total_stock !== undefined ? ` (stok ${item.total_stock})` : ''}
          </option>
        ))}
      </select>
      <span className="flex items-center rounded-lg bg-purple-100 px-3 text-purple-500">
        <Plus className="h-4 w-4" />
      </span>
    </div>
  );
}
