// src/modules/auth/strategies/google.strategy.ts
const passport = require("passport");
import {
  Strategy as GoogleStrategy,
  Profile,
  VerifyCallback,
} from "passport-google-oauth20";
import { prisma } from "@/lib/prisma";
import { envConfig } from "@/config/envConfig";

export function configureGoogleStrategy() {
  passport.use(
    new GoogleStrategy(
      {
        clientID: envConfig.google.id,
        clientSecret: envConfig.google.secret,
        callbackURL: envConfig.google.callbackUrl, // e.g. https://api.yourdomain.com/auth/google/callback
        scope: ["openid", "profile", "email"],
      },
      async (
        _accessToken: string,
        _refreshToken: string,
        profile: Profile,
        done: VerifyCallback,
      ) => {
        try {
          const email = profile.emails?.[0]?.value?.toLowerCase();
          if (!email) {
            return done(new Error("Google account has no email"), undefined);
          }

          // Find or create user
          let user = await prisma.user.findUnique({ where: { email } });

          if (!user) {
            user = await prisma.user.create({
              data: {
                email,
                name: profile.displayName || email.split("@")[0],
                emailVerified: true, // Google emails are verified
                profileImage: profile.photos?.[0]?.value ?? null,
                accounts: {
                  create: {
                    provider: "google",
                    providerId: profile.id,
                  },
                },
              },
            });
          }

          // Optional: link Google provider id if you store it
          await prisma.account.upsert({
            where: {
              provider_providerId: {
                provider: "google",
                providerId: profile.id,
              },
            },

            update: {},
            create: {
              provider: "google",
              providerId: profile.id,
              userId: user.id,
            },
          });

          return done(null, { ...user, userId: user.id });
        } catch (err) {
          return done(err as Error, undefined);
        }
      },
    ),
  );
}
