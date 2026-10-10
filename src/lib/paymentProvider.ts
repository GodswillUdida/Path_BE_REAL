// src/lib/paymentProvider.ts
import crypto from "crypto";
import logger from "../utils/logger";
import { unauthorized } from "../utils/errors";

export type PaymentIntent = {
  reference: string;
  paymentUrl: string;
};

export async function createCheckout({
  amount,
  currency,
  callbackUrl,
  metadata,
}: {
  amount: number;
  currency?: string;
  callbackUrl?: string;
  metadata?: Record<string, any>;
}): Promise<PaymentIntent> {
  // TODO: replace with real provider SDK (Paystack / Flutterwave)
  // For Paystack: create transaction and return authorization_url and reference.
  const reference = crypto.randomBytes(12).toString("hex");
  const paymentUrl = `${
    process.env.PAYMENT_REDIRECT_BASE || "https://payment.example.com"
  }/pay/${reference}`;
  return { reference, paymentUrl };
}

// export function verifyWebhookSignature(
//   rawBody: string,
//   signature: string | undefined
// ): boolean {
//   // TODO: implement provider-specific signature verification
//   // For Paystack: compute HMAC-SHA512 with PAYSTACK_SECRET and compare to signature
//   const secret = process.env.PAYSTACK_SECRET_KEY || "";
//   if (!secret || !signature) return false;
//   const hmac = crypto
//     .createHmac("sha512", secret)
//     .update(rawBody)
//     .digest("hex");
//   console.log("Computed HMAC:", hmac);
//   console.log("Signature:", signature);

//   if (hmac !== signature) {
//     logger.warn("⚠️ Invalid Paystack signature");
//     throw unauthorized("Unauthorized webhook");
//   }

//   return hmac === signature;
// }

export function verifyPaystackSignature(
  rawBody: Buffer | string,
  signature?: string,
): boolean {
  const secret = process.env.PAYSTACK_SECRET_KEY;

  if (!secret || !signature) return false;

  const hash = crypto
    .createHmac("sha512", secret)
    .update(rawBody)
    .digest("hex");

  if (hash !== signature) {
     logger.warn("⚠️ Invalid Paystack signature");
     throw unauthorized("Unauthorized webhook");
   }

  // return hash === signature;
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
}
