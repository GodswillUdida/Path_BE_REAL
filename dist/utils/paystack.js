"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validatePaystackWebhook = exports.initiatePaystackPayment = void 0;
const axios_1 = __importDefault(require("axios"));
const crypto_1 = __importDefault(require("crypto"));
const initiatePaystackPayment = async ({ email, amount, enrollmentId }) => {
    const response = await axios_1.default.post('https://api.paystack.co/transaction/initialize', {
        email,
        amount: amount * 100,
        metadata: { enrollmentId },
        callback_url: `${process.env.FRONTEND_URL}/payment-success`,
    }, {
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET}` },
    });
    return response.data.data.authorization_url;
};
exports.initiatePaystackPayment = initiatePaystackPayment;
const validatePaystackWebhook = (req) => {
    const hash = crypto_1.default.createHmac('sha512', process.env.PAYSTACK_SECRET)
        .update(req.body)
        .digest('hex');
    return hash === req.headers['x-paystack-signature'];
};
exports.validatePaystackWebhook = validatePaystackWebhook;
