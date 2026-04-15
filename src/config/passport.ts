import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import type { Profile } from "passport-google-oauth20";

passport.serializeUser((user: Express.User, done) => {
  // Store only the ID — never the full profile
  done(null, (user as { id: string }).id);
});

passport.deserializeUser(async (id: string, done) => {
  // Only needed if you use sessions — for JWT/cookie-only, you can skip this
  done(null, { id } as Express.User);
});

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.G_ID!,
      clientSecret: process.env.G_SECRET!,
      callbackURL: `${process.env.BACKEND_URL}/api/v1/auth/google/callback`.replace(/\/$/, ""),
      scope: ["openid", "profile", "email"],
    },
    // THIS FUNCTION MUST DO ZERO DATABASE WORK.
    // All DB logic lives in processGoogleOAuth, called from the controller.
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        // Pass the raw profile through — controller handles everything
        return done(null, profile as unknown as Express.User);
      } catch (err) {
        return done(err as Error);
      }
    },
  ),
);

export default passport;