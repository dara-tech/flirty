/**
 * rateLimiter.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Centralised rate-limiting middleware for Express HTTP routes and Socket.IO.
 *
 * Compatible with: express-rate-limit v8 (async Store interface)
 *
 * Key design decisions:
 *  - MemoryStore implements the v8 async increment/decrement/resetKey/resetAll
 *    interface (the old v6 callback-based incr is never called by v8).
 *  - StoreRegistry tracks every store so ALL are destroyed on shutdown.
 *  - setInterval.unref() — cleanup timers never prevent process exit.
 *  - process.once guards — no duplicate SIGTERM/SIGINT listeners on re-import.
 *  - Fail-open policy — rate-limiter errors never block real requests.
 *  - Private class fields (#) — metrics state fully encapsulated.
 */

import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import logger from "../lib/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// ENVIRONMENT
// ─────────────────────────────────────────────────────────────────────────────

const IS_DEV = process.env.NODE_ENV === "development";

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION  (all times in milliseconds)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Centralised rate-limit windows and caps.
 * Frozen so no code can accidentally mutate runtime config.
 */
const CONFIG = Object.freeze({
  auth: Object.freeze({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxDev: 100, // generous for local testing
    maxProd: 10, // strict brute-force protection
  }),
  message: Object.freeze({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 30, // prevent chat spam
  }),
  realtime: Object.freeze({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100, // high cap for Socket.IO-adjacent HTTP calls
  }),
  api: Object.freeze({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // general API default
  }),
  strict: Object.freeze({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // sensitive ops (password reset, etc.)
  }),
  connection: Object.freeze({
    windowMs: 5 * 60 * 1000, // 5 minutes
    maxDev: 50, // dev: frequent reconnects expected
    maxProd: 20, // prod: prevent socket flood
  }),
  search: Object.freeze({
    windowMs: 1 * 60 * 1000, // 1 minute
    maxDev: 60,
    maxProd: 30, // per-user search cap
  }),
});

/**
 * In-process store tuning.
 */
const STORE_CONFIG = Object.freeze({
  cleanupIntervalMs: 60 * 1000, // expired-key sweep every 60 s
  maxKeys: 10_000, // hard cap on tracked keys
  capacityThreshold: 0.8, // warn + evict at 80 % capacity
  evictionRatio: 0.2, // remove 20 % of keys when evicting
});

// ─────────────────────────────────────────────────────────────────────────────
// METRICS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lightweight counters for monitoring and alerting.
 * Private fields (#) prevent external mutation.
 */
class RateLimitMetrics {
  #totalRequests = 0;
  #blockedRequests = 0;
  #bypassedRequests = 0;
  #errorCount = 0;
  #activeConnections = new Set();

  recordRequest() {
    this.#totalRequests++;
  }
  recordBypass() {
    this.#bypassedRequests++;
  }
  recordError() {
    this.#errorCount++;
  }
  recordConnection(id) {
    this.#activeConnections.add(id);
  }
  recordDisconnection(id) {
    this.#activeConnections.delete(id);
  }

  recordBlock(identifier) {
    this.#blockedRequests++;
    const total = this.#totalRequests;
    logger.warn("Rate limit block recorded", {
      identifier,
      totalBlocked: this.#blockedRequests,
      blockRate:
        total > 0
          ? `${((this.#blockedRequests / total) * 100).toFixed(2)}%`
          : "N/A",
    });
  }

  /**
   * Returns a frozen snapshot — never exposes internal mutable state.
   */
  snapshot() {
    const total = this.#totalRequests;
    return Object.freeze({
      totalRequests: total,
      blockedRequests: this.#blockedRequests,
      bypassedRequests: this.#bypassedRequests,
      errorCount: this.#errorCount,
      activeConnections: this.#activeConnections.size,
      blockRate:
        total > 0
          ? `${((this.#blockedRequests / total) * 100).toFixed(2)}%`
          : "0%",
    });
  }

  /** Reset counters; active-connection set is intentionally preserved. */
  reset() {
    this.#totalRequests = 0;
    this.#blockedRequests = 0;
    this.#bypassedRequests = 0;
    this.#errorCount = 0;
  }
}

const metrics = new RateLimitMetrics();

// ─────────────────────────────────────────────────────────────────────────────
// MEMORY STORE  (express-rate-limit v8 compatible)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * TTL-based in-memory store implementing the express-rate-limit v8 Store
 * interface (async increment / decrement / resetKey / resetAll).
 *
 * Memory-safety guarantees:
 *  - Periodic cleanup via setInterval(..).unref() — never blocks process exit.
 *  - Capacity eviction removes oldest 20 % of keys near maxKeys.
 *  - destroy() must be called on shutdown to clear timer + maps.
 */
class MemoryStore {
  /** @type {Map<string, number>} key → hit count */
  #hits = new Map();
  /** @type {Map<string, number>} key → epoch ms of window reset */
  #resets = new Map();
  #windowMs;
  #cleanupTimer;

  constructor(windowMs) {
    this.#windowMs = windowMs;
    this.#cleanupTimer = setInterval(
      () => this.#cleanup(),
      STORE_CONFIG.cleanupIntervalMs,
    );
    this.#cleanupTimer.unref(); // never prevent process exit
  }

  // ── express-rate-limit v8 Store interface ───────────────────────────────

  /**
   * Increment the hit count for `key`.  Resets window if expired.
   * @returns {Promise<{totalHits: number, resetTime: Date}>}
   */
  async increment(key) {
    const now = Date.now();
    const existingReset = this.#resets.get(key);

    if (existingReset === undefined || now >= existingReset) {
      const resetTime = now + this.#windowMs;
      this.#hits.set(key, 1);
      this.#resets.set(key, resetTime);
      this.#enforceCapacity();
      return { totalHits: 1, resetTime: new Date(resetTime) };
    }

    const totalHits = (this.#hits.get(key) ?? 0) + 1;
    this.#hits.set(key, totalHits);
    return { totalHits, resetTime: new Date(existingReset) };
  }

  /**
   * Decrement the hit count for `key` (skipSuccessfulRequests support).
   * Never goes below zero.
   * @returns {Promise<void>}
   */
  async decrement(key) {
    const hits = this.#hits.get(key);
    if (hits !== undefined && hits > 0) {
      this.#hits.set(key, hits - 1);
    }
  }

  /**
   * Immediately reset the counter for `key`.
   * @returns {Promise<void>}
   */
  async resetKey(key) {
    this.#hits.delete(key);
    this.#resets.delete(key);
  }

  /**
   * Reset ALL counters.
   * @returns {Promise<void>}
   */
  async resetAll() {
    this.#hits.clear();
    this.#resets.clear();
  }

  /** Current number of tracked keys. */
  get size() {
    return this.#hits.size;
  }

  /**
   * Release cleanup timer and clear all data.
   * Must be called during graceful shutdown.
   */
  destroy() {
    clearInterval(this.#cleanupTimer);
    this.#hits.clear();
    this.#resets.clear();
  }

  // ── Private internals ────────────────────────────────────────────────────

  #cleanup() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, reset] of this.#resets) {
      if (now >= reset) {
        this.#hits.delete(key);
        this.#resets.delete(key);
        cleaned++;
      }
    }

    if (
      this.#hits.size >
      STORE_CONFIG.maxKeys * STORE_CONFIG.capacityThreshold
    ) {
      this.#evict();
    }

    if (cleaned > 0) {
      logger.debug("Rate limit store cleanup completed", {
        cleaned,
        remaining: this.#hits.size,
      });
    }
  }

  #evict() {
    const toEvict = Math.floor(this.#hits.size * STORE_CONFIG.evictionRatio);
    logger.warn(
      "Rate limit store capacity threshold reached, evicting entries",
      {
        currentSize: this.#hits.size,
        maxKeys: STORE_CONFIG.maxKeys,
        evicting: toEvict,
      },
    );
    let count = 0;
    for (const key of this.#hits.keys()) {
      if (count++ >= toEvict) break;
      this.#hits.delete(key);
      this.#resets.delete(key);
    }
  }

  #enforceCapacity() {
    if (this.#hits.size > STORE_CONFIG.maxKeys) this.#evict();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STORE REGISTRY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every MemoryStore created here is registered so cleanupRateLimiter()
 * destroys ALL stores on shutdown — not just the socket store.
 * @type {Set<MemoryStore>}
 */
const storeRegistry = new Set();

/** Create a MemoryStore and register it. */
const createStore = (windowMs) => {
  const store = new MemoryStore(windowMs);
  storeRegistry.add(store);
  return store;
};

// ─────────────────────────────────────────────────────────────────────────────
// KEY GENERATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve a stable rate-limit key for an HTTP request.
 *
 * Priority:
 *   1. Authenticated user ID — prevents IP-rotation bypass
 *   2. First IP in X-Forwarded-For (trimmed) — sanitised proxy header
 *   3. req.socket.remoteAddress  (req.connection deprecated in Node 18+)
 *   4. Literal "unknown"
 *
 * @param {import("express").Request} req
 * @returns {string}
 */
const resolveIdentifier = (req) => {
  if (req.user?._id) return `user:${req.user._id}`;

  const forwarded = req.headers["x-forwarded-for"];
  const ip =
    ipKeyGenerator(req) ||
    (forwarded ? forwarded.split(",")[0].trim() : null) ||
    req.socket?.remoteAddress ||
    "unknown";

  return `ip:${ip}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// BYPASS LOGIC
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Skip rate limiting when the development bypass header is present.
 * Header  : X-Skip-Rate-Limit: true
 * Security: only honoured when NODE_ENV === "development"
 *
 * @param {import("express").Request} req
 * @returns {boolean}
 */
const shouldSkip = (req) => {
  if (IS_DEV && req.headers["x-skip-rate-limit"] === "true") {
    metrics.recordBypass();
    logger.debug("Rate limit bypassed (dev)", { path: req.path, ip: req.ip });
    return true;
  }
  return false;
};

// ─────────────────────────────────────────────────────────────────────────────
// RATE-LIMIT EXCEEDED HANDLER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Called by express-rate-limit v8 when a client exceeds its limit.
 *
 * v8 signature: (req, res, next, options)
 *   _next    — Express next function (unused; included for correct arity)
 *   options  — the limiter's resolved options object
 *
 * @param {import("express").Request}      req
 * @param {import("express").Response}     res
 * @param {import("express").NextFunction} _next
 * @param {object}                         options
 */
const onLimitReached = (req, res, _next, options) => {
  const identifier = resolveIdentifier(req);
  const windowMs = options?.windowMs ?? CONFIG.api.windowMs;
  const retryAfterSec = Math.ceil(windowMs / 1000);

  metrics.recordRequest();
  metrics.recordBlock(identifier);

  logger.warn("Rate limit exceeded", {
    identifier,
    path: req.path,
    method: req.method,
    userAgent: req.headers["user-agent"],
    limit: options?.max ?? null,
    retryAfterSec,
  });

  res.status(429).json({
    success: false,
    message: options?.message ?? "Too many requests, please try again later",
    error: "RATE_LIMIT_EXCEEDED",
    retryAfter: retryAfterSec,
    retryAt: new Date(Date.now() + windowMs).toISOString(),
    limit: options?.max ?? null,
    windowMs,
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// LIMITER FACTORY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a configured express-rate-limit middleware with a dedicated
 * MemoryStore instance.
 *
 * @param {object}   config
 * @param {number}   config.windowMs
 * @param {number}   config.max
 * @param {string}   config.message
 * @param {Function} [config.skip]
 * @param {Function} [config.keyGenerator]
 * @returns {import("express").RequestHandler}
 */
const createLimiter = (config) =>
  rateLimit({
    windowMs: config.windowMs,
    max: config.max,
    message: config.message,
    standardHeaders: "draft-7", // Retry-After + RateLimit-* headers
    legacyHeaders: false, // suppress X-RateLimit-* v6 headers
    skip: config.skip ?? shouldSkip,
    handler: onLimitReached,
    keyGenerator: config.keyGenerator ?? resolveIdentifier,
    skipFailedRequests: false,
    skipSuccessfulRequests: false,
    store: createStore(config.windowMs),
  });

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTED HTTP LIMITERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Brute-force protection for login / signup endpoints.
 * 10 req / 15 min (prod) | 100 req / 15 min (dev)
 */
export const authLimiter = createLimiter({
  windowMs: CONFIG.auth.windowMs,
  max: IS_DEV ? CONFIG.auth.maxDev : CONFIG.auth.maxProd,
  message: "Too many authentication attempts, please try again later",
});

/**
 * Prevent message spam in chat REST endpoints.
 * 30 messages / minute per identifier.
 */
export const messageLimiter = createLimiter({
  windowMs: CONFIG.message.windowMs,
  max: CONFIG.message.max,
  message: "Too many messages sent, please slow down",
});

/**
 * High-throughput limit for Socket.IO-adjacent HTTP events.
 * 100 req / minute.
 */
export const realtimeLimiter = createLimiter({
  windowMs: CONFIG.realtime.windowMs,
  max: CONFIG.realtime.max,
  message: "Too many real-time events, please slow down",
});

/**
 * Default limiter applied to all general API endpoints.
 * 100 req / 15 min.
 */
export const apiLimiter = createLimiter({
  windowMs: CONFIG.api.windowMs,
  max: CONFIG.api.max,
  message: "Too many requests, please try again later",
});

/**
 * Strict limiter for sensitive operations
 * (password changes, email updates, account deletion).
 * 10 req / hour.
 */
export const strictLimiter = createLimiter({
  windowMs: CONFIG.strict.windowMs,
  max: CONFIG.strict.max,
  message: "Too many sensitive operations, please try again later",
});

/**
 * WebSocket connection spam protection (HTTP upgrade path).
 */
export const connectionLimiter = createLimiter({
  windowMs: CONFIG.connection.windowMs,
  max: IS_DEV ? CONFIG.connection.maxDev : CONFIG.connection.maxProd,
  message: "Too many connection attempts, please wait before reconnecting",
});

/**
 * Per-user search limiter — keyed by user ID so shared office/campus IPs
 * are not penalised collectively.
 * 30 req / min (prod) | 60 req / min (dev)
 *
 * Applied to:
 *   GET /api/messages/search/:conversationId
 *   GET /api/messages/around/:conversationId/:messageId
 */
export const searchLimiter = createLimiter({
  windowMs: CONFIG.search.windowMs,
  max: IS_DEV ? CONFIG.search.maxDev : CONFIG.search.maxProd,
  message: "Too many search requests, please slow down",
  keyGenerator: (req) =>
    req.user?._id?.toString() ?? ipKeyGenerator(req) ?? "unknown",
});

// ─────────────────────────────────────────────────────────────────────────────
// SOCKET.IO RATE LIMITING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dedicated store for Socket.IO connection tracking.
 * Isolated from HTTP stores — connection abuse cannot exhaust HTTP budgets.
 */
const socketStore = createStore(CONFIG.connection.windowMs);

const SOCKET_MAX = IS_DEV
  ? CONFIG.connection.maxDev
  : CONFIG.connection.maxProd;

/**
 * Resolve a stable identifier from a Socket.IO handshake.
 * @param {import("socket.io").Socket} socket
 * @returns {string}
 */
const resolveSocketIdentifier = (socket) =>
  socket.handshake.auth?.userId
    ? `user:${socket.handshake.auth.userId}`
    : `ip:${socket.handshake.address ?? "unknown"}`;

/**
 * Async Socket.IO connection rate-limit check.
 *
 * Usage in socket.js:
 *   const result = await checkSocketRateLimit(socket);
 *   if (!result.allowed) {
 *     socket.emit("error", { message: result.reason, retryAfter: result.retryAfter, code: "RATE_LIMIT_EXCEEDED" });
 *     socket.disconnect(true);
 *     return;
 *   }
 *
 * @param {import("socket.io").Socket} socket
 * @returns {Promise<{allowed: boolean, reason?: string, retryAfter?: number}>}
 */
export const checkSocketRateLimit = async (socket) => {
  const identifier = resolveSocketIdentifier(socket);

  try {
    const { totalHits, resetTime } = await socketStore.increment(identifier);

    if (totalHits > SOCKET_MAX) {
      const retryAfter = Math.max(
        0,
        Math.ceil((resetTime.getTime() - Date.now()) / 1000),
      );

      logger.warn("Socket connection rate limit exceeded", {
        identifier,
        totalHits,
        maxConnections: SOCKET_MAX,
        retryAfter,
      });

      metrics.recordBlock(identifier);
      return {
        allowed: false,
        reason: "Too many connection attempts",
        retryAfter,
      };
    }

    metrics.recordConnection(identifier);
    return { allowed: true };
  } catch (err) {
    // Fail-open: internal errors must never block legitimate users
    metrics.recordError();
    logger.error("Socket rate limit check failed — allowing (fail-open)", {
      error: err.message,
    });
    return { allowed: true };
  }
};

/**
 * Record a Socket.IO disconnection in the active-connections metric.
 * @param {import("socket.io").Socket} socket
 */
export const trackSocketDisconnection = (socket) => {
  metrics.recordDisconnection(resolveSocketIdentifier(socket));
};

// ─────────────────────────────────────────────────────────────────────────────
// METRICS & MONITORING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return a frozen snapshot of current rate-limit metrics.
 * Safe to expose on monitoring / admin endpoints.
 * @returns {Readonly<object>}
 */
export const getRateLimitMetrics = () => metrics.snapshot();

/**
 * Reset counters (active-connections set is preserved).
 * Useful for periodic metric windows or admin resets.
 */
export const resetRateLimitMetrics = () => {
  metrics.reset();
  // logger.info("Rate limit metrics reset");
};

// ─────────────────────────────────────────────────────────────────────────────
// HEALTH CHECK
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Health check payload for monitoring dashboards.
 * Status is "degraded" when the error count exceeds the threshold (100).
 * @returns {Readonly<object>}
 */
export const rateLimiterHealthCheck = () => {
  const snap = metrics.snapshot();
  const isHealthy = snap.errorCount < 100;

  return Object.freeze({
    status: isHealthy ? "healthy" : "degraded",
    metrics: snap,
    config: Object.freeze({
      environment: process.env.NODE_ENV,
      maxKeys: STORE_CONFIG.maxKeys,
      cleanupInterval: STORE_CONFIG.cleanupIntervalMs,
      activeStores: storeRegistry.size,
    }),
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// GRACEFUL SHUTDOWN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Destroy ALL registered MemoryStore instances (timers + maps).
 * Called automatically on SIGTERM / SIGINT.
 * Can also be called explicitly during test teardown.
 */
export const cleanupRateLimiter = () => {
  // logger.info(`Cleaning up ${storeRegistry.size} rate-limit store(s)`);
  for (const store of storeRegistry) store.destroy();
  storeRegistry.clear();
};

// Guard against duplicate listeners on module re-evaluation (Jest / HMR)
if (process.listenerCount("SIGTERM") === 0)
  process.once("SIGTERM", cleanupRateLimiter);
if (process.listenerCount("SIGINT") === 0)
  process.once("SIGINT", cleanupRateLimiter);
