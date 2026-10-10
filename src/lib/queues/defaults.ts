import { JobsOptions } from "bullmq";

export const defaultJobOptions: JobsOptions = {
  attempts: 5,

  backoff: { 
    type: "exponential", 
    delay: 10_000 
  },
  // Memory optimization: Strict limits keep Redis lean and fast
  removeOnComplete: { 
    age: 24 * 3600, // 24 Hours
    count: 500      // Keeps latest 500 completed items max
  },
  removeOnFail: { 
    age: 7 * 24 * 3600, // 7 Days for debugging
    count: 3000         // Prevents memory crashes from high-frequency stack traces
  },
};