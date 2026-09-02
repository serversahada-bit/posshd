import { Prisma } from '@prisma/client';

type DbLike = Prisma.TransactionClient;

type WeightRule = {
  base_weight_gram?: number | null;
  extra_weight_step_gram?: number | null;
  rounding_tolerance_gram?: number | null;
};

export const normalizeCourierKey = (value: string | null | undefined): string =>
  String(value || '').trim().replace(/\s+/g, ' ').toUpperCase();

export function calculateShippingMultiplier(
  totalWeightGrams: number,
  courierName: string | null | undefined,
  shippingWeightSettings: WeightRule | null,
  courierWeightRules: Record<string, WeightRule>,
): number {
  const rule = courierWeightRules[normalizeCourierKey(courierName)] || {};
  const settings = shippingWeightSettings || {};
  const baseWeight = Math.max(Number(rule.base_weight_gram ?? settings.base_weight_gram ?? 1000) || 1000, 1);
  const extraStep = Math.max(Number(rule.extra_weight_step_gram ?? settings.extra_weight_step_gram ?? 1000) || 1000, 1);
  const tolerance = Math.max(Number(rule.rounding_tolerance_gram ?? settings.rounding_tolerance_gram ?? 0) || 0, 0);
  const total = Math.max(Number(totalWeightGrams) || 0, 0);

  if (total <= baseWeight) {
    return 1;
  }

  const excessWeight = total - baseWeight;
  const fullSteps = Math.floor(excessWeight / extraStep);
  const remainder = excessWeight % extraStep;

  return 1 + fullSteps + (remainder > tolerance ? 1 : 0);
}

export async function getCourierWeightRules(db: DbLike): Promise<Record<string, WeightRule>> {
  const couriers = await db.couriers.findMany({
    select: {
      courier_name: true,
      code: true,
      base_weight_gram: true,
      extra_weight_step_gram: true,
      rounding_tolerance_gram: true,
    },
  });

  const rules: Record<string, WeightRule> = {};
  couriers.forEach((courier) => {
    if (courier.code) rules[normalizeCourierKey(courier.code)] = courier;
    if (courier.courier_name) rules[normalizeCourierKey(courier.courier_name)] = courier;
  });
  return rules;
}

// Computes the weight-based shipping multiplier using TODAY's tariff settings and stores the
// result on the shipment row at create/edit time, so exports read a frozen historical value
// instead of recomputing it (and drifting) whenever weight/courier tariff settings change later.
export async function resolveWeightMultiplier(
  db: DbLike,
  courierName: string | null | undefined,
  totalWeightGrams: number,
): Promise<number> {
  if (!courierName) {
    return 1;
  }

  const [settings, rules] = await Promise.all([
    db.shipping_weight_settings.findFirst({
      select: { base_weight_gram: true, extra_weight_step_gram: true, rounding_tolerance_gram: true },
    }),
    getCourierWeightRules(db),
  ]);

  return calculateShippingMultiplier(totalWeightGrams, courierName, settings, rules);
}
