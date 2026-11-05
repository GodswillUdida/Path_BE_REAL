/**
 * payment.paystack.client.ts
 * The only place that talks to Paystack over HTTP.
 *  - Reads the secret key per request (not at import time).
 *  - Throws a sanitized PaystackError. Raw axios errors carry
 *    config.headers.Authorization (the secret key) and must NEVER reach a
 *    logger.
 */

import axios, { type AxiosError } from "axios";
import { withRetry } from "@/utils/retry";

export class PaystackError extends Error {
  constructor(
    message: string,
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = "PaystackError";
  }
}

const http = axios.create({
  baseURL: "https://api.paystack.co",
  timeout: 15_000,
  headers: { "Content-Type": "application/json" },
});

http.interceptors.request.use((config) => {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new PaystackError("PAYSTACK_SECRET_KEY is not configured");
  config.headers.Authorization = `Bearer ${key}`;
  return config;
});

function sanitize(err: unknown): PaystackError {
  if (err instanceof PaystackError) return err;
  if (axios.isAxiosError(err)) {
    const e = err as AxiosError<{ message?: string }>;
    return new PaystackError(e.response?.data?.message ?? e.message, e.response?.status);
  }
  return new PaystackError(err instanceof Error ? err.message : "Paystack request failed");
}

export interface PaystackInitData {
  authorization_url: string;
  access_code: string;
  reference: string;
}

export interface PaystackTransaction {
  id: number;
  reference: string;
  /** success | failed | abandoned | ongoing | pending | processing | queued | reversed */
  status: string;
  amount: number; // kobo
  currency: string;
}

/**
 * NOT retried: a retry after a lost response would hit "Duplicate
 * Transaction Reference". The caller inserts the Payment row first and marks
 * it FAILED on error, so the customer simply retries with a new reference.
 */
export async function initializeTransaction(payload: {
  reference: string;
  email: string;
  amount: number; // kobo
  currency: string;
  callback_url: string;
  metadata: unknown;
}): Promise<PaystackInitData> {
  try {
    const { data } = await http.post<{ status: boolean; message: string; data: PaystackInitData }>(
      "/transaction/initialize",
      payload,
    );
    if (!data.status) throw new PaystackError(`Paystack init failed: ${data.message}`);
    return data.data;
  } catch (err) {
    throw sanitize(err);
  }
}

/** Idempotent GET, safe to retry. 404 means the customer never opened checkout. */
export async function fetchTransaction(reference: string): Promise<PaystackTransaction> {
  try {
    const { data } = await withRetry(() =>
      http.get<{ status: boolean; message: string; data: PaystackTransaction }>(
        `/transaction/verify/${encodeURIComponent(reference)}`,
      ),
    );
    if (!data.status) throw new PaystackError(data.message);
    return data.data;
  } catch (err) {
    throw sanitize(err);
  }
}