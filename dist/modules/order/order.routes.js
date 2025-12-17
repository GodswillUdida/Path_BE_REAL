"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/modules/order/order.routes.ts
const express_1 = require("express");
const authGuard_1 = require("../../middleware/authGuard");
const order_controller_1 = require("./order.controller");
const r = (0, express_1.Router)();
r.post("/", authGuard_1.authGuard, order_controller_1.createOrder);
r.get("/:id", authGuard_1.authGuard, order_controller_1.getOrder);
exports.default = r;
