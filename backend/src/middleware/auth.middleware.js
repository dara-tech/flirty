import jwt from "jsonwebtoken";
import User from "../model/user.model.js";
import { asyncHandler } from "./error.middleware.js";

/**
 * Protect route middleware - verifies JWT token and attaches user to request
 * Supports both cookie-based and Bearer token authentication
 */
export const protectRoute = asyncHandler(async (req, res, next) => {
  // Try to get token from cookie first (preferred method)
  let token = req.cookies?.jwt;
  
  // Fallback: Get token from Authorization header (for cross-origin cookie issues)
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }

  if (!token) {
    return res.status(401).json({ 
      success: false,
      message: "Authentication required",
      code: "NO_TOKEN"
    });
  }

  // Verify token
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (jwtError) {
    // Provide specific error based on JWT error type
    const isExpired = jwtError.name === 'TokenExpiredError';
    return res.status(401).json({ 
      success: false,
      message: isExpired ? "Session expired. Please login again." : "Invalid authentication token",
      code: isExpired ? "TOKEN_EXPIRED" : "INVALID_TOKEN"
    });
  }

  if (!decoded || !decoded.userId) {
    return res.status(401).json({ 
      success: false,
      message: "Invalid authentication token",
      code: "INVALID_TOKEN_FORMAT"
    });
  }

  // Find user and attach to request
  const user = await User.findById(decoded.userId).select("-password");
  if (!user) {
    return res.status(401).json({ 
      success: false,
      message: "User account not found",
      code: "USER_NOT_FOUND"
    });
  }

  req.user = user;
  next();
});

/**
 * Optional auth middleware - attaches user if token exists, but doesn't require it
 * Useful for routes that work with or without authentication
 */
export const optionalAuth = asyncHandler(async (req, res, next) => {
  let token = req.cookies?.jwt;
  
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (decoded && decoded.userId) {
        const user = await User.findById(decoded.userId).select("-password");
        if (user) {
          req.user = user;
        }
      }
    } catch (error) {
      // Ignore token errors for optional auth
    }
  }

  next();
});