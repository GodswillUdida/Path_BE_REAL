import { sign, verify, JsonWebTokenError } from "jsonwebtoken";
import { Role } from "@prisma/client";
import { z } from "zod";
import { envConfig } from "@/config/env";

const env = z
  .object({
    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),
    VERIFIED_TOKEN_SECRET: z.string().min(32),
    VERIFIED_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  })
  .refine((e) => e.JWT_ACCESS_SECRET !== e.JWT_REFRESH_SECRET, {
    message: "JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ",
  })
  .parse({
    JWT_ACCESS_SECRET: envConfig.jwtAccessSecret,
    JWT_REFRESH_SECRET: envConfig.jwtRefreshSecret,
    VERIFIED_TOKEN_SECRET: envConfig.security.
      
    VERIFIED_TOKEN_TTL_SECONDS: envConfig.securityTokens.verifiedTokenTtlSeconds,
  });

const ALGORITHMS: ["HS256"] = ["HS256"];
const VERIFIED_ISSUER = "checkout-service";


// ─── Schemas (types are derived, never hand-written) ────────────────────────
const accessPayloadSchema = z.object({
  userId: z.string().min(1),
  role: z.nativeEnum(Role).optional(),
  emailVerified: z.boolean().optional(),
});

const refreshPayloadSchema = z.object({
  userId: z.string().min(1),
  tokenId: z.string().min(1),
});

const verifiedPayloadSchema = z.object({
  email: z.string().email(),
  purpose: z.literal("guest-checkout"),
});

export type AccessTokenPayload = z.infer<typeof accessPayloadSchema>;
export type RefreshTokenPayload = z.infer<typeof refreshPayloadSchema>;
export type VerifiedTokenPayload = z.infer<typeof verifiedPayloadSchema>;

function parsePayload<T>(schema: z.ZodType<T>, decoded: unknown): T {
  const result = schema.safeParse(decoded);
  if (!result.success) throw new JsonWebTokenError("Invalid token payload");
  return result.data;
}

// ─── Access ─────────────────────────────────────────────────────────────────
export const signAccessToken = (payload: AccessTokenPayload): string =>
  sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: "15m", algorithm: "HS256" });

export const verifyAccessToken = (token: string): AccessTokenPayload =>
  parsePayload(
    accessPayloadSchema,
    verify(token, env.JWT_ACCESS_SECRET, { algorithms: ALGORITHMS }),
  );

// ─── Refresh ────────────────────────────────────────────────────────────────
export const signRefreshToken = (payload: RefreshTokenPayload): string =>
  sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: "7d", algorithm: "HS256" });

export const verifyRefreshToken = (token: string): RefreshTokenPayload =>
  parsePayload(
    refreshPayloadSchema,
    verify(token, env.JWT_REFRESH_SECRET, { algorithms: ALGORITHMS }),
  );

// ─── Guest-checkout verified token ──────────────────────────────────────────
export const signVerifiedToken = (payload: VerifiedTokenPayload): string =>
  sign(payload, env.VERIFIED_TOKEN_SECRET, {
    expiresIn: env.VERIFIED_TOKEN_TTL_SECONDS,
    issuer: VERIFIED_ISSUER,
    algorithm: "HS256",
  });

export function verifyVerifiedToken(token: string): VerifiedTokenPayload | null {
  try {
    return parsePayload(
      verifiedPayloadSchema,
      verify(token, env.VERIFIED_TOKEN_SECRET, {
        issuer: VERIFIED_ISSUER,
        algorithms: ALGORITHMS,
      }),
    );
  } catch {
    return null;
  }
}