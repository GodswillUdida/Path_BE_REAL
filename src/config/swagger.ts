// swagger.config.ts (Separate file for Swagger configuration to improve modularity and maintainability)
import swaggerJsdoc from "swagger-jsdoc";

const version = process.env.npm_package_version;
// Environment-aware servers (use env vars for flexibility/scalability across dev/staging/prod)
const servers = [
  {
    url:
      process.env.API_BASE_URL ||
      `http://localhost:${process.env.PORT || 5000}/api/v1`,
    description: "Development server",
  },
];

if (process.env.NODE_ENV === "production") {
  servers.push({
    url:
      process.env.PROD_API_BASE_URL ||
      "https://api.accountantpathfinder.com/api/v1",
    description: "Production server",
  });
}

// Swagger options: Enhanced with more metadata for better docs (SEO, usability)
// - OpenAPI 3.1.0 for modern features (e.g., better JSON Schema support)
// - Add contact/license for professionalism
// - Security schemes: Assuming JWT auth in /auth routes; customize as needed
// - apis: Use .ts paths; if building to JS, adjust to './dist/**/*.js' or use a build step
// - For scalability: In prod, consider protecting /api-docs with auth middleware
const swaggerOptions: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.1.0",
    info: {
      title: "Accountant Pathfinder API",
      version: version || "1.0.0",
      description:
        "Comprehensive API for Accountant Pathfinder: Manage programs, courses, enrollments, payments, and more. Built with Express, Prisma, and modern best practices.",
      contact: {
        name: "Support Team",
        email: "pathinderofficialteam@gmail.com",
        url: "https://accountant-pathfinder.vercel.app",
      },
      license: {
        name: "MIT",
        url: "https://opensource.org/licenses/MIT",
      },
    },
    servers,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT", // Assuming JWT for auth routes; adjust if using API keys/cookies
        },
      },
    },
    security: [{ bearerAuth: [] }], // Global security; override per route in JSDoc
  },
  apis: ["./src/modules/**/*.routes.ts"], // Adjust to your source structure; use wildcards for all routes
  // For performance: If many files, specify explicitly or use a glob pattern that avoids unnecessary scans
};

export const swaggerSpec = swaggerJsdoc(swaggerOptions);
