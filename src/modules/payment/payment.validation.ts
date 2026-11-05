/**
 * payment.validation.ts
 * ONE definition of "does this gateway charge match our payment record".
 * Used by the webhook path AND the follow-up/recovery path
 * (recoverPaymentIfConfirmed). Both read the same facts from Paystack
 * (status, amount in kobo, currency), so neither may skip a check the other
 * performs.
 */

import type { Prisma } from "@prisma/client";

export interface ChargeFacts {
  status?: string;
  amount: number; // kobo
  currency?: string;
}

export type ChargeCheck =
  | { ok: true }
  | { ok: false; code: "NOT_SUCCESS" | "CURRENCY_MISMATCH" | "AMOUNT_MISMATCH"; message: string };

export function checkChargeMatchesPayment(
  payment: { amount: Prisma.Decimal; currency: string },
  charge: ChargeFacts,
): ChargeCheck {
  if (charge.status !== "success") {
    return { ok: false, code: "NOT_SUCCESS", message: `status=${charge.status ?? "missing"}` };
  }
  if (charge.currency !== payment.currency) {
    return {
      ok: false,
      code: "CURRENCY_MISMATCH",
      message: `expected ${payment.currency}, got ${charge.currency ?? "missing"}`,
    };
  }
  // Decimal arithmetic, never Number(): no float rounding on money.
  const expectedKobo = payment.amount.mul(100);
  if (!expectedKobo.equals(charge.amount)) {
    return {
      ok: false,
      code: "AMOUNT_MISMATCH",
      message: `expected ${expectedKobo.toFixed(0)} kobo, got ${charge.amount}`,
    };
  }
  return { ok: true };
}
