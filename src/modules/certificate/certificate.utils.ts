// certificate.utils.ts
import crypto from "crypto";

export const generateVerificationCode = (): string => {
  // 32 bytes → base64url safe string
  return crypto.randomBytes(24).toString("base64url");
};