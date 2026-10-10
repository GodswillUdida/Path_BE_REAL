import express from "express";
import basicAuth from 'express-basic-auth'
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { topicVideoQueue } from "../modules/topic/topic.queue";
import { authEmailQueue } from "../modules/auth/email.queue";
import { intakeEmailQueue } from "../modules/intake/intake.queue";
import { courseAnalyticsQueue, courseVideoPreviewQueue } from "../modules/course/course.queue";
import { paymentFollowupQueue } from "../modules/payment/payment.queue";
import { resourceUploadQueue } from "@/modules/topic/resource.queue";

export function startBullBoard() {
  const app = express();
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath("/admin/queues");

  createBullBoard({
    queues: [
      new BullMQAdapter(topicVideoQueue),
      new BullMQAdapter(courseVideoPreviewQueue),
      new BullMQAdapter(authEmailQueue),
      new BullMQAdapter(intakeEmailQueue),
      new BullMQAdapter(courseAnalyticsQueue),
      new BullMQAdapter(paymentFollowupQueue),
      new BullMQAdapter(resourceUploadQueue),
    ],
    serverAdapter,
  });

  app.get("/", (_req, res) => {
    res.redirect("/admin/queues");
  });

  app.get("/healthz", (_req, res) => res.status(200).send("ok"));

  app.use(
    "/admin/queues",
    basicAuth({
      users: { [process.env.QUEUE_BOARD_USER!]: process.env.QUEUE_BOARD_PASSWORD! },
      challenge: true,
    }),
    serverAdapter.getRouter(),
  );

  const port = Number(process.env.QUEUE_BOARD_PORT ?? 3001);
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`[bull-board] listening on :${port}`);
  });
}