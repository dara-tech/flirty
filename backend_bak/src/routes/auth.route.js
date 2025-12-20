import express from "express";
import { 
  getMe, 
  login, 
  logout, 
  signup, 
  updateProfile, 
  changePassword, 
  googleAuth 
} from "../controllers/auth.controller.js";
import { protectRoute, optionalAuth } from "../middleware/auth.middleware.js";
import {
  validateSignup,
  validateLogin,
  validateUpdateProfile,
  validateChangePassword,
  validateGoogleAuth
} from "../middleware/validation.middleware.js";
import { authLimiter, strictLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

// Public routes with rate limiting
router.post('/signup', authLimiter, validateSignup, signup);
router.post('/login', authLimiter, validateLogin, login);
router.post('/logout', logout);
router.post('/google', authLimiter, validateGoogleAuth, googleAuth);

// Protected routes
router.get('/me', optionalAuth, getMe); // Use optionalAuth to avoid 401 errors when not logged in
router.put('/update-profile', protectRoute, validateUpdateProfile, updateProfile);
router.put('/change-password', strictLimiter, protectRoute, validateChangePassword, changePassword);

export default router;
