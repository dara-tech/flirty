import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { getLastMessages, getMessages, getUsersForSidebar, sendMessage, editMessage, deleteMessage, updateMessageImage, deleteConversation } from "../controllers/message.controller.js";

const router = express.Router();

router.get("/users", protectRoute, getUsersForSidebar);
router.get("/last-messages", protectRoute, getLastMessages);
router.get("/:id", protectRoute, getMessages);

router.post("/send/:id", protectRoute, sendMessage);
router.put("/edit/:id", protectRoute, editMessage);
router.put("/update-image/:id", protectRoute, updateMessageImage);
router.delete("/:id", protectRoute, deleteMessage);
router.delete("/conversation/:id", protectRoute, deleteConversation);

export default router;