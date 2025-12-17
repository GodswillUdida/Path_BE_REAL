"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handlePaystackWebhook = void 0;
const crypto_1 = __importDefault(require("crypto"));
const prisma_1 = __importDefault(require("../../lib/prisma"));
const logger_1 = __importDefault(require("../../utils/logger"));
const handlePaystackWebhook = async (req, res) => {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    const signature = req.headers["x-paystack-signature"];
    const raw = req.body.toString("utf8");
    const computed = crypto_1.default
        .createHmac("sha512", secret)
        .update(raw)
        .digest("hex");
    if (computed !== signature) {
        logger_1.default.warn("Invalid Paystack signature");
        return res.sendStatus(401);
    }
    const event = JSON.parse(raw);
    // Only handle charge.success
    if (event.event !== "charge.success") {
        return res.sendStatus(200);
    }
    const ref = event.data.reference;
    const amountPaid = event.data.amount / 100;
    const payment = await prisma_1.default.payment.findUnique({
        where: { reference: ref },
        include: { order: true },
    });
    if (!payment) {
        logger_1.default.error(`Payment not found for reference → ${ref}`);
        return res.sendStatus(404);
    }
    // Update payment record
    await prisma_1.default.payment.update({
        where: { id: payment.id },
        data: {
            status: "PAID",
            amount: amountPaid,
            metadata: event.data,
        },
    });
    // Update order
    await prisma_1.default.order.update({
        where: { id: payment.orderId },
        data: { status: "PAID" },
    });
    // Update all enrollments tied to this order
    await prisma_1.default.enrollment.updateMany({
        where: { orderId: payment.orderId },
        data: {
            paymentStatus: "PAID",
        },
    });
    // Log webhook
    //   await prisma.webhookLog.create({
    //     data: {
    //       provider: "paystack",
    //       eventType: event.event,
    //       payload: event.data,
    //     },
    //   });
    logger_1.default.info(`Order ${payment.orderId} marked PAID ✔`);
    return res.sendStatus(200);
};
exports.handlePaystackWebhook = handlePaystackWebhook;
