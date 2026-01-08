import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  createGroup,
  getMyGroups,
  getGroup,
  addMembersToGroup,
  removeMemberFromGroup,
  getGroupMessages,
  getGroupMessagesByType,
  sendGroupMessage,
  getGroupLastMessages,
  deleteGroup,
  updateGroupInfo,
  leaveGroup,
  searchGroups,
} from "../controllers/group.controller.js";

const router = express.Router();

router.post("/create", protectRoute, createGroup);
router.get("/search", protectRoute, searchGroups); // Add before other GET routes to avoid conflicts
router.get("/my-groups", protectRoute, getMyGroups);
router.get("/last-messages", protectRoute, getGroupLastMessages);
router.get("/:id", protectRoute, getGroup);
router.get("/:id/messages/by-type", protectRoute, getGroupMessagesByType);
router.get("/:id/messages", protectRoute, getGroupMessages);
router.post("/:id/members", protectRoute, addMembersToGroup);
router.delete("/:id/members/:memberId", protectRoute, removeMemberFromGroup);
router.post("/:id/send", protectRoute, sendGroupMessage);
router.put("/:id/info", protectRoute, updateGroupInfo);
router.post("/:id/leave", protectRoute, leaveGroup);
router.delete("/:id", protectRoute, deleteGroup);

export default router;
