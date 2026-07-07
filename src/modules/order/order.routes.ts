import { Router } from "express";
import { getMyOrders, getOneOrder, createOrderController } from "./order.controller";
import { authGuard } from "../../middleware/authGuard";

const r = Router();

r.post("/", authGuard, createOrderController);

r.get("/orders", authGuard, getMyOrders);

r.get("/order/:id", authGuard, getOneOrder);

export default r;