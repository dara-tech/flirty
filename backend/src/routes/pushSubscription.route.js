import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  subscribe,
  unsubscribe,
  getSubscriptions,
  getVapidPublicKey,
  testPushNotification,
} from "../controllers/pushSubscription.controller.js";

const router = express.Router();

// Public route to get VAPID public key
router.get("/vapid-public-key", getVapidPublicKey);

// Protected routes (require authentication)
router.post("/subscribe", protectRoute, subscribe);
router.post("/unsubscribe", protectRoute, unsubscribe);
router.get("/subscriptions", protectRoute, getSubscriptions);
router.post("/test", protectRoute, testPushNotification);

export default router;

