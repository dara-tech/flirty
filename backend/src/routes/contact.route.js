import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  sendContactRequest,
  getPendingRequests,
  acceptContactRequest,
  rejectContactRequest,
  getContacts,
  getContactStatus,
  searchContacts,
} from "../controllers/contact.controller.js";

const router = express.Router();

router.post("/request", protectRoute, sendContactRequest);
router.get("/requests", protectRoute, getPendingRequests);
router.post("/accept", protectRoute, acceptContactRequest);
router.post("/reject", protectRoute, rejectContactRequest);
router.get("/search", protectRoute, searchContacts); // Add before "/" to avoid route conflict
router.get("/", protectRoute, getContacts);
router.get("/status/:userId", protectRoute, getContactStatus);

export default router;
