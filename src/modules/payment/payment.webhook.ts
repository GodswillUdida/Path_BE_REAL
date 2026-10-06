// import crypto from "crypto";
// import { Request, Response } from "express";
// import prisma  from "../../lib/prisma";
// import logger from "../../utils/logger";

// export const handlePaystackWebhook = async (req: Request, res: Response) => {
//   const secret = process.env.PAYSTACK_SECRET_KEY!;
//   const signature = req.headers["x-paystack-signature"];
//   const raw = req.body.toString("utf8");

//   const computed = crypto
//     .createHmac("sha512", secret)
//     .update(raw)
//     .digest("hex");

//   if (computed !== signature) {
//     logger.warn("Invalid Paystack signature");
//     return res.sendStatus(401);
//   }

//   const event = JSON.parse(raw);

//   // Only handle charge.success
//   if (event.event !== "charge.success") {
//     return res.sendStatus(200);
//   }

//   const ref = event.data.reference;
//   const amountPaid = event.data.amount / 100;

//   const payment = await prisma.payment.findUnique({
//     where: { reference: ref },
//     include: { order: true },
//   });

//   if (!payment) {
//     logger.error(`Payment not found for reference → ${ref}`);
//     return res.sendStatus(404);
//   }

//   // Update payment record
//   await prisma.payment.update({
//     where: { id: payment.id },
//     data: {
//       status: "PAID",
//       amount: amountPaid,
//       metadata: event.data,
//     },
//   });

//   // Update order
//   await prisma.order.update({
//     where: { id: payment.orderId },
//     data: { status: "PAID" },
//   });

//   // Update all enrollments tied to this order
//   await prisma.enrollment.updateMany({
//     where: { orderId: payment.orderId },
//     data: {
//       paymentStatus: "PAID",
//     },
//   });

//   // Log webhook
// //   await prisma.webhookLog.create({
// //     data: {
// //       provider: "paystack",
// //       eventType: event.event,
// //       payload: event.data,
// //     },
// //   });

//   logger.info(`Order ${payment.orderId} marked PAID ✔`);

//   return res.sendStatus(200);
// };
