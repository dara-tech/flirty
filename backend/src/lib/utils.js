// Utility functions
import jwt from 'jsonwebtoken';

/**
 * Generate JWT token and set it as HTTP-only cookie
 * @param {string} userId - User ID to encode in token
 * @param {Object} res - Express response object
 * @returns {string} - JWT token
 */
export const generateToken = (userId, res) => {
  const token = jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: '7d'
  });
  
  // Cookie settings - optimized for cross-origin
  const isDevelopment = process.env.NODE_ENV !== 'production';
  
  const cookieOptions = {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    httpOnly: true, // Prevents JavaScript access for security
    path: '/', // Ensure cookie is available for all paths
  };
  
  if (isDevelopment) {
    // Development settings - for localhost with different ports
    // 'lax' works for same-domain different ports (localhost:5173 -> localhost:5002)
    cookieOptions.sameSite = 'lax';
    cookieOptions.secure = false; // HTTP is fine for localhost
  } else {
    // Production settings - for cross-origin (separate frontend/backend hosting)
    // Use 'none' for cross-origin cookies (frontend on Netlify, backend on Render)
    cookieOptions.sameSite = 'none';
    cookieOptions.secure = true; // Required when sameSite is 'none'
  }
  
  // Set cookie with explicit options
  res.cookie("jwt", token, cookieOptions);
  
  return token;
};

/**
 * Helper to get cookie options (for logout and other operations)
 * @returns {Object} - Cookie options
 */
export const getCookieOptions = () => {
  const isDevelopment = process.env.NODE_ENV !== 'production';
  
  return {
    httpOnly: true,
    path: '/',
    sameSite: isDevelopment ? 'lax' : 'none',
    secure: !isDevelopment,
  };
};

/**
 * Convert Mongoose document to plain object
 * Ensures consistent object format for socket emits and API responses
 * @param {*} doc - Mongoose document or plain object
 * @returns {Object|null} - Plain object or null
 */
export const toPlainObject = (doc) => {
  if (!doc) return null;
  
  // If it's already a plain object, return as is
  if (typeof doc !== 'object') return doc;
  
  // If it has toObject method (Mongoose document), use it
  if (typeof doc.toObject === 'function') {
    return doc.toObject();
  }
  
  // If it has _id, it's likely a Mongoose document, convert to JSON
  if (doc._id) {
    try {
      return JSON.parse(JSON.stringify(doc));
    } catch (error) {
      console.error('Error converting document to plain object:', error);
      return doc;
    }
  }
  
  // Otherwise return as is
  return doc;
};

/**
 * Normalize ID to string format
 * Handles both string and object IDs consistently
 * @param {*} id - ID in any format
 * @returns {string|null} - Normalized ID string or null
 */
export const normalizeId = (id) => {
  if (!id) return null;
  if (typeof id === 'string') return id;
  if (typeof id === 'object' && id._id) return id._id.toString();
  if (typeof id === 'object' && id.toString) return id.toString();
  return String(id);
};

/**
 * Check if two IDs are equal (handles different formats)
 * @param {*} id1 - First ID
 * @param {*} id2 - Second ID
 * @returns {boolean} - True if IDs are equal
 */
export const idsEqual = (id1, id2) => {
  const normalized1 = normalizeId(id1);
  const normalized2 = normalizeId(id2);
  return normalized1 !== null && normalized2 !== null && normalized1 === normalized2;
};
