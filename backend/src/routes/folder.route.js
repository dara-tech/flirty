import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  getFolders,
  createFolder,
  updateFolder,
  deleteFolder,
  addConversationToFolder,
  removeConversationFromFolder,
  reorderFolders,
} from "../controllers/folder.controller.js";

const router = express.Router();

// All routes require authentication
router.use(protectRoute);

// Get all folders for the authenticated user
router.get("/", getFolders);

// Create a new folder
router.post("/", createFolder);

// Reorder folders
router.put("/reorder", reorderFolders);

// Update a folder
router.put("/:id", updateFolder);

// Delete a folder
router.delete("/:id", deleteFolder);

// Add conversation to folder
router.post("/:id/conversations", addConversationToFolder);

// Remove conversation from folder
router.delete("/:id/conversations", removeConversationFromFolder);

export default router;





