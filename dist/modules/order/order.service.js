"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOrderService = createOrderService;
exports.getOrderService = getOrderService;
// src/modules/order/order.service.ts
const prisma_1 = __importDefault(require("../../lib/prisma"));
const errors_1 = require("../../utils/errors");
// import { createCheckout } from "../../lib/paymentProvider";
const payment_service_1 = require("../../modules/payment/payment.service");
async function createOrderService(userId, dto) {
    const { enrollmentIds, currency } = dto;
    // fetch enrollments & validate ownership + pending
    const enrollments = await prisma_1.default.enrollment.findMany({
        where: { id: { in: enrollmentIds } },
        include: { pricing: true, course: true },
    });
    if (enrollments.length !== enrollmentIds.length)
        throw (0, errors_1.notFound)("One or more enrollments not found");
    for (const e of enrollments) {
        if (e.userId !== userId)
            throw (0, errors_1.forbidden)("Cannot create order for enrollments that are not yours");
        if (e.paymentStatus === "PAID")
            throw (0, errors_1.forbidden)(`Enrollment already paid for course ${e.course.title}`);
    }
    const amount = enrollments.reduce((acc, e) => acc + Number(e.pricing.price), 0);
    // Create order
    const order = await prisma_1.default.order.create({
        data: {
            userId,
            amount,
            currency: currency ?? "NGN",
            status: "PENDING",
            enrollments: {
                connect: enrollmentIds.map((id) => ({ id })),
            },
        },
    });
    // attach enrollments to order in transaction and update enrollments.orderId
    await prisma_1.default.$transaction([
        prisma_1.default.enrollment.updateMany({
            where: { id: { in: enrollmentIds } },
            data: { orderId: order.id },
        }),
    ]);
    // Create payment intent with provider
    // const callbackUrl = `${process.env.BASE_URL}/api/payment/webhook`; // provider should call this
    const { reference, paymentLink } = await (0, payment_service_1.initiatePaystackPayment)(order.id);
    // Create a Payment record for the order with status PENDING and provider reference
    await prisma_1.default.payment.create({
        data: {
            userId,
            orderId: order.id,
            reference,
            amount,
            currency: currency ?? "NGN",
            status: "PENDING",
            gateway: "paystack",
            metadata: { orderId: order.id },
        },
    });
    // return order + payment link
    return {
        orderId: order.id,
        amount,
        currency: currency ?? "NGN",
        paymentLink: paymentLink,
        reference,
    };
}
async function getOrderService(userId, orderId) {
    const order = await prisma_1.default.order.findUnique({
        where: { id: orderId },
        include: {
            payments: true,
            enrollments: { include: { course: true, pricing: true } },
        },
    });
    if (!order)
        throw (0, errors_1.notFound)("Order not found");
    if (order.userId !== userId)
        throw (0, errors_1.unauthorized)("Unauthorized order access");
    return order;
}
