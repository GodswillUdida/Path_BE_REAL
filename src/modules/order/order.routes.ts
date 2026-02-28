// // src/modules/order/order.routes.ts
// import { Router } from "express";
// import { authGuard } from "../../middleware/authGuard";
// import { createOrder, getOrder } from "./order.controller";

// const r = Router();

// r.post("/", authGuard, createOrder);
// r.get("/:id", authGuard, getOrder);

// export default r;

// order.router.ts
// Rewritten & Enhanced — February 2026
// Clean, documented, production-ready (same style as enrollment.router.ts)

import { Router } from "express";
import {
  createOrder,
  getMyOrders,
  getOneOrder,
} from "./order.controller";
import { authGuard } from "../../middleware/authGuard";

const router = Router();

/**
 * POST /orders
 * Create new order (single item or array of items)
 * Body: { pricingId, quantity? } or array
 * Protected: authGuard
 * Returns order with orderItem IDs ready for enrollment
 */
router.post("/", authGuard, createOrder);

/**
 * GET /orders/mine
 * Get all orders for authenticated user
 * Protected: authGuard
 */
router.get("/mine", authGuard, getMyOrders);

/**
 * GET /orders/:id
 * Get single order (ownership enforced)
 * Protected: authGuard
 */
router.get("/:id", authGuard, getOneOrder);

export default router;
