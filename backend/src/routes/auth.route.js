import express from "express";
import { checkAuth, login, logout, signup, updateProfile, changePassword, googleAuth } from "../controllers/auth.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router()

router.post('/signup',signup)
router.post('/login', login)
router.post('/logout',logout)
router.post('/google', googleAuth)
router.put('/update-profile', protectRoute,updateProfile,checkAuth)
router.put('/change-password', protectRoute, changePassword)
router.get('/check', protectRoute,checkAuth)
export default router;