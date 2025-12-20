import logger from '../lib/logger.js';

/**
 * Sanitize string input to prevent XSS and injection attacks
 * @param {string} str - String to sanitize
 * @returns {string} - Sanitized string
 */
export const sanitizeString = (str) => {
  if (typeof str !== 'string') return str;
  
  return str
    .replace(/[<>]/g, '') // Remove < and > to prevent HTML injection
    .trim(); // Remove leading/trailing whitespace
};

/**
 * Sanitize object recursively
 * @param {*} obj - Object to sanitize
 * @returns {*} - Sanitized object
 */
export const sanitizeObject = (obj) => {
  if (obj === null || obj === undefined) return obj;
  
  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }
  
  if (typeof obj === 'object') {
    const sanitized = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        // Skip sanitization for certain fields that may contain valid HTML/JSON
        if (key === 'text' || key === 'description' || key === 'message') {
          // Only basic sanitization for text fields
          sanitized[key] = typeof obj[key] === 'string' 
            ? sanitizeString(obj[key])
            : sanitizeObject(obj[key]);
        } else {
          sanitized[key] = sanitizeObject(obj[key]);
        }
      }
    }
    return sanitized;
  }
  
  return obj;
};

/**
 * Middleware to sanitize request body
 */
export const sanitizeMiddleware = (req, res, next) => {
  try {
    if (req.body && typeof req.body === 'object') {
      // Don't sanitize file uploads or base64 data
      const skipFields = ['image', 'audio', 'video', 'file', 'password'];
      const originalBody = { ...req.body };
      
      for (const key in req.body) {
        if (skipFields.includes(key)) {
          continue; // Skip sanitization for these fields
        }
        req.body[key] = sanitizeObject(req.body[key]);
      }
      
      // Log if sanitization changed anything (potential attack)
      const bodyChanged = JSON.stringify(originalBody) !== JSON.stringify(req.body);
      if (bodyChanged) {
        logger.warn('Request body sanitized', {
          requestId: req.requestId,
          url: req.originalUrl,
          method: req.method,
        });
      }
    }
    
    // Sanitize query parameters
    if (req.query && typeof req.query === 'object') {
      for (const key in req.query) {
        if (typeof req.query[key] === 'string') {
          req.query[key] = sanitizeString(req.query[key]);
        }
      }
    }
    
    next();
  } catch (error) {
    logger.error('Error in sanitize middleware', {
      requestId: req.requestId,
      error: error.message,
    });
    next(); // Continue even if sanitization fails
  }
};

