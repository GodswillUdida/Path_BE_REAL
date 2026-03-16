// src/modules/payment/payment.routes.ts
import { Router, raw } from "express";
import {
  initializePaymentController,
  verifyPaymentController, // ← new
  paystackWebhookController,
} from "./payment.controller";

const r = Router();

// Public payment routes (match your frontend API_BASE calls)
r.post("/paystack/initialize", initializePaymentController);
r.get("/verify", verifyPaymentController); // ← new (used by /checkout/success)

// Webhook – raw body parser applied ONLY to this route (correct & secure)
r.post(
  "/webhook/paystack",
  raw({ type: "application/json", limit: "5mb" }), // use your BODY_LIMIT here
  paystackWebhookController,
);

export default r;
