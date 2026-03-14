"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.paystackWebhookController = exports.verifyPaymentController = exports.initializePaymentController = void 0;
const logger_1 = __importDefault(require("../../utils/logger"));
const asyncHandler_1 = require("../../utils/asyncHandler");
const payment_service_1 = require("./payment.service");
const payment_schema_1 = require("./payment.schema");
exports.initializePaymentController = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { orderId } = payment_schema_1.InitializePaymentSchema.parse(req.body);
    const paymentData = await (0, payment_service_1.initiatePaystackPayment)(orderId);
    res.status(200).json({
        success: true,
        message: "Payment session initialized – redirect user to paymentLink",
        data: paymentData, // { paymentLink, reference, accessCode }
    });
});
exports.verifyPaymentController = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { reference } = req.query;
    if (!reference || typeof reference !== "string") {
        return res
            .status(400)
            .json({ success: false, message: "Missing reference" });
    }
    const result = await (0, payment_service_1.verifyPayment)(reference);
    res.status(200).json(result);
});
const paystackWebhookController = async (req, res) => {
    try {
        const rawBody = Buffer.isBuffer(req.body)
            ? req.body.toString("utf-8")
            : JSON.stringify(req.body);
        const signature = req.headers["x-paystack-signature"];
        const result = await (0, payment_service_1.processPaymentWebhook)(rawBody, signature);
        // Always return 200 to Paystack (prevents retries)
        return res.status(200).json({
            success: true,
            message: "Webhook received",
            ...result,
        });
    }
    catch (err) {
        logger_1.default.error("Paystack webhook error", {
            error: err.message,
            reference: req.body?.data?.reference,
            signature: req.headers["x-paystack-signature"],
        });
        // Never send error status — Paystack must always get 200
        return res.status(200).send("Webhook received");
    }
};
exports.paystackWebhookController = paystackWebhookController;
