import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { createMap, updateMap, deleteMap, getMaps, getMap } from "../controllers/map.controller.js";

const router = express.Router();

router.post("/create", protectRoute, createMap);
router.put("/update/:id", protectRoute, updateMap);
router.delete("/delete/:id", protectRoute, deleteMap);
router.get("/get-all", protectRoute, getMaps);
router.get("/get", protectRoute, getMap);

export default router;
