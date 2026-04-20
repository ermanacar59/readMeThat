import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { registerRoutes } from "./routes/index.js";

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const rateLimitStore = new Map<string, RateLimitEntry>();

function parseAllowedOrigins(rawValue?: string): string[] {
  return (rawValue || "http://127.0.0.1:4173")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getRateLimitConfig() {
  return {
    maxRequests: Number(process.env.API_RATE_LIMIT_MAX || 60),
    windowMs: Number(process.env.API_RATE_LIMIT_WINDOW_MS || 60_000)
  };
}

function getClientKey(ip: string | undefined, routeKey: string) {
  return `${ip || "unknown"}:${routeKey}`;
}

export async function buildServer() {
  const app = Fastify({
    logger: true,
    trustProxy: process.env.TRUST_PROXY === "true"
  });

  const allowedOrigins = parseAllowedOrigins(process.env.WEB_ORIGIN);
  const maxUploadSizeBytes = Number(process.env.MAX_UPLOAD_SIZE_MB || 20) * 1024 * 1024;
  const rateLimit = getRateLimitConfig();

  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Origin not allowed by CORS."), false);
    }
  });
  await app.register(multipart, {
    limits: {
      fileSize: maxUploadSizeBytes
    }
  });

  app.addHook("onRequest", async (request, reply) => {
    if (request.method === "OPTIONS" || request.url === "/health") {
      return;
    }

    const routeKey = request.url.split("?")[0] || "unknown-route";
    const key = getClientKey(request.ip, routeKey);
    const now = Date.now();
    const existing = rateLimitStore.get(key);

    if (!existing || existing.resetAt <= now) {
      rateLimitStore.set(key, {
        count: 1,
        resetAt: now + rateLimit.windowMs
      });
      return;
    }

    existing.count += 1;
    rateLimitStore.set(key, existing);

    if (existing.count > rateLimit.maxRequests) {
      reply
        .code(429)
        .header("Retry-After", Math.ceil((existing.resetAt - now) / 1000))
        .send({
          message: "Too many requests. Please slow down and try again shortly."
        });
    }
  });

  app.get("/health", async () => ({
    ok: true,
    service: "doc-to-speech-api",
    allowedOrigins,
    maxUploadSizeBytes,
    rateLimit
  }));

  await registerRoutes(app);
  return app;
}
