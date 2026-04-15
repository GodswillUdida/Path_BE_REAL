import prisma from "../../lib/prisma";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";


// Temporary — add to the top of passport.config.ts, remove after confirming
console.log("G_ID loaded:", !!process.env.G_ID);
console.log("G_SECRET loaded:", !!process.env.G_SECRET);
console.log("BACKEND_URL:", process.env.BACKEND_URL);

// Store only the user ID — never the entire profile object
passport.serializeUser((user: Express.User, done) => {
  done(null, (user as { id: string }).id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    done(null, user ?? false);
  } catch (err) {
    done(err);
  }
});

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.G_ID!,
      clientSecret: process.env.G_SECRET!,
      // Never hardcode localhost — use env var for both local and prod
      callbackURL: `${process.env.BACKEND_URL}/api/v1/auth/google/callback`.replace(/\/$/, ""),
      scope: ["openid", "profile", "email"],
      // passReqToCallback removed — not used
    },
    async (_accessToken, _refreshToken, profile, done) => {
      // Passport strategy is a thin adapter only.
      // All business logic lives in processGoogleOAuth.
      try {
        return done(null, profile);
      } catch (err) {
        return done(err as Error);
      }
    },
  ),
);

export default passport;
