"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCheckout = createCheckout;
exports.verifyPaystackSignature = verifyPaystackSignature;
// src/lib/paymentProvider.ts
const crypto_1 = __importDefault(require("crypto"));
const logger_1 = __importDefault(require("../utils/logger"));
const errors_1 = require("../utils/errors");
async function createCheckout({ amount, currency, callbackUrl, metadata, }) {
    // TODO: replace with real provider SDK (Paystack / Flutterwave)
    // For Paystack: create transaction and return authorization_url and reference.
    const reference = crypto_1.default.randomBytes(12).toString("hex");
    const paymentUrl = `${process.env.PAYMENT_REDIRECT_BASE || "https://payment.example.com"}/pay/${reference}`;
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
function verifyPaystackSignature(rawBody, signature) {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret || !signature)
        return false;
    const hash = crypto_1.default
        .createHmac("sha512", secret)
        .update(rawBody)
        .digest("hex");
    if (hash !== signature) {
        logger_1.default.warn("⚠️ Invalid Paystack signature");
        throw (0, errors_1.unauthorized)("Unauthorized webhook");
    }
    // return hash === signature;
    return crypto_1.default.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
}
