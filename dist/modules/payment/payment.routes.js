"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/modules/payment/payment.routes.ts
const express_1 = require("express");
const payment_controller_1 = require("./payment.controller");
const r = (0, express_1.Router)();
// Public payment routes (match your frontend API_BASE calls)
r.post("/paystack/initialize", payment_controller_1.initializePaymentController);
r.get("/verify", payment_controller_1.verifyPaymentController); // ← new (used by /checkout/success)
// Webhook – raw body parser applied ONLY to this route (correct & secure)
r.post("/webhook/paystack", (0, express_1.raw)({ type: "application/json", limit: "5mb" }), // use your BODY_LIMIT here
payment_controller_1.paystackWebhookController);
exports.default = r;
