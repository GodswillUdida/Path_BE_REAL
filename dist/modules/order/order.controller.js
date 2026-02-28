"use strict";
// // src/modules/order/order.controller.ts
// import { Request, Response, NextFunction } from "express";
// import { createOrderSchema } from "./order.schema";
// import { createOrderService, getOrderService } from "./order.service";
// import logger from "../../utils/logger";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOneOrder = exports.getMyOrders = exports.createOrder = void 0;
const order_schema_1 = require("./order.schema");
const logger_1 = __importDefault(require("../../utils/logger"));
const order_service_1 = require("./order.service");
const createOrder = async (req, res, next) => {
    const userId = req.user.userId || req.user.id;
    try {
        const body = order_schema_1.CreateOrderSchema.parse(req.body);
        // body is always array thanks to Zod transform
        const data = await (0, order_service_1.createOrderService)(userId, body);
        return res.status(201).json({
            success: true,
            message: `Order created successfully (${data.items.length} item${data.items.length > 1 ? "s" : ""})`,
            data,
        });
    }
    catch (err) {
        logger_1.default.error(`Order creation failed for user ${userId}`, {
            error: err.message,
            body: req.body,
        });
        const status = err.status || 500;
        return res.status(status).json({
            success: false,
            message: err.message || "Failed to create order",
        });
    }
};
exports.createOrder = createOrder;
const getMyOrders = async (req, res, next) => {
    const userId = req.user.userId || req.user.id;
    try {
        const data = await (0, order_service_1.getUserOrdersService)(userId);
        return res.json({ success: true, data });
    }
    catch (err) {
        logger_1.default.error(`Failed to fetch orders for user ${userId}`, err);
        const status = err.status || 500;
        return res.status(status).json({
            success: false,
            message: err.message || "Failed to fetch orders",
        });
    }
};
exports.getMyOrders = getMyOrders;
const getOneOrder = async (req, res, next) => {
    const userId = req.user.userId || req.user.id;
    const orderId = req.params.id;
    try {
        const data = await (0, order_service_1.getOneOrderService)(orderId, userId);
        return res.json({ success: true, data });
    }
    catch (err) {
        logger_1.default.error(`Failed to fetch order ${orderId} for user ${userId}`, err);
        const status = err.status || 500;
        return res.status(status).json({
            success: false,
            message: err.message || "Failed to fetch order",
        });
    }
};
exports.getOneOrder = getOneOrder;
