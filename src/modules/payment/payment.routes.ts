// src/modules/payment/payment.routes.ts
import { Router, raw } from "express";
import { paymentWebhook } from "./payment.controller";

const r = Router();
r.post("/webhook/paystack", raw({ type: "*/*" }), paymentWebhook);

export default r;
