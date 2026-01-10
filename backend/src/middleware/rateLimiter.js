import rateLimit from "express-rate-limit";
import logger from "../lib/logger.js";

// ============================================================================
// CONFIGURATION CONSTANTS
// ============================================================================

/**
 * Centralized rate limit configuration
 * All time values in milliseconds for consistency
 */
const RATE_LIMIT_CONFIG = {
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxDev: 100, // Development: generous for testing
    maxProd: 10, // Production: strict for security
  },
  message: {
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 30, // Prevent message spam
  },
  realtime: {
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100, // High limit for WebSocket events
  },
  api: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // General API calls
  },
  strict: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // Sensitive operations
  },
  connection: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    maxDev: 50, // Development: frequent reconnects
    maxProd: 20, // Production: prevent abuse
  },
};

/**
 * Memory store configuration
 * Auto-cleanup prevents memory leaks in long-running processes
 */
const MEMORY_STORE_CONFIG = {
  checkPeriod: 60 * 1000, // Check every 60 seconds
  maxKeys: 10000, // Maximum entries before forced cleanup
  cleanupThreshold: 0.8, // Cleanup when 80% full
};

// ============================================================================
// PERFORMANCE METRICS
// ============================================================================

/**
 * Track rate limit metrics for monitoring and optimization
 * Use this data to adjust limits based on real usage patterns
 */
class RateLimitMetrics {
  constructor() {
    this.metrics = {
      totalRequests: 0,
      blockedRequests: 0,
      bypassedRequests: 0,
      activeConnections: new Set(),
      errorCount: 0,
    };
  }

  recordRequest() {
    this.metrics.totalRequests++;
  }

  recordBlock(identifier) {
    this.metrics.blockedRequests++;
    logger.warn("Rate limit block recorded", {
      identifier,
      totalBlocked: this.metrics.blockedRequests,
      blockRate:
        (
          (this.metrics.blockedRequests / this.metrics.totalRequests) *
          100
        ).toFixed(2) + "%",
    });
  }

  recordBypass() {
    this.metrics.bypassedRequests++;
  }

  recordConnection(identifier) {
    this.metrics.activeConnections.add(identifier);
  }

  recordDisconnection(identifier) {
    this.metrics.activeConnections.delete(identifier);
  }

  recordError() {
    this.metrics.errorCount++;
  }

  getMetrics() {
    return {
      ...this.metrics,
      activeConnections: this.metrics.activeConnections.size,
      blockRate:
        this.metrics.totalRequests > 0
          ? (
              (this.metrics.blockedRequests / this.metrics.totalRequests) *
              100
            ).toFixed(2) + "%"
          : "0%",
    };
  }

  // Reset metrics (useful for periodic monitoring)
  reset() {
    this.metrics.totalRequests = 0;
    this.metrics.blockedRequests = 0;
    this.metrics.bypassedRequests = 0;
    this.metrics.errorCount = 0;
    // Keep activeConnections as they represent current state
  }
}

const metrics = new RateLimitMetrics();

// ============================================================================
// MEMORY MANAGEMENT
// ============================================================================

/**
 * Enhanced memory store with automatic cleanup and TTL
 * Prevents memory leaks in production environments
 */
class MemoryStoreWithCleanup {
  constructor(windowMs) {
    this.hits = new Map();
    this.windowMs = windowMs;
    this.resetTime = new Map();

    // Automatic cleanup every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, MEMORY_STORE_CONFIG.checkPeriod);
  }

  incr(key, callback) {
    const now = Date.now();
    const resetTime = this.resetTime.get(key);

    // Reset if window expired
    if (!resetTime || now > resetTime) {
      this.hits.set(key, 1);
      const newResetTime = now + this.windowMs;
      this.resetTime.set(key, newResetTime);
      // Callback signature: (error, totalHits, resetTime as Date object)
      return callback(null, 1, new Date(newResetTime));
    }

    // Increment hit count
    const hitCount = (this.hits.get(key) || 0) + 1;
    this.hits.set(key, hitCount);
    // Callback signature: (error, totalHits, resetTime as Date object)
    return callback(null, hitCount, new Date(resetTime));
  }

  decrement(key) {
    const hitCount = this.hits.get(key);
    if (hitCount && hitCount > 0) {
      this.hits.set(key, hitCount - 1);
    }
  }

  resetKey(key) {
    this.hits.delete(key);
    this.resetTime.delete(key);
  }

  cleanup() {
    const now = Date.now();
    let cleanedCount = 0;

    // Remove expired entries
    for (const [key, resetTime] of this.resetTime.entries()) {
      if (now > resetTime) {
        this.hits.delete(key);
        this.resetTime.delete(key);
        cleanedCount++;
      }
    }

    // Force cleanup if approaching memory limit
    if (
      this.hits.size >
      MEMORY_STORE_CONFIG.maxKeys * MEMORY_STORE_CONFIG.cleanupThreshold
    ) {
      logger.warn("Rate limit store approaching capacity, forcing cleanup", {
        currentSize: this.hits.size,
        maxSize: MEMORY_STORE_CONFIG.maxKeys,
        cleanedCount,
      });

      // Remove oldest 20% of entries
      const entriesToRemove = Math.floor(this.hits.size * 0.2);
      const keys = Array.from(this.hits.keys()).slice(0, entriesToRemove);
      keys.forEach((key) => {
        this.hits.delete(key);
        this.resetTime.delete(key);
      });
    }

    if (cleanedCount > 0) {
      logger.debug("Rate limit store cleanup completed", {
        cleanedCount,
        remainingEntries: this.hits.size,
      });
    }
  }

  // Graceful shutdown
  destroy() {
    clearInterval(this.cleanupInterval);
    this.hits.clear();
    this.resetTime.clear();
  }
}

// ============================================================================
// KEY GENERATION
// ============================================================================

/**
 * Generate consistent rate limit key from request
 * Priority: User ID (authenticated) > IP address > Forwarded IP
 */
const generateRateLimitKey = (req) => {
  // Prefer user ID if authenticated (prevents IP rotation bypass)
  if (req.user && req.user._id) {
    return `user:${req.user._id}`;
  }

  // Fallback to IP-based identification
  const ip =
    req.ip ||
    req.headers["x-forwarded-for"] ||
    req.connection.remoteAddress ||
    "unknown";
  return `ip:${ip}`;
};

// ============================================================================
// ERROR HANDLING
// ============================================================================

/**
 * Enhanced rate limit handler with user-friendly responses
 * Includes retry timing and actionable error messages
 */
const handleRateLimitExceeded = (req, res, options) => {
  const identifier = generateRateLimitKey(req);
  const retryAfterSeconds = Math.ceil(options.windowMs / 1000);

  // Record metrics
  metrics.recordRequest();
  metrics.recordBlock(identifier);

  // Structured logging for monitoring
  logger.warn("Rate limit exceeded", {
    identifier,
    path: req.path,
    method: req.method,
    userAgent: req.headers["user-agent"],
    remaining: 0,
    limit: options.max,
    retryAfter: retryAfterSeconds,
  });

  // User-friendly response with retry information
  res.status(429).json({
    success: false,
    message: options.message,
    error: "RATE_LIMIT_EXCEEDED",
    retryAfter: retryAfterSeconds,
    retryAt: new Date(Date.now() + options.windowMs).toISOString(),
    limit: options.max,
    windowMs: options.windowMs,
  });
};

/**
 * Error handler for rate limiter initialization
 */
const handleRateLimitError = (error, req, res) => {
  metrics.recordError();

  logger.error("Rate limiter error", {
    error: error.message,
    stack: error.stack,
    path: req.path,
  });

  // Don't block requests on rate limiter errors
  // Fail open to maintain availability
  logger.warn(
    "Rate limiter failed, allowing request through (fail-open policy)"
  );
};

// ============================================================================
// BYPASS LOGIC
// ============================================================================

/**
 * Skip rate limiting for development with bypass header
 * Security: Only works when NODE_ENV is explicitly 'development'
 */
const skipRateLimitCheck = (req) => {
  const isDevelopment = process.env.NODE_ENV === "development";
  const hasBypassHeader = req.headers["x-skip-rate-limit"] === "true";

  if (isDevelopment && hasBypassHeader) {
    metrics.recordBypass();
    logger.debug("Rate limit bypassed for development", {
      path: req.path,
      ip: req.ip,
    });
    return true;
  }

  return false;
};

// ============================================================================
// MIDDLEWARE FACTORY
// ============================================================================

/**
 * Create rate limiter with custom configuration
 * Reusable factory function for consistent behavior
 */
const createRateLimiter = (config) => {
  return rateLimit({
    windowMs: config.windowMs,
    max: config.max,
    message: config.message,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: config.skip || skipRateLimitCheck,
    handler: handleRateLimitExceeded,
    skipFailedRequests: false,
    skipSuccessfulRequests: false,
    // Note: Removed custom keyGenerator to avoid IPv6 issues
    // Rate limiter will use default IP-based tracking
    store: new MemoryStoreWithCleanup(config.windowMs),
  });
};

// ============================================================================
// RATE LIMITERS
// ============================================================================

/**
 * Authentication rate limiter
 * Protects login/signup endpoints from brute force attacks
 */
export const authLimiter = createRateLimiter({
  windowMs: RATE_LIMIT_CONFIG.auth.windowMs,
  max:
    process.env.NODE_ENV === "development"
      ? RATE_LIMIT_CONFIG.auth.maxDev
      : RATE_LIMIT_CONFIG.auth.maxProd,
  message: "Too many authentication attempts, please try again later",
});

/**
 * Message rate limiter
 * Prevents spam in real-time chat
 */
export const messageLimiter = createRateLimiter({
  windowMs: RATE_LIMIT_CONFIG.message.windowMs,
  max: RATE_LIMIT_CONFIG.message.max,
  message: "Too many messages sent, please slow down",
});

/**
 * Real-time event rate limiter
 * High limit for Socket.IO events (typing, read receipts, etc.)
 */
export const realtimeLimiter = createRateLimiter({
  windowMs: RATE_LIMIT_CONFIG.realtime.windowMs,
  max: RATE_LIMIT_CONFIG.realtime.max,
  message: "Too many real-time events, please slow down",
});

/**
 * General API rate limiter
 * Applied to all API endpoints by default
 */
export const apiLimiter = createRateLimiter({
  windowMs: RATE_LIMIT_CONFIG.api.windowMs,
  max: RATE_LIMIT_CONFIG.api.max,
  message: "Too many requests, please try again later",
});

/**
 * Strict rate limiter for sensitive operations
 * Password changes, email updates, account deletion, etc.
 */
export const strictLimiter = createRateLimiter({
  windowMs: RATE_LIMIT_CONFIG.strict.windowMs,
  max: RATE_LIMIT_CONFIG.strict.max,
  message: "Too many sensitive operations, please try again later",
});

/**
 * WebSocket connection rate limiter
 * Prevents connection spam and reconnection attacks
 */
export const connectionLimiter = createRateLimiter({
  windowMs: RATE_LIMIT_CONFIG.connection.windowMs,
  max:
    process.env.NODE_ENV === "development"
      ? RATE_LIMIT_CONFIG.connection.maxDev
      : RATE_LIMIT_CONFIG.connection.maxProd,
  message: "Too many connection attempts, please wait before reconnecting",
});

// ============================================================================
// SOCKET.IO RATE LIMITING
// ============================================================================

/**
 * Rate limiter for Socket.IO connections
 * Track connection attempts per IP/user to prevent abuse
 */
const socketConnectionStore = new MemoryStoreWithCleanup(
  RATE_LIMIT_CONFIG.connection.windowMs
);

/**
 * Check if Socket.IO connection should be rate limited
 * Returns { allowed: boolean, reason?: string }
 */
export const checkSocketRateLimit = (socket, callback) => {
  const identifier = socket.handshake.auth?.userId
    ? `user:${socket.handshake.auth.userId}`
    : `ip:${socket.handshake.address}`;

  const maxConnections =
    process.env.NODE_ENV === "development"
      ? RATE_LIMIT_CONFIG.connection.maxDev
      : RATE_LIMIT_CONFIG.connection.maxProd;

  socketConnectionStore.incr(identifier, (err, hitCount, resetTime) => {
    if (err) {
      logger.error("Socket rate limit check error", { error: err });
      // Fail open - allow connection on error
      return callback({ allowed: true });
    }

    if (hitCount > maxConnections) {
      const retryAfterSeconds = Math.ceil((resetTime - Date.now()) / 1000);

      logger.warn("Socket connection rate limit exceeded", {
        identifier,
        hitCount,
        maxConnections,
        retryAfter: retryAfterSeconds,
      });

      metrics.recordBlock(identifier);

      return callback({
        allowed: false,
        reason: "Too many connection attempts",
        retryAfter: retryAfterSeconds,
      });
    }

    metrics.recordConnection(identifier);
    callback({ allowed: true });
  });
};

/**
 * Track Socket.IO disconnections for metrics
 */
export const trackSocketDisconnection = (socket) => {
  const identifier = socket.handshake.auth?.userId
    ? `user:${socket.handshake.auth.userId}`
    : `ip:${socket.handshake.address}`;

  metrics.recordDisconnection(identifier);
};

// ============================================================================
// METRICS & MONITORING
// ============================================================================

/**
 * Get current rate limit metrics
 * Useful for monitoring dashboards and alerting
 */
export const getRateLimitMetrics = () => {
  return metrics.getMetrics();
};

/**
 * Reset metrics (call this periodically or via admin endpoint)
 */
export const resetRateLimitMetrics = () => {
  metrics.reset();
  logger.info("Rate limit metrics reset");
};

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

/**
 * Cleanup resources on server shutdown
 */
export const cleanupRateLimiter = () => {
  logger.info("Cleaning up rate limiter resources");
  socketConnectionStore.destroy();
};

// Auto-cleanup on process termination
process.on("SIGTERM", cleanupRateLimiter);
process.on("SIGINT", cleanupRateLimiter);

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * Health check for rate limiter
 * Returns status and current metrics
 */
export const rateLimiterHealthCheck = () => {
  const currentMetrics = metrics.getMetrics();
  const isHealthy = currentMetrics.errorCount < 100; // Threshold

  return {
    status: isHealthy ? "healthy" : "degraded",
    metrics: currentMetrics,
    config: {
      environment: process.env.NODE_ENV,
      memoryStoreMaxKeys: MEMORY_STORE_CONFIG.maxKeys,
      cleanupPeriod: MEMORY_STORE_CONFIG.checkPeriod,
    },
  };
};
