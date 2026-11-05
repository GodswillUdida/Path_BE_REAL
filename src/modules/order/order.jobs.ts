// src/modules/order/order.jobs.ts

export interface OrderExpirationPayload {
  orderId: string;
  userId: string;
}

export interface OrderSweepPayload {
  kind: "sweep";
}