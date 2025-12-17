"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processPaymentWebhook = exports.initiatePaystackPayment = void 0;
const axios_1 = __importDefault(require("axios"));
const prisma_1 = __importDefault(require("../../lib/prisma"));
const logger_1 = __importDefault(require("../../utils/logger"));
const error_1 = require("../../middleware/error");
const paymentProvider_1 = require("../../lib/paymentProvider");
const emailService_1 = require("../../services/emailService");
// -------------------------------------------------------------
// 1. INITIATE PAYMENT (Paystack)
// -------------------------------------------------------------
const initiatePaystackPayment = async (orderId) => {
    const order = await prisma_1.default.order.findUnique({
        where: { id: orderId },
        include: { user: true },
    });
    if (!order)
        throw new error_1.AppError("Order not found", 404);
    try {
        const response = await axios_1.default.post("https://api.paystack.co/transaction/initialize", {
            reference: order.id,
            email: order.user.email,
            currency: order.currency,
            amount: order.amount * 100,
            callback_url: `${process.env.FRONTEND_URL}/payment/processing?reference=${order.id}`,
            metadata: {
                orderId: order.id,
            },
        }, {
            headers: {
                Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
                "Content-Type": "application/json",
            },
        });
        const { authorization_url, reference } = response.data.data;
        return {
            paymentLink: authorization_url,
            reference,
        };
    }
    catch (err) {
        logger_1.default.error(`❌ Paystack payment initiation failed → ${err.response?.data?.message || err.message}`);
        throw new error_1.AppError("Failed to initiate payment", 500);
    }
};
exports.initiatePaystackPayment = initiatePaystackPayment;
// -------------------------------------------------------------
// 2. PROCESS WEBHOOK
// -------------------------------------------------------------
const processPaymentWebhook = async (rawBody, headers) => {
    const signature = headers["x-paystack-signature"] ||
        headers["x-flw-signature"] ||
        headers["paystack-signature"];
    if (!(0, paymentProvider_1.verifyWebhookSignature)(rawBody, signature)) {
        throw new Error("Invalid webhook signature");
    }
    const payload = JSON.parse(rawBody);
    const event = payload.event || payload.type;
    const data = payload.data || payload;
    const reference = data.reference;
    if (!reference)
        throw new Error("No reference in webhook");
    // Fetch Payment
    const payment = await prisma_1.default.payment.findUnique({ where: { reference } });
    if (!payment) {
        logger_1.default.warn("Payment not found for webhook reference →", { reference });
        return { ok: true };
    }
    const orderId = payment.metadata?.orderId;
    const succeeded = event === "charge.success" ||
        data.status === "success" ||
        data.paid === true ||
        event === "transaction.success";
    // -----------------------------------------------------------
    // FAILED PAYMENT
    // -----------------------------------------------------------
    if (!succeeded) {
        const updates = [
            prisma_1.default.payment.update({
                where: { id: payment.id },
                data: {
                    status: "FAILED",
                    metadata: {
                        ...(typeof payment.metadata === "object" &&
                            payment.metadata !== null
                            ? payment.metadata
                            : {}),
                        providerPayload: data,
                    },
                },
            }),
        ];
        if (orderId) {
            updates.push(prisma_1.default.order.update({
                where: { id: orderId },
                data: { status: "FAILED" },
            }));
        }
        await prisma_1.default.$transaction(updates);
        return { ok: true };
    }
    // -----------------------------------------------------------
    // SUCCESSFUL PAYMENT
    // -----------------------------------------------------------
    await prisma_1.default.payment.update({
        where: { id: payment.id },
        data: {
            status: "PAID",
            metadata: {
                ...(typeof payment.metadata === "object" && payment.metadata !== null
                    ? payment.metadata
                    : {}),
                providerPayload: data,
            },
        },
    });
    // Mark Order as PAID
    // const orderId = (payment.metadata as any)?.orderId;
    // if (orderId) {
    await prisma_1.default.order.update({
        where: { id: orderId },
        data: { status: "PAID" },
    });
    // }
    // Update Enrollments linked to this Order
    const enrollments = await prisma_1.default.enrollment.findMany({ where: { orderId } });
    await prisma_1.default.$transaction(enrollments.map((e) => prisma_1.default.enrollment.update({
        where: { id: e.id },
        data: {
            paymentStatus: "PAID",
            paymentRef: reference,
            startedAt: new Date(),
        },
    })));
    // Send confirmation emails
    for (const e of enrollments) {
        const user = await prisma_1.default.user.findUnique({ where: { id: e.userId } });
        const course = await prisma_1.default.course.findUnique({
            where: { id: e.courseId },
        });
        if (user && course) {
            try {
                await (0, emailService_1.sendConfirmationEmail)(user.email, {
                    name: user.name,
                    email: user.email,
                    courseName: course.title,
                    courseDuration: String(course.duration ?? ""),
                    enrollmentId: e.id,
                    url: `${process.env.FRONTEND_URL}/dashboard`,
                });
            }
            catch (err) {
                logger_1.default.warn("Confirmation email failed →", err);
            }
        }
    }
    // Admin notification
    try {
        // const userEmail = payment.userId
        //   ? (await prisma.user.findUnique({ where: { id: payment.userId } }))?.email
        //   : undefined;
        const usr = await prisma_1.default.user.findUnique({
            where: { id: payment.userId },
        });
        await (0, emailService_1.sendAdminNotification)({
            name: "Order Payment Received",
            email: usr?.email,
            enrollmentId: enrollments.map((x) => x.id).join(","),
        });
    }
    catch { }
    return { ok: true };
};
exports.processPaymentWebhook = processPaymentWebhook;
