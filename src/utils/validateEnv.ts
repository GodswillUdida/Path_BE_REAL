export const validateEnv = (required: string[]) => {
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(
      `🛑 Missing required environment variables: ${missing.join(", ")}`
    );
    process.exit(1);
  }
};
