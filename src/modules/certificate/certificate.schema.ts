// certificate.schema.ts
import { z } from "zod";

const uuid = z.string().uuid();

export const issueCertificateSchema = z.object({
  body: z.object({
    enrollmentId: uuid,
  }),
});

export const verifyCertificateSchema = z.object({
  params: z.object({
    verification: z.string().min(10),
  }),
});

export type IssueCertificateDTO = z.infer<typeof issueCertificateSchema>;