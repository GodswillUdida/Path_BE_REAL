import { sign, verify, JsonWebTokenError } from "jsonwebtoken";
import { Role } from "@prisma/client";
import { z } from "zod";
import { envConfig } from "@/config/envConfig";

const accessSecret = envConfig.jwtAccessSecret;
const refreshSecret = envConfig.jwtRefreshSecret;
const verifiedSecret = envConfig.security.verifiedTokenSecret;
const verifiedTokenTtl = envConfig.security.verifiedTokenTtlSeconds;

const ALGORITHMS: ["HS256"] = ["HS256"];
const VERIFIED_ISSUER = "checkout-service";


// ─── Schemas (types are derived, never hand-written) ────────────────────────
const accessPayloadSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(Role).optional(),
  emailVerified: z.boolean().optional(),
});

const refreshPayloadSchema = z.object({
  userId: z.string().min(1),
  tokenId: z.string().min(1),
});

const verifiedPayloadSchema = z.object({
  email: z.email(),
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
  sign(payload, accessSecret, { expiresIn: "15m", algorithm: "HS256" });

export const verifyAccessToken = (token: string): AccessTokenPayload =>
  parsePayload(
    accessPayloadSchema,
    verify(token, accessSecret, { algorithms: ALGORITHMS }),
  );

// ─── Refresh ────────────────────────────────────────────────────────────────
export const signRefreshToken = (payload: RefreshTokenPayload): string =>
  sign(payload, refreshSecret, { expiresIn: "7d", algorithm: "HS256" });

export const verifyRefreshToken = (token: string): RefreshTokenPayload =>
  parsePayload(
    refreshPayloadSchema,
    verify(token, refreshSecret, { algorithms: ALGORITHMS }),
  );

// ─── Guest-checkout verified token ──────────────────────────────────────────
export const signVerifiedToken = (payload: VerifiedTokenPayload): string =>
  sign(payload, verifiedSecret , {
    expiresIn: verifiedTokenTtl,
    issuer: VERIFIED_ISSUER,
    algorithm: "HS256",
  });

export function verifyVerifiedToken(token: string): VerifiedTokenPayload | null {
  try {
    return parsePayload(
      verifiedPayloadSchema,
      verify(token, verifiedSecret , {
        issuer: VERIFIED_ISSUER,
        algorithms: ALGORITHMS,
      }),
    );
  } catch {
    return null;
  }
}