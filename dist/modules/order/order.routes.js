"use strict";
// // src/modules/order/order.routes.ts
// import { Router } from "express";
// import { authGuard } from "../../middleware/authGuard";
// import { createOrder, getOrder } from "./order.controller";
Object.defineProperty(exports, "__esModule", { value: true });
// const r = Router();
// r.post("/", authGuard, createOrder);
// r.get("/:id", authGuard, getOrder);
// export default r;
// order.router.ts
// Rewritten & Enhanced — February 2026
// Clean, documented, production-ready (same style as enrollment.router.ts)
const express_1 = require("express");
const order_controller_1 = require("./order.controller");
const authGuard_1 = require("../../middleware/authGuard");
const router = (0, express_1.Router)();
/**
 * POST /orders
 * Create new order (single item or array of items)
 * Body: { pricingId, quantity? } or array
 * Protected: authGuard
 * Returns order with orderItem IDs ready for enrollment
 */
router.post("/", authGuard_1.authGuard, order_controller_1.createOrder);
/**
 * GET /orders/mine
 * Get all orders for authenticated user
 * Protected: authGuard
 */
router.get("/mine", authGuard_1.authGuard, order_controller_1.getMyOrders);
/**
 * GET /orders/:id
 * Get single order (ownership enforced)
 * Protected: authGuard
 */
router.get("/:id", authGuard_1.authGuard, order_controller_1.getOneOrder);
exports.default = router;
