import path from "node:path";
import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { createContributionsRouter } from "./routes/contributions";
import { openStore } from "./contributions/store";
import { logger } from "./lib/logger";

const app: Express = express();

app.disable("x-powered-by");

// Behind a reverse proxy the rate limiter needs the client address, not the
// proxy's. Opt in explicitly: trusting X-Forwarded-For by default would let a
// caller forge their own rate-limit key.
if (process.env.TRUST_PROXY) {
  app.set("trust proxy", process.env.TRUST_PROXY);
}

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Reflecting every origin hands any website on the internet read access to
// this API from a user's browser. Origins are opt-in via CORS_ORIGINS, and the
// no-credentials default means cookie-bearing cross-site calls still fail.
const allowedOrigins = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins.length
      ? allowedOrigins
      : false,
    credentials: false,
    methods: ["GET", "HEAD", "OPTIONS", "POST", "PATCH"],
    allowedHeaders: ["Content-Type", "X-Moderation-Token"],
    maxAge: 600,
  }),
);

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});

// A contribution batch of 500 records is roughly 1 MB. Everything else gets
// the same parser, so the ceiling is global rather than per-route; the batch
// count itself is capped again in the route.
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));

const databasePath =
  process.env.CONTRIBUTIONS_DB ?? path.resolve(process.cwd(), "data", "contributions.db");
const contributionsStore = openStore(databasePath);

app.use("/api", createContributionsRouter(contributionsStore));
app.use("/api", router);

// Errors leave as a code and a sentence. Stack traces, SQL and filesystem paths
// stay in the log.
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (res.headersSent) return;
  const status = (error as { status?: number; type?: string })?.status;
  if (status === 413 || (error as { type?: string })?.type === "entity.too.large") {
    return res.status(413).json({
      error: { code: "too-large", message: "The request body is too large. Submit at most 500 records." },
    });
  }
  if (status === 400 && (error as { type?: string })?.type === "entity.parse.failed") {
    return res.status(400).json({ error: { code: "invalid-json", message: "The request body is not valid JSON." } });
  }
  logger.error({ err: error }, "Unhandled API error");
  return res.status(500).json({ error: { code: "internal", message: "The server could not complete the request." } });
});

export { contributionsStore };
export default app;