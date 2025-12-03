import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { getLastMessages, getMessages, getUsersForSidebar, sendMessage, editMessage, deleteMessage, updateMessageImage, deleteConversation, getMessagesByType, pinMessage, unpinMessage, addReaction, removeReaction } from "../controllers/message.controller.js";

const router = express.Router();

router.get("/users", protectRoute, getUsersForSidebar);
router.get("/last-messages", protectRoute, getLastMessages);
router.get("/by-type/:id", protectRoute, getMessagesByType);
router.get("/:id", protectRoute, getMessages);

router.post("/send/:id", protectRoute, sendMessage);
router.put("/edit/:id", protectRoute, editMessage);
router.put("/update-image/:id", protectRoute, updateMessageImage);
router.put("/pin/:id", protectRoute, pinMessage);
router.put("/unpin/:id", protectRoute, unpinMessage);
router.put("/reaction/:id", protectRoute, addReaction);
router.delete("/reaction/:id", protectRoute, removeReaction);
router.delete("/:id", protectRoute, deleteMessage);
router.delete("/conversation/:id", protectRoute, deleteConversation);

export default router;