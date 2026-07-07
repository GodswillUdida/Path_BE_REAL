// src/modules/payment/payment.routes.ts
import { Router, raw } from "express";
import {
  initializePaymentController,
  verifyPaymentController, // ← new
  paystackWebhookController,
} from "./payment.controller";
import { authGuard } from "../../middleware/authGuard";
import { otpLimiter } from "../../middleware/Ratelimiter.middleware";

const r = Router();

// Public payment routes (match your frontend API_BASE calls)
r.post("/paystack/initialize", authGuard, initializePaymentController);
r.get("/verify",
  authGuard,
  // otpLimiter,
  verifyPaymentController);

// Webhook – raw body parser applied ONLY to this route (correct & secure)
r.post(
  "/webhook/paystack",
  raw({ type: "application/json", limit: "1mb" }), // use your BODY_LIMIT here
  paystackWebhookController,
);

export default r;
