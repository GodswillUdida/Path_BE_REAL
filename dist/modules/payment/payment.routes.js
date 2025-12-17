"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/modules/payment/payment.routes.ts
const express_1 = require("express");
const payment_controller_1 = require("./payment.controller");
const r = (0, express_1.Router)();
r.post("/webhook/paystack", (0, express_1.raw)({ type: "*/*" }), payment_controller_1.paymentWebhook);
exports.default = r;
