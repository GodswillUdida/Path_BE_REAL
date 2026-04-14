import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.G_ID!,
      clientSecret: process.env.G_SECRET!,
      callbackURL: `${process.env.BACKEND_URL}/api/v1/auth/google/callback`.replace(
        /\/$/,
        "",
      ),
      scope: ["openid", "profile", "email"],
      passReqToCallback: true,
    },
    async (
      req: any,
      accessToken: string,
      refreshToken: string,
      profile: any,
      done: any,
    ) => {
      try {

          console.log("access token:", accessToken);
          console.log("refresh token:", refreshToken);
          console.log("email:", profile._json.email);

        return done(null, profile); // ← we handle everything in processGoogleOAuth
      } catch (err) {
        return done(err);
      }
    },
  ),
);

passport.serializeUser((user, done) => {
  return done(null, user);
});

passport.deserializeUser((user, done) => {
  return done(null, user!);
});
