/**
 * @file config/passport.ts
 *
 * Passport initialisation — Google OAuth 2.0 only.
 *
 * Responsibilities of this file are intentionally narrow:
 *   1. Validate required environment variables at startup
 *   2. Register the GoogleStrategy with the correct callback URL
 *   3. Delegate all user-resolution logic to `auth.service`
 *
 * User-lookup / upsert logic lives in `auth.service.handleGoogleUser` so it
 * can be unit-tested independently of Passport internals.
 */

import passport from "passport";
import {
  Strategy as GoogleStrategy,
  type Profile,
  type VerifyCallback,
} from "passport-google-oauth20";
import { handleGoogleUser } from "../modules/auth/auth.service";
import logger from "../utils/logger";

// ─── Environment Validation ───────────────────────────────────────────────────

/**
 * Asserts a required environment variable is present.
 * Throws at module-load time so a misconfigured deployment fails loudly on
 * startup rather than silently at the first OAuth redirect.
 */
function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

const G_ID     = requireEnv("G_ID");
const G_SECRET = requireEnv("G_SECRET");
const GOOGLE_CALLBACK_URL  = `${requireEnv("BACKEND_URL")}/api/v1/auth/google/callback`;

// ─── Strategy ─────────────────────────────────────────────────────────────────

passport.use(
  new GoogleStrategy(
    {
      clientID:     G_ID,
      clientSecret: G_SECRET,
      callbackURL:  GOOGLE_CALLBACK_URL,
    },
    async (
      _accessToken: string,
      _refreshToken: string,
      profile: Profile,
      done: VerifyCallback,
    ): Promise<void> => {
      try {
        const user = await handleGoogleUser(profile);
        done(null, user);
      } catch (err) {
        logger.error("Google OAuth strategy error");
        done(err as Error, undefined);
      }
    },
  ),
);

export default passport;