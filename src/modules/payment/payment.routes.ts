// src/modules/payment/payment.routes.ts
import { Router } from "express";
import { paymentWebhook } from "./payment.controller";

const r = Router();
r.post("/webhook", paymentWebhook);

export default r;