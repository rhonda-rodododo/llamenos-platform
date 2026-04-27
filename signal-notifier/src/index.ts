/**
 * Signal Notifier Sidecar
 *
 * HTTP service that bridges the Llamenos app to signal-cli-rest-api.
 * Receives notification requests from the main app (authenticated via BEARER_TOKEN),
 * queues them in SQLite for durability, and delivers them to signal-cli.
 *
 * Actual notification logic is implemented by the notification service feature.
 * This skeleton sets up the HTTP server, health endpoint, and auth middleware.
 */

import { Hono } from "hono";

const port = parseInt(process.env.PORT ?? "3100", 10);
const bearerToken = process.env.BEARER_TOKEN;
const signalCliUrl = process.env.SIGNAL_CLI_URL ?? "http://signal-cli:8080";

if (!bearerToken) {
  console.error("FATAL: BEARER_TOKEN environment variable is required");
  process.exit(1);
}

const app = new Hono();

// Health check — unauthenticated, used by Docker health check
app.get("/health", (c) => {
  return c.json({ status: "ok", signalCliUrl });
});

// Auth middleware for all other routes
app.use("/*", async (c, next) => {
  const auth = c.req.header("Authorization");
  if (auth !== `Bearer ${bearerToken}`) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  return next();
});

// Placeholder: notification delivery endpoint
// Full implementation added by the notification service feature
app.post("/notify", async (c) => {
  return c.json({ error: "Not implemented" }, 501);
});

console.log(`signal-notifier listening on port ${port}`);
console.log(`signal-cli endpoint: ${signalCliUrl}`);

export default {
  port,
  fetch: app.fetch,
};
