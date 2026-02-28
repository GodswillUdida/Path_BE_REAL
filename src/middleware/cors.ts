import { CorsOptions } from "cors";

const allowedOrigins = [
  "*",
  "http://localhost:5173",
  "http://localhost:3000",
  "https://accountant-pathfinder.vercel.app",
  "https://lq8gym-3000.csb.app",
  "https://path-be-real.onrender.com",
  "https://sturdy-spoon-x5px4xv6v6x53465-3000.app.github.dev",
];

export const corsOptions: CorsOptions = {
  origin: (
    origin: string | undefined,
    callback: (err: Error | null, origin?: any) => void,
  ) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("CORS not allowed from this origin"));
    }
  },
  credentials: true,
  optionsSuccessStatus: 204,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  allowedHeaders: [
    "Origin",
    "X-Requested-With",
    "Content-Type",
    "Accept",
    "Authorization",
  ],
};
