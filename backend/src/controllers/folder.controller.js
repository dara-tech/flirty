import Folder from "../model/folder.model.js";
import logger from "../lib/logger.js";
import mongoose from "mongoose";

// Get all folders for a user
export const getFolders = async (req, res) => {
  try {
    const userId = req.user._id;

    const folders = await Folder.find({ userId })
      .sort({ order: 1, createdAt: 1 })
      .lean();

    res.status(200).json({
      success: true,
      folders: folders || [],
    });
  } catch (error) {
    logger.error("Error in getFolders", {
      requestId: req?.requestId,
      error: error.message,
      stack: error.stack,
      userId: req?.user?._id,
    });
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Create a new folder
export const createFolder = async (req, res) => {
  try {
    const userId = req.user._id;
    const { name, icon, color } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: "Folder name is required",
      });
    }

    // Get the highest order number to place new folder at the end
    const lastFolder = await Folder.findOne({ userId })
      .sort({ order: -1 })
      .select("order")
      .lean();

    const newOrder = lastFolder ? lastFolder.order + 1 : 0;

    const folder = new Folder({
      userId,
      name: name.trim(),
      icon: icon || "📁",
      color: color || "#3b82f6",
      order: newOrder,
      conversations: [],
    });

    await folder.save();

    res.status(201).json({
      success: true,
      folder,
    });
  } catch (error) {
    logger.error("Error in createFolder", {
      requestId: req?.requestId,
      error: error.message,
      stack: error.stack,
      userId: req?.user?._id,
    });
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Update a folder
export const updateFolder = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    const { name, icon, color, isExpanded, order } = req.body;

    const folder = await Folder.findOne({ _id: id, userId });

    if (!folder) {
      return res.status(404).json({
        success: false,
        error: "Folder not found",
      });
    }

    // Update fields if provided
    if (name !== undefined) folder.name = name.trim();
    if (icon !== undefined) folder.icon = icon;
    if (color !== undefined) folder.color = color;
    if (isExpanded !== undefined) folder.isExpanded = isExpanded;
    if (order !== undefined) folder.order = order;

    await folder.save();

    res.status(200).json({
      success: true,
      folder,
    });
  } catch (error) {
    logger.error("Error in updateFolder", {
      requestId: req?.requestId,
      error: error.message,
      stack: error.stack,
      userId: req?.user?._id,
      folderId: req?.params?.id,
    });
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Delete a folder
export const deleteFolder = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    const folder = await Folder.findOneAndDelete({ _id: id, userId });

    if (!folder) {
      return res.status(404).json({
        success: false,
        error: "Folder not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Folder deleted successfully",
    });
  } catch (error) {
    logger.error("Error in deleteFolder", {
      requestId: req?.requestId,
      error: error.message,
      stack: error.stack,
      userId: req?.user?._id,
      folderId: req?.params?.id,
    });
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Add conversation to folder
export const addConversationToFolder = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id: folderId } = req.params;
    const { type, conversationId } = req.body; // type: "user" or "group"

    if (!type || !["user", "group"].includes(type)) {
      return res.status(400).json({
        success: false,
        error: "Invalid type. Must be 'user' or 'group'",
      });
    }

    if (!conversationId) {
      return res.status(400).json({
        success: false,
        error: "Conversation ID is required",
      });
    }

    const folder = await Folder.findOne({ _id: folderId, userId });

    if (!folder) {
      return res.status(404).json({
        success: false,
        error: "Folder not found",
      });
    }

    // Check if conversation already exists in this folder
    const exists = folder.conversations.some(
      (conv) =>
        conv.type === type &&
        conv.id.toString() === conversationId.toString()
    );

    if (exists) {
      return res.status(400).json({
        success: false,
        error: "Conversation already in folder",
      });
    }

    // Remove from other folders first (a conversation can only be in one folder)
    await Folder.updateMany(
      {
        userId,
        _id: { $ne: folderId },
        "conversations.id": new mongoose.Types.ObjectId(conversationId),
        "conversations.type": type,
      },
      {
        $pull: {
          conversations: {
            type: type,
            id: new mongoose.Types.ObjectId(conversationId),
          },
        },
      }
    );

    // Add to this folder
    folder.conversations.push({
      type,
      id: new mongoose.Types.ObjectId(conversationId),
      addedAt: new Date(),
    });

    await folder.save();

    res.status(200).json({
      success: true,
      folder,
    });
  } catch (error) {
    logger.error("Error in addConversationToFolder", {
      requestId: req?.requestId,
      error: error.message,
      stack: error.stack,
      userId: req?.user?._id,
      folderId: req?.params?.id,
    });
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Remove conversation from folder
export const removeConversationFromFolder = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id: folderId } = req.params;
    const { type, conversationId } = req.body;

    if (!type || !["user", "group"].includes(type)) {
      return res.status(400).json({
        success: false,
        error: "Invalid type. Must be 'user' or 'group'",
      });
    }

    if (!conversationId) {
      return res.status(400).json({
        success: false,
        error: "Conversation ID is required",
      });
    }

    const folder = await Folder.findOne({ _id: folderId, userId });

    if (!folder) {
      return res.status(404).json({
        success: false,
        error: "Folder not found",
      });
    }

    folder.conversations = folder.conversations.filter(
      (conv) =>
        !(
          conv.type === type &&
          conv.id.toString() === conversationId.toString()
        )
    );

    await folder.save();

    res.status(200).json({
      success: true,
      folder,
    });
  } catch (error) {
    logger.error("Error in removeConversationFromFolder", {
      requestId: req?.requestId,
      error: error.message,
      stack: error.stack,
      userId: req?.user?._id,
      folderId: req?.params?.id,
    });
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Reorder folders
export const reorderFolders = async (req, res) => {
  try {
    const userId = req.user._id;
    const { folderOrders } = req.body; // Array of { folderId, order }

    if (!Array.isArray(folderOrders)) {
      return res.status(400).json({
        success: false,
        error: "folderOrders must be an array",
      });
    }

    // Update all folders in a single bulk operation
    const bulkOps = folderOrders.map(({ folderId, order }) => ({
      updateOne: {
        filter: { _id: folderId, userId },
        update: { $set: { order } },
      },
    }));

    await Folder.bulkWrite(bulkOps);

    const folders = await Folder.find({ userId })
      .sort({ order: 1, createdAt: 1 })
      .lean();

    res.status(200).json({
      success: true,
      folders,
    });
  } catch (error) {
    logger.error("Error in reorderFolders", {
      requestId: req?.requestId,
      error: error.message,
      stack: error.stack,
      userId: req?.user?._id,
    });
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};





