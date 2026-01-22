import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  getCallHistory,
  deleteCalls,
  getCallStats,
  rejectCall,
} from "../controllers/call.controller.js";
import { apiLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

router.get("/history", apiLimiter, protectRoute, getCallHistory);
router.get("/stats", apiLimiter, protectRoute, getCallStats);
router.delete("/", apiLimiter, protectRoute, deleteCalls);

// 🔥 HTTP fallback for call rejection (when socket is not connected)
router.post("/reject", apiLimiter, protectRoute, rejectCall);

export default router;
