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
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  validateSignup,
  validateLogin,
  validateUpdateProfile,
  validateChangePassword,
  validateGoogleAuth
} from "../middleware/validation.middleware.js";

const router = express.Router();

// Public routes
router.post('/signup', validateSignup, signup);
router.post('/login', validateLogin, login);
router.post('/logout', logout);
router.post('/google', validateGoogleAuth, googleAuth);

// Protected routes
router.get('/me', protectRoute, getMe);
router.put('/update-profile', protectRoute, validateUpdateProfile, updateProfile);
router.put('/change-password', protectRoute, validateChangePassword, changePassword);

export default router;
