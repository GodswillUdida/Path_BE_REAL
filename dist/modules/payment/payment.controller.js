"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymentWebhook = void 0;
const logger_1 = __importDefault(require("../../utils/logger"));
const payment_service_1 = require("./payment.service");
const paymentWebhook = async (req, res) => {
    try {
        // const raw =
        //   req.body instanceof Buffer
        //     ? req.body.toString("utf-8")
        //     : JSON.stringify(req.body);
        const result = await (0, payment_service_1.processPaymentWebhook)(req.body.toString("utf-8"), req.headers);
        // await processPaymentWebhook(raw, req.headers as any);
        return res.status(200).send({
            success: true,
            ...result,
        });
    }
    catch (err) {
        logger_1.default.error("Payment webhook error", err);
        return res.status(400).json({
            success: false,
            message: err.message || "Webhook processing failed",
        });
    }
};
exports.paymentWebhook = paymentWebhook;
