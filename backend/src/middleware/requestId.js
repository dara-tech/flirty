import { randomUUID } from 'crypto';
import logger from '../lib/logger.js';

/**
 * Request ID middleware
 * Adds a unique request ID to each request for tracing and debugging
 */
export const requestIdMiddleware = (req, res, next) => {
  // Generate or use existing request ID
  const requestId = req.headers['x-request-id'] || randomUUID();
  
  // Add request ID to request object
  req.requestId = requestId;
  
  // Add request ID to response headers
  res.setHeader('X-Request-Id', requestId);
  
  // Log request with ID (only in development or for errors)
  if (process.env.NODE_ENV === 'development' || process.env.LOG_REQUESTS === 'true') {
    logger.http(`${req.method} ${req.originalUrl}`, {
      requestId,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
  }
  
  next();
};

/**
 * Enhanced error logging with request ID
 */
export const logErrorWithRequestId = (req, error) => {
  logger.error('Request error', {
    requestId: req.requestId,
    method: req.method,
    url: req.originalUrl,
    error: error.message,
    stack: error.stack,
    userId: req.user?._id,
  });
};

