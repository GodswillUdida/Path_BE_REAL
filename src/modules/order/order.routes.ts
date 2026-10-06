import { Router } from "express";
import { getMyOrders, getOneOrder, createOrderController } from "./order.controller";
import { authGuard } from "../../middleware/authGuard";

const r = Router();

// FIXED: previously GET "/orders" and GET "/order/:id" alongside POST "/".
// If this router is mounted at /api/v1/orders (matching the file/module
// name, and the only sensible mount point given POST "/" already assumes
// it), those paths resolved to /api/v1/orders/orders and
// /api/v1/orders/order/:id — doubled, non-RESTful segments. Standardized
// to GET "/" (list) and GET "/:id" (single), matching every other
// resource router in this codebase.
r.post("/", authGuard, createOrderController);
r.get("/", authGuard, getMyOrders);
r.get("/:id", authGuard, getOneOrder);

export default r;