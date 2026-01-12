import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  registerPushToken,
  unregisterPushToken,
  getUserPushTokens,
} from "../controllers/push.controller.js";

const router = express.Router();

// All routes require authentication
router.use(protectRoute);

/**
 * @route   POST /api/push/register
 * @desc    Register a push notification token for the authenticated user
 * @access  Private
 * @body    { token, platform, userAgent, deviceInfo }
 */
router.post("/register", registerPushToken);

/**
 * @route   POST /api/push/unregister
 * @desc    Unregister a push notification token (logout)
 * @access  Private
 * @body    { token }
 */
router.post("/unregister", unregisterPushToken);

/**
 * @route   GET /api/push/tokens
 * @desc    Get all registered push tokens for the authenticated user
 * @access  Private
 */
router.get("/tokens", getUserPushTokens);

export default router;
