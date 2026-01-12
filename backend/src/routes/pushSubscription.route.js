import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  subscribe,
  unsubscribe,
  getSubscriptions,
  getVapidPublicKey,
  testPushNotification,
} from "../controllers/pushSubscription.controller.js";
import {
  registerPushToken,
  unregisterPushToken,
  getUserPushTokens,
} from "../controllers/push.controller.js";

const router = express.Router();

// Public route to get VAPID public key
router.get("/vapid-public-key", getVapidPublicKey);

// Web Push (VAPID) - Protected routes
router.post("/subscribe", protectRoute, subscribe);
router.post("/unsubscribe", protectRoute, unsubscribe);
router.get("/subscriptions", protectRoute, getSubscriptions);
router.post("/test", protectRoute, testPushNotification);

// Mobile Push (FCM) - Protected routes
router.post("/register", protectRoute, registerPushToken);
router.post("/unregister", protectRoute, unregisterPushToken);
router.get("/tokens", protectRoute, getUserPushTokens);

export default router;
