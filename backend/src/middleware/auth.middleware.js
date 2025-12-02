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
      message: "Unauthorized - No token provided" 
    });
  }

  // Verify token
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (jwtError) {
    return res.status(401).json({ 
      success: false,
      message: "Unauthorized - Invalid or expired token" 
    });
  }

  if (!decoded || !decoded.userId) {
    return res.status(401).json({ 
      success: false,
      message: "Unauthorized - Invalid token format" 
    });
  }

  // Find user and attach to request
  const user = await User.findById(decoded.userId).select("-password");
  if (!user) {
    return res.status(401).json({ 
      success: false,
      message: "Unauthorized - User not found" 
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