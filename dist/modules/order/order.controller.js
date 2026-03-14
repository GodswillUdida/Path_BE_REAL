"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOneOrder = exports.getMyOrders = exports.createOrderController = void 0;
const asyncHandler_1 = require("../../utils/asyncHandler");
const order_service_1 = require("./order.service");
/**
 * Create Order (financial intent only)
 */
exports.createOrderController = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.user?.id || req.user?.userId;
    const order = await (0, order_service_1.createOrder)(req.body, userId);
    res.status(201).json({
        success: true,
        message: "Order created successfully – proceed to payment",
        data: order,
    });
});
/**
 * Get all orders for logged-in user
 */
exports.getMyOrders = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.user.userId || req.user.id;
    const orders = await (0, order_service_1.getUserOrders)(userId);
    res.json({
        success: true,
        data: orders,
    });
});
/**
 * Get single order (with auth check inside service)
 */
exports.getOneOrder = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.user.userId || req.user.id;
    const orderId = req.params.id;
    const order = await (0, order_service_1.getOneOrderService)(orderId, userId);
    res.json({
        success: true,
        data: order,
    });
});
