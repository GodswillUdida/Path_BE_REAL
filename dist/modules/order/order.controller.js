"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOrder = exports.createOrder = void 0;
const order_schema_1 = require("./order.schema");
const order_service_1 = require("./order.service");
const logger_1 = __importDefault(require("../../utils/logger"));
const createOrder = async (req, res, next) => {
    try {
        const userId = req.user.userId || req.user.id;
        const body = order_schema_1.createOrderSchema.parse(req.body);
        const result = await (0, order_service_1.createOrderService)(userId, body);
        return res.status(201).json({
            success: true,
            data: result
        });
    }
    catch (err) {
        logger_1.default.error("createOrder error", err);
        return next(err);
    }
};
exports.createOrder = createOrder;
const getOrder = async (req, res, next) => {
    try {
        const userId = req.user.userId || req.user.id;
        const orderId = req.params.id;
        const order = await (0, order_service_1.getOrderService)(userId, orderId);
        return res.json({ success: true, data: order });
    }
    catch (err) {
        return next(err);
    }
};
exports.getOrder = getOrder;
