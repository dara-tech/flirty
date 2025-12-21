import User from "../model/user.model.js";
import Message from "../model/message.model.js";
import { getReceiverSocketId, io } from "../lib/socket.js";
import { toPlainObject } from "../lib/utils.js";
import logger from "../lib/logger.js";
import { paginatedResponse } from "../lib/apiResponse.js";

import mongoose from "mongoose";

export const getLastMessages = async (req, res) => {
  try {
    // Validate user authentication
    if (!req.user || !req.user._id) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    const myId = new mongoose.Types.ObjectId(req.user._id);

    // Get pagination parameters (Telegram-style: page-based)
    // ?page=1&limit=50 means first page with 50 items
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit; // Calculate skip from page

    // Optimized: Get unique partners efficiently, then fetch last messages in batches
    // Limit to recent messages to reduce dataset size - reduced date range for faster queries
    const dateLimit = new Date();
    dateLimit.setMonth(dateLimit.getMonth() - 3); // Last 3 months (reduced from 6 for faster initial load)

    // For first page, use a much smaller sample to find partners quickly
    // For subsequent pages, we can use more messages since we already know the total
    const isFirstPage = page === 1;
    const messagesNeeded = isFirstPage 
      ? Math.min(limit * 3, 200) // First page: only 200 messages max (very fast, avoids sort memory issues)
      : Math.min(limit * 2, 500); // Later pages: reduced from 1000 to 500
    
    // Split into two queries to avoid complex $or sort operations
    // Query 1: Messages where I'm the sender
    const sentMessages = await Message.find({
      senderId: myId,
      receiverId: { $exists: true },
      createdAt: { $gte: dateLimit },
      groupId: { $exists: false },
    })
      .select("senderId receiverId createdAt")
      .sort({ createdAt: -1 })
      .limit(Math.ceil(messagesNeeded / 2))
      .maxTimeMS(2000)
      .lean();
    
    // Query 2: Messages where I'm the receiver
    const receivedMessages = await Message.find({
      receiverId: myId,
      senderId: { $exists: true },
      createdAt: { $gte: dateLimit },
      groupId: { $exists: false },
    })
      .select("senderId receiverId createdAt")
      .sort({ createdAt: -1 })
      .limit(Math.ceil(messagesNeeded / 2))
      .maxTimeMS(2000)
      .lean();
    
    // Combine and sort in JavaScript (much faster than MongoDB sort on large datasets)
    const recentMessages = [...sentMessages, ...receivedMessages]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, messagesNeeded);

    // Extract unique partners with their last message time
    const partnerMap = new Map();
    for (const msg of recentMessages) {
      // Skip group messages (they don't have receiverId)
      if (!msg.senderId || !msg.receiverId) {
        continue;
      }
      
      // Handle both ObjectId and string formats
      const senderIdStr = msg.senderId?.toString ? msg.senderId.toString() : String(msg.senderId);
      const receiverIdStr = msg.receiverId?.toString ? msg.receiverId.toString() : String(msg.receiverId);
      const myIdStr = myId.toString();
      
      // Determine partner ID (the other user in the conversation)
      const partnerId = senderIdStr === myIdStr ? receiverIdStr : senderIdStr;
      
      // Skip if partnerId is invalid
      if (!partnerId || partnerId === myIdStr) {
        continue;
      }
      
      if (!partnerMap.has(partnerId) || new Date(msg.createdAt) > new Date(partnerMap.get(partnerId).lastMessageTime)) {
        partnerMap.set(partnerId, {
          partnerId: partnerId,
          lastMessageTime: msg.createdAt,
        });
      }
    }

    // Convert to array and sort by last message time
    const allPartners = Array.from(partnerMap.values())
      .sort((a, b) => new Date(b.lastMessageTime) - new Date(a.lastMessageTime));
    
    const total = allPartners.length;
    const conversationPartners = allPartners.slice(skip, skip + limit);
    const partnerIds = conversationPartners.map(p => new mongoose.Types.ObjectId(p.partnerId));
    
    if (partnerIds.length === 0) {
      return paginatedResponse(
        res,
        [],
        {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasMore: skip + limit < total,
          skip,
        },
        "Messages retrieved successfully"
      );
    }

    // Optimized: Fetch last message for each partner individually (more reliable than $or with $in)
    // This avoids complex sort operations that can exceed memory limits
    // Use Promise.all for parallel queries but limit concurrency
    const allLastMessages = [];
    const batchSize = 10; // Process partners in batches to avoid overwhelming the database
    
    for (let i = 0; i < partnerIds.length; i += batchSize) {
      const batch = partnerIds.slice(i, i + batchSize);
      const batchPromises = batch.map(async (partnerId) => {
        try {
          const message = await Message.findOne({
            $or: [
              { senderId: myId, receiverId: partnerId },
              { receiverId: myId, senderId: partnerId },
            ],
            groupId: { $exists: false },
          })
            .sort({ createdAt: -1 })
            .populate("senderId", "fullname profilePic email")
            .populate("receiverId", "fullname profilePic email")
            .maxTimeMS(2000) // 2 second timeout per query
            .lean();
          return message;
        } catch (error) {
          logger.warn("Error fetching last message for partner", { partnerId, error: error.message });
          return null;
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      allLastMessages.push(...batchResults.filter(Boolean));
    }

    // Group by partner and get the most recent message for each
    const messagesByPartner = new Map();
    const myIdStr = myId.toString();
    
    for (const msg of allLastMessages) {
      // Skip group messages (they don't have receiverId)
      if (!msg.senderId || !msg.receiverId) {
        continue;
      }
      
      // Handle populated objects (with _id) and ObjectIds/strings
      const getSenderId = () => {
        if (msg.senderId?._id) return msg.senderId._id.toString();
        if (msg.senderId?.toString) return msg.senderId.toString();
        return String(msg.senderId);
      };
      
      const getReceiverId = () => {
        if (msg.receiverId?._id) return msg.receiverId._id.toString();
        if (msg.receiverId?.toString) return msg.receiverId.toString();
        return String(msg.receiverId);
      };
      
      const senderIdStr = getSenderId();
      const receiverIdStr = getReceiverId();
      
      // Determine partner ID (the other user in the conversation)
      const partnerId = senderIdStr === myIdStr ? receiverIdStr : senderIdStr;
      
      // Skip if partnerId is invalid
      if (!partnerId || partnerId === myIdStr) {
        continue;
      }
      
      if (!messagesByPartner.has(partnerId)) {
        messagesByPartner.set(partnerId, msg);
      } else {
        const existing = messagesByPartner.get(partnerId);
        if (new Date(msg.createdAt) > new Date(existing.createdAt)) {
          messagesByPartner.set(partnerId, msg);
        }
      }
    }

    // Get messages in the order of conversationPartners
    const lastMessages = partnerIds
      .map(id => {
        const idStr = id.toString();
        return messagesByPartner.get(idStr);
      })
      .filter(msg => msg !== undefined);
    const totalPages = Math.ceil(total / limit);
    const hasMore = page < totalPages;

    // Use standardized paginated response
    paginatedResponse(
      res,
      lastMessages,
      {
        page,
        limit,
        total,
        totalPages,
        hasMore,
        skip,
      },
      "Messages retrieved successfully"
    );
  } catch (error) {
    logger.error("Error in getLastMessages", {
      requestId: req?.requestId,
      error: error.message,
      stack: error.stack,
      userId: req?.user?._id,
    });
    console.error("Full error in getLastMessages:", error);
    res.status(500).json({ 
      error: "Internal server error",
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const getUsersForSidebar = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;
    const myId = new mongoose.Types.ObjectId(loggedInUserId);

    // Get pagination parameters (Telegram-style: page-based)
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100; // Default 100 users per page
    const skip = (page - 1) * limit;

    // Optimized: Use the same approach as getLastMessages - faster than aggregation
    // Limit to recent messages to reduce dataset size
    // Reduced date range for faster queries
    const dateLimitUsers = new Date();
    dateLimitUsers.setMonth(dateLimitUsers.getMonth() - 3); // Last 3 months (reduced from 6)

    // Get unique partners from recent messages (much faster than aggregation)
    // Reduced limit for faster queries - only need enough to find unique partners
    
    const recentMessages = await Message.find({
      $or: [{ senderId: myId }, { receiverId: myId }],
      createdAt: { $gte: dateLimitUsers },
      groupId: { $exists: false }, // Only direct messages
    })
      .select("senderId receiverId")
      .limit(1000) // Reduced from 2000 to 1000 for faster queries
      .maxTimeMS(3000) // Reduced timeout to 3 seconds
      .lean();

    // Extract unique partner IDs in JavaScript (faster than aggregation)
    const partnerIdsSet = new Set();
    const myIdStr = myId.toString();
    
    for (const msg of recentMessages) {
      if (!msg.senderId || !msg.receiverId) continue;
      
      const senderIdStr = msg.senderId?.toString ? msg.senderId.toString() : String(msg.senderId);
      const receiverIdStr = msg.receiverId?.toString ? msg.receiverId.toString() : String(msg.receiverId);
      
      const partnerId = senderIdStr === myIdStr ? receiverIdStr : senderIdStr;
      if (partnerId && partnerId !== myIdStr) {
        partnerIdsSet.add(partnerId);
      }
    }

    const totalUsers = partnerIdsSet.size;
    const partnerIdsArray = Array.from(partnerIdsSet);
    
    // Apply pagination
    const paginatedPartnerIds = partnerIdsArray.slice(skip, skip + limit);
    const partnerObjectIds = paginatedPartnerIds.map(id => new mongoose.Types.ObjectId(id));

    // Fetch user data for paginated partners
    let usersWithConversations = [];
    if (partnerObjectIds.length > 0) {
      usersWithConversations = await User.find({
        _id: { $in: partnerObjectIds }
      })
        .select("fullname email profilePic")
        .lean();
      
      // Sort by order in paginatedPartnerIds to maintain order
      const userMap = new Map(usersWithConversations.map(u => [u._id.toString(), u]));
      usersWithConversations = paginatedPartnerIds
        .map(id => userMap.get(id))
        .filter(Boolean); // Remove any missing users
    }

    const total = totalUsers;
    const totalPages = Math.ceil(total / limit);
    const hasMore = page < totalPages;

    // Use standardized paginated response
    paginatedResponse(
      res,
      usersWithConversations,
      {
        page,
        limit,
        total,
        totalPages,
        hasMore,
      },
      "Users retrieved successfully"
    );
  } catch (error) {
    logger.error("Error in getUsersForSidebar", {
      requestId: req?.requestId,
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get all users (for contacts page)
export const getAllUsers = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;

    // Get pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 200; // Default 200 users per page
    const skip = (page - 1) * limit;

    // Get all users except the current user
    const users = await User.find({ _id: { $ne: loggedInUserId } })
      .select("fullname email profilePic")
      .sort({ fullname: 1 }) // Sort alphabetically
      .skip(skip)
      .limit(limit);

    // Get total count (excluding current user)
    const total = await User.countDocuments({ _id: { $ne: loggedInUserId } });
    const totalPages = Math.ceil(total / limit);
    const hasMore = page < totalPages;

    // Use standardized paginated response
    paginatedResponse(
      res,
      users,
      {
        page,
        limit,
        total,
        totalPages,
        hasMore,
      },
      "All users retrieved successfully"
    );
  } catch (error) {
    logger.error("Error in getAllUsers", {
      requestId: req?.requestId,
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getMessages = async (req, res) => {
  try {
    const { id: userToChatId } = req.params;
    const myId = req.user._id;

    // Pagination parameters (Telegram-style: newest first, load last N messages)
    const limit = Math.min(parseInt(req.query.limit) || 50, 100); // Cap at 100 to prevent large queries
    const before = req.query.before; // Message ID to load messages before (for pagination)

    // Validate userToChatId
    if (!userToChatId || !mongoose.Types.ObjectId.isValid(userToChatId)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    // Use ObjectId for proper comparison
    const myObjectId = new mongoose.Types.ObjectId(myId);
    const otherUserObjectId = new mongoose.Types.ObjectId(userToChatId);

    // Build query
    const query = {
      $or: [
        { senderId: myObjectId, receiverId: otherUserObjectId },
        { senderId: otherUserObjectId, receiverId: myObjectId },
      ],
    };

    // If 'before' is provided, load messages older than that message
    if (before) {
      try {
        if (mongoose.Types.ObjectId.isValid(before)) {
          const beforeMessage = await Message.findById(before).select("createdAt").lean();
          if (beforeMessage) {
            query.createdAt = { $lt: beforeMessage.createdAt };
          }
        }
      } catch (e) {
        // Invalid before ID, ignore
        logger.warn("Invalid before message ID", { before, error: e.message });
      }
    }

    // Sort descending (newest first) and limit with timeout protection
    // Add maxTimeMS to prevent queries from hanging
    const messages = await Message.find(query)
      .populate("reactions.userId", "fullname profilePic")
      .sort({ createdAt: -1 }) // Newest first (Telegram-style)
      .limit(limit)
      .maxTimeMS(10000) // 10 second timeout
      .lean(); // Use lean() for read-only queries (faster)

    // Check if there are more messages before reversing
    const hasMore = messages.length === limit;

    // Reverse to get chronological order for display (oldest to newest)
    // Frontend will display in reverse (newest at top)
    const reversedMessages = messages.reverse();

    res.status(200).json({
      messages: reversedMessages,
      hasMore: hasMore, // If we got full limit, there might be more
    });
  } catch (error) {
    logger.error("Error in getMessages", {
      requestId: req?.requestId,
      error: error.message,
      stack: error.stack,
      userId: req.user?._id?.toString(),
      userToChatId: req.params?.id,
    });
    
    // Return more detailed error in development
    const errorMessage =
      process.env.NODE_ENV === "development"
        ? `Internal server error: ${error.message || "Unknown error"}`
        : "Internal server error";
    res.status(500).json({ error: errorMessage });
  }
};

// Helper function to detect URLs in text
const extractUrl = (text) => {
  if (!text) return null;
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const matches = text.match(urlRegex);
  return matches && matches.length > 0 ? matches[0] : null;
};

// Helper function to normalize input to array (supports both single values and arrays)
export const normalizeToArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value))
    return value.filter(
      (v) => v && (typeof v === "string" ? v.length > 0 : true)
    );
  return [value].filter(
    (v) => v && (typeof v === "string" ? v.length > 0 : true)
  );
};

// Helper function to upload a single image
export const uploadImage = async (imageData) => {
  // Client already uploaded to OSS (Cloudinary/S3/etc.), just return the URL/data as-is
  return imageData;
};

// Helper function to upload a single audio file
export const uploadAudio = async (audioData) => {
  // Client already uploaded to OSS (Cloudinary/S3/etc.), just return the URL/data as-is
  return audioData;
};

// Helper function to upload a single video file
// Helper function to upload a single video file
export const uploadVideo = async (videoData) => {
  // Client already uploaded to OSS (Cloudinary/S3/etc.), just return the URL/data as-is
  return videoData;
};

// Helper function to upload a single file
export const uploadFile = async (fileData) => {
  // Client already uploaded to OSS (Cloudinary/S3/etc.), just return the URL/data as-is
  return fileData;
};

export const sendMessage = async (req, res) => {
  try {
    const {
      text,
      image,
      audio,
      video,
      file,
      fileName,
      fileSize,
      fileType,
      forwardedFrom,
    } = req.body;
    const { id: receiverId } = req.params;
    const senderId = req.user._id;

    // Normalize inputs to arrays (supports both single values and arrays for backward compatibility)
    const images = normalizeToArray(image);
    const audios = normalizeToArray(audio);
    const videos = normalizeToArray(video);
    const files = normalizeToArray(file);
    const fileNames = normalizeToArray(fileName);
    const fileSizes = normalizeToArray(fileSize);
    const fileTypes = normalizeToArray(fileType);

    // Log for debugging multiple files
    if (images.length > 1 || videos.length > 1 || files.length > 1) {
      logger.info("Multiple files received", {
        requestId: req?.requestId,
        imageCount: images.length,
        videoCount: videos.length,
        fileCount: files.length,
        isImageArray: Array.isArray(image),
        isVideoArray: Array.isArray(video),
        isFileArray: Array.isArray(file),
        imageUrls: images.length > 0 ? images.map((img, idx) => `[${idx}]: ${typeof img === 'string' ? img.substring(0, 50) + '...' : 'non-string'}`) : [],
        videoUrls: videos.length > 0 ? videos.map((vid, idx) => `[${idx}]: ${typeof vid === 'string' ? vid.substring(0, 50) + '...' : 'non-string'}`) : [],
        fileUrls: files.length > 0 ? files.map((f, idx) => `[${idx}]: ${typeof f === 'string' ? f.substring(0, 50) + '...' : 'non-string'}`) : [],
      });
    }

    // Validate that at least one of text, image, audio, video, or file is provided
    const hasText = text && typeof text === "string" && text.trim().length > 0;
    const hasImage = images.length > 0;
    const hasAudio = audios.length > 0;
    const hasVideo = videos.length > 0;
    const hasFile = files.length > 0;

    if (!hasText && !hasImage && !hasAudio && !hasVideo && !hasFile) {
      return res
        .status(400)
        .json({
          error:
            "Message must contain either text, image, audio, video, or file",
        });
    }

    // Client already uploaded to OSS, just pass through the URLs/data
    let imageUrls = [];
    let audioUrls = [];
    let videoUrls = [];
    let fileUrls = [];

    // Simply pass through all media URLs (no server-side upload needed)
    if (images.length > 0) {
      imageUrls = images;
    }
    if (audios.length > 0) {
      audioUrls = audios;
    }
    if (videos.length > 0) {
      videoUrls = videos;
    }
    if (files.length > 0) {
      fileUrls = files;
    }

    // Extract link from text if present
    let linkUrl = null;
    let linkPreview = null;
    if (text) {
      linkUrl = extractUrl(text);
      if (linkUrl) {
        linkPreview = {
          url: linkUrl,
          title: null,
          description: null,
          image: null,
        };
      }
    }

    // Handle forwarded message tracking
    let forwardedFromData = null;
    if (forwardedFrom) {
      const originalMessage = await Message.findById(forwardedFrom.messageId)
        .populate("senderId", "fullname")
        .populate("receiverId", "fullname");

      if (originalMessage) {
        const Group = (await import("../model/group.model.js")).default;
        let chatName = null;
        let chatType = null;
        let chatId = null;

        if (originalMessage.groupId) {
          const group = await Group.findById(originalMessage.groupId);
          chatName = group?.name || "Group";
          chatType = "group";
          chatId = originalMessage.groupId;
        } else if (originalMessage.receiverId) {
          const receiver = originalMessage.receiverId;
          chatName = receiver.fullname || "User";
          chatType = "user";
          chatId = originalMessage.receiverId._id || originalMessage.receiverId;
        }

        forwardedFromData = {
          messageId: originalMessage._id,
          senderId: originalMessage.senderId._id || originalMessage.senderId,
          senderName: originalMessage.senderId.fullname || "Unknown",
          chatType: chatType,
          chatId: chatId,
          chatName: chatName,
          forwardedAt: new Date(),
        };
      }
    }

    const newMessage = new Message({
      senderId,
      receiverId,
      text: text || "", // Provide empty string if no text
      image: imageUrls.length > 0 ? imageUrls : undefined,
      audio: audioUrls.length > 0 ? audioUrls : undefined,
      video: videoUrls.length > 0 ? videoUrls : undefined,
      file: fileUrls.length > 0 ? fileUrls : undefined,
      fileName: fileNames.length > 0 ? fileNames : undefined,
      fileSize: fileSizes.length > 0 ? fileSizes : undefined,
      fileType: fileTypes.length > 0 ? fileTypes : undefined,
      link: linkUrl,
      linkPreview: linkPreview,
      forwardedFrom: forwardedFromData,
    });

    // Log what we're saving for debugging
    if (imageUrls.length > 1 || videoUrls.length > 1 || fileUrls.length > 1) {
      logger.info("Saving message with multiple files", {
        requestId: req?.requestId,
        imageCount: imageUrls.length,
        videoCount: videoUrls.length,
        fileCount: fileUrls.length,
        imageArray: Array.isArray(newMessage.image),
        videoArray: Array.isArray(newMessage.video),
        fileArray: Array.isArray(newMessage.file),
      });
    }

    await newMessage.save();
    
    // Log what was actually saved
    if (imageUrls.length > 1 || videoUrls.length > 1 || fileUrls.length > 1) {
      logger.info("Message saved with files", {
        requestId: req?.requestId,
        messageId: newMessage._id,
        savedImageCount: Array.isArray(newMessage.image) ? newMessage.image.length : (newMessage.image ? 1 : 0),
        savedVideoCount: Array.isArray(newMessage.video) ? newMessage.video.length : (newMessage.video ? 1 : 0),
        savedFileCount: Array.isArray(newMessage.file) ? newMessage.file.length : (newMessage.file ? 1 : 0),
      });
    }
    await newMessage.populate("senderId", "fullname profilePic");
    await newMessage.populate("receiverId", "fullname profilePic");

    // Convert Mongoose document to plain object for socket emit
    const messageObj = newMessage.toObject ? newMessage.toObject() : newMessage;

    // Emit to both sender and receiver for real-time updates
    const receiverSocketId = getReceiverSocketId(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("newMessage", messageObj);
    }

    // Also emit to sender so they see their own message in real-time
    const senderSocketId = getReceiverSocketId(senderId.toString());
    if (senderSocketId) {
      io.to(senderSocketId).emit("newMessage", messageObj);
    }

    logger.info("Message sent successfully", {
      requestId: req.requestId,
      messageId: newMessage._id,
      senderId: senderId.toString(),
      receiverId,
    });

    res.status(201).json(newMessage);
  } catch (error) {
    logger.error("Error in sendMessage", {
      requestId: req.requestId,
      error: error.message,
      stack: error.stack,
      senderId: req.user?._id?.toString(),
      receiverId: req.params.id,
    });
    // Return more detailed error in development
    const errorMessage =
      process.env.NODE_ENV === "development"
        ? `Internal server error: ${error.message || "Unknown error"}`
        : "Internal server error";
    res.status(500).json({ error: errorMessage });
  }
};

export const editMessage = async (req, res) => {
  try {
    const { id: messageId } = req.params;
    const { text } = req.body;
    const userId = req.user._id;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Message text is required" });
    }

    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    // Check if user is the sender
    if (message.senderId.toString() !== userId.toString()) {
      return res
        .status(403)
        .json({ error: "You can only edit your own messages" });
    }

    // Only allow editing text messages (not images)
    if (message.image) {
      return res.status(400).json({ error: "Cannot edit image messages" });
    }

    // Update message
    message.text = text.trim();
    message.edited = true;
    message.editedAt = new Date();
    await message.save();

    // Populate message with user data before emitting
    await message.populate("senderId", "fullname profilePic email");
    await message.populate("receiverId", "fullname profilePic email");

    // Populate seenBy for group messages
    if (message.groupId) {
      await message.populate("seenBy.userId", "fullname profilePic");
    }

    // Convert Mongoose document to plain object for socket emit
    const messageObj = message.toObject ? message.toObject() : message;

    // Ensure edited flag and editedAt are included
    messageObj.edited = true;
    messageObj.editedAt = message.editedAt || new Date();

    // Emit socket event to notify receivers
    if (message.receiverId) {
      // Direct message - extract receiverId as string (handle both ObjectId and populated object)
      const receiverIdStr =
        typeof message.receiverId === "object" && message.receiverId._id
          ? message.receiverId._id.toString()
          : message.receiverId.toString();

      const receiverSocketId = getReceiverSocketId(receiverIdStr);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("messageEdited", messageObj);
      } else {
      }

      // Also notify sender
      const senderIdStr = userId.toString();
      const senderSocketId = getReceiverSocketId(senderIdStr);
      if (senderSocketId) {
        io.to(senderSocketId).emit("messageEdited", messageObj);
      } else {
      }
    } else if (message.groupId) {
      // Group message - notify all group members
      const Group = (await import("../model/group.model.js")).default;
      const group = await Group.findById(message.groupId);
      if (group) {
        const allMembers = [group.admin, ...group.members];
        allMembers.forEach((memberId) => {
          io.emit("groupMessageEdited", {
            message: messageObj,
            groupId: message.groupId,
            memberId: memberId.toString(),
          });
        });
      }
    }

    // Return populated message for response
    const populatedMessage = await Message.findById(message._id)
      .populate("senderId", "fullname profilePic email")
      .populate("receiverId", "fullname profilePic email");

    res.status(200).json(populatedMessage);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
};

export const deleteMessage = async (req, res) => {
  try {
    const { id: messageId } = req.params;
    const { deleteType = "forEveryone" } = req.body; // "forMe" or "forEveryone"
    const userId = req.user._id;

    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    if (deleteType === "forEveryone") {
      // Only sender can delete for everyone
      if (message.senderId.toString() !== userId.toString()) {
        return res
          .status(403)
          .json({
            error: "You can only delete your own messages for everyone",
          });
      }

      // Save message info before deletion to find new last message
      const deletedMessageReceiverId = message.receiverId;
      const deletedMessageSenderId = message.senderId;

      // Delete the message completely
      await Message.findByIdAndDelete(messageId);

      // Find the new last message for this conversation (if any messages remain)
      let newLastMessage = null;
      if (deletedMessageReceiverId) {
        // Use ObjectId for proper database comparison
        const senderObjectId = new mongoose.Types.ObjectId(
          deletedMessageSenderId
        );
        const receiverObjectId = new mongoose.Types.ObjectId(
          deletedMessageReceiverId
        );

        // Find the most recent remaining message in this conversation
        const remainingMessages = await Message.find({
          $or: [
            { senderId: senderObjectId, receiverId: receiverObjectId },
            { senderId: receiverObjectId, receiverId: senderObjectId },
          ],
        })
          .sort({ createdAt: -1 })
          .limit(1)
          .populate("senderId", "fullname profilePic email")
          .populate("receiverId", "fullname profilePic email");

        if (remainingMessages.length > 0) {
          newLastMessage = remainingMessages[0].toObject
            ? remainingMessages[0].toObject()
            : remainingMessages[0];
          // Ensure edited flag is included
          newLastMessage.edited = remainingMessages[0].edited || false;
          newLastMessage.editedAt = remainingMessages[0].editedAt || null;
        } else {
        }
      }

      // Emit socket event to notify receivers with new last message info
      if (message.receiverId) {
        // Direct message - convert messageId to string for consistency
        const messageIdStr = messageId.toString();

        // Extract receiverId as string (handle both ObjectId and populated object)
        const receiverIdStr =
          typeof message.receiverId === "object" && message.receiverId._id
            ? message.receiverId._id.toString()
            : message.receiverId.toString();

        const receiverSocketId = getReceiverSocketId(receiverIdStr);
        if (receiverSocketId) {
          io.to(receiverSocketId).emit("messageDeleted", {
            messageId: messageIdStr,
            deleteType: "forEveryone",
            newLastMessage: newLastMessage, // Send new last message if exists
            conversationDeleted: !newLastMessage, // Flag if conversation is now empty
          });
        } else {
        }

        // Also notify sender
        const senderIdStr = userId.toString();
        const senderSocketId = getReceiverSocketId(senderIdStr);
        if (senderSocketId) {
          io.to(senderSocketId).emit("messageDeleted", {
            messageId: messageIdStr,
            deleteType: "forEveryone",
            newLastMessage: newLastMessage, // Send new last message if exists
            conversationDeleted: !newLastMessage, // Flag if conversation is now empty
          });
        } else {
        }
      } else if (message.groupId) {
        // Group message - notify all group members
        const messageIdStr = messageId.toString();
        const Group = (await import("../model/group.model.js")).default;
        const group = await Group.findById(message.groupId);
        if (group) {
          const allMembers = [group.admin, ...group.members];
          allMembers.forEach((memberId) => {
            io.emit("groupMessageDeleted", {
              messageId: messageIdStr,
              groupId: message.groupId,
              memberId: memberId.toString(),
              deleteType: "forEveryone",
            });
          });
        }
      }
    } else {
      // Delete for me - just notify the user's client
      const messageIdStr = messageId.toString();
      const userSocketId = getReceiverSocketId(userId);
      if (userSocketId) {
        if (message.receiverId) {
          io.to(userSocketId).emit("messageDeleted", {
            messageId: messageIdStr,
            deleteType: "forMe",
          });
        } else if (message.groupId) {
          io.to(userSocketId).emit("groupMessageDeleted", {
            messageId: messageIdStr,
            groupId: message.groupId,
            memberId: userId.toString(),
            deleteType: "forMe",
          });
        }
      }
    }

    res
      .status(200)
      .json({ message: "Message deleted successfully", deleteType });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
};

export const updateMessageImage = async (req, res) => {
  try {
    const { id: messageId } = req.params;
    const { image } = req.body;
    const userId = req.user._id;

    if (!image) {
      return res.status(400).json({ error: "Image is required" });
    }

    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    // Check if user is the sender
    if (message.senderId.toString() !== userId.toString()) {
      return res
        .status(403)
        .json({ error: "You can only edit your own messages" });
    }

    // Check if message has an image
    if (!message.image) {
      return res
        .status(400)
        .json({ error: "This message does not have an image" });
    }

    // Client already uploaded to OSS, just use the URL
    const newImageUrl = image;

    // Update message
    message.image = newImageUrl;
    message.edited = true;
    message.editedAt = new Date();
    await message.save();

    // Populate message with user data before emitting
    await message.populate("senderId", "fullname profilePic email");
    await message.populate("receiverId", "fullname profilePic email");

    // Populate seenBy for group messages
    if (message.groupId) {
      await message.populate("seenBy.userId", "fullname profilePic");
    }

    // Convert Mongoose document to plain object for socket emit
    const messageObj = message.toObject ? message.toObject() : message;

    // Ensure edited flag and editedAt are included
    messageObj.edited = true;
    messageObj.editedAt = message.editedAt || new Date();

    // Emit socket event to notify receivers
    if (message.receiverId) {
      // Direct message - extract receiverId as string (handle both ObjectId and populated object)
      const receiverIdStr =
        typeof message.receiverId === "object" && message.receiverId._id
          ? message.receiverId._id.toString()
          : message.receiverId.toString();

      const receiverSocketId = getReceiverSocketId(receiverIdStr);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("messageEdited", messageObj);
      }

      // Also notify sender
      const senderIdStr = userId.toString();
      const senderSocketId = getReceiverSocketId(senderIdStr);
      if (senderSocketId) {
        io.to(senderSocketId).emit("messageEdited", messageObj);
      }
    } else if (message.groupId) {
      // Group message - notify all group members
      const Group = (await import("../model/group.model.js")).default;
      const group = await Group.findById(message.groupId);
      if (group) {
        const allMembers = [group.admin, ...group.members];
        allMembers.forEach((memberId) => {
          io.emit("groupMessageEdited", {
            message: messageObj,
            groupId: message.groupId,
            memberId: memberId.toString(),
          });
        });
      }
    }

    res.status(200).json(message);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
};

export const deleteConversation = async (req, res) => {
  try {
    const { id: otherUserId } = req.params;
    const { deleteType = "forEveryone" } = req.body; // "forMe" or "forEveryone"
    const myId = req.user._id;

    // Normalize user IDs to strings for consistent comparison
    const myIdStr = myId.toString();
    const otherUserIdStr =
      typeof otherUserId === "object" && otherUserId._id
        ? otherUserId._id.toString()
        : otherUserId.toString();

    let result = { deletedCount: 0 };

    if (deleteType === "forEveryone") {
      // Delete all messages between the two users from database
      // Use mongoose.Types.ObjectId to ensure proper comparison
      const myObjectId = new mongoose.Types.ObjectId(myId);
      const otherUserObjectId = new mongoose.Types.ObjectId(otherUserIdStr);

      result = await Message.deleteMany({
        $or: [
          { senderId: myObjectId, receiverId: otherUserObjectId },
          { senderId: otherUserObjectId, receiverId: myObjectId },
        ],
      });

      // Emit socket event to notify both users with normalized IDs
      const otherUserSocketId = getReceiverSocketId(otherUserIdStr);
      if (otherUserSocketId) {
        io.to(otherUserSocketId).emit("conversationDeleted", {
          userId: myIdStr,
          deleteType: "forEveryone",
        });
      }

      const mySocketId = getReceiverSocketId(myIdStr);
      if (mySocketId) {
        io.to(mySocketId).emit("conversationDeleted", {
          userId: otherUserIdStr,
          deleteType: "forEveryone",
        });
      }
    } else {
      // Delete for me - just notify the user's client (no database changes)
      // The frontend will handle filtering this conversation from the user's view
      const mySocketId = getReceiverSocketId(myIdStr);
      if (mySocketId) {
        io.to(mySocketId).emit("conversationDeleted", {
          userId: otherUserIdStr,
          deleteType: "forMe",
        });
      }

      result.deletedCount = 0; // No messages deleted from database
    }

    res.status(200).json({
      message: "Conversation deleted successfully",
      deletedCount: result.deletedCount,
      deleteType,
    });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get messages by type (media, files, links, voice) for a conversation
export const getMessagesByType = async (req, res) => {
  try {
    const { id: userToChatId } = req.params;
    const { type } = req.query; // 'media', 'files', 'links', 'voice'
    const myId = req.user._id;

    if (!type || !["media", "files", "links", "voice"].includes(type)) {
      return res
        .status(400)
        .json({
          error: "Invalid type. Must be 'media', 'files', 'links', or 'voice'",
        });
    }

    const myObjectId = new mongoose.Types.ObjectId(myId);
    const otherUserObjectId = new mongoose.Types.ObjectId(userToChatId);

    // Build base query for conversation
    const baseQuery = {
      $or: [
        { senderId: myObjectId, receiverId: otherUserObjectId },
        { senderId: otherUserObjectId, receiverId: myObjectId },
      ],
    };

    // Add type-specific filter
    let typeQuery = {};
    switch (type) {
      case "media":
        typeQuery = { image: { $exists: true, $ne: null } };
        break;
      case "files":
        typeQuery = { file: { $exists: true, $ne: null } };
        break;
      case "links":
        typeQuery = { link: { $exists: true, $ne: null } };
        break;
      case "voice":
        typeQuery = { audio: { $exists: true, $ne: null } };
        break;
    }

    // Combine queries
    const query = { ...baseQuery, ...typeQuery };

    // Get messages sorted by newest first
    const messages = await Message.find(query)
      .populate("senderId", "fullname profilePic")
      .populate("receiverId", "fullname profilePic")
      .sort({ createdAt: -1 })
      .limit(100); // Limit to 100 most recent

    res.status(200).json({
      success: true,
      message: "Messages retrieved successfully",
      data: messages,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

export const pinMessage = async (req, res) => {
  try {
    const { id: messageId } = req.params;
    const userId = req.user._id;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    // Check if user has permission (must be sender or receiver for direct messages, or member for group)
    const isSender = message.senderId.toString() === userId.toString();
    const isReceiver =
      message.receiverId && message.receiverId.toString() === userId.toString();

    if (message.groupId) {
      const Group = (await import("../model/group.model.js")).default;
      const group = await Group.findById(message.groupId);
      if (!group) {
        return res.status(404).json({ error: "Group not found" });
      }
      const isMember =
        group.admin.toString() === userId.toString() ||
        group.members.some((m) => m.toString() === userId.toString());
      if (!isMember) {
        return res
          .status(403)
          .json({ error: "You are not a member of this group" });
      }
    } else {
      if (!isSender && !isReceiver) {
        return res
          .status(403)
          .json({ error: "You don't have permission to pin this message" });
      }
    }

    // Unpin any previously pinned message in this conversation
    if (message.groupId) {
      await Message.updateMany(
        { groupId: message.groupId, pinned: true, _id: { $ne: messageId } },
        { pinned: false, pinnedAt: null, pinnedBy: null }
      );
    } else {
      const conversationQuery = {
        $or: [
          { senderId: message.senderId, receiverId: message.receiverId },
          { senderId: message.receiverId, receiverId: message.senderId },
        ],
        pinned: true,
        _id: { $ne: messageId },
      };
      await Message.updateMany(conversationQuery, {
        pinned: false,
        pinnedAt: null,
        pinnedBy: null,
      });
    }

    // Pin the message
    message.pinned = true;
    message.pinnedAt = new Date();
    message.pinnedBy = userId;
    await message.save();

    await message.populate("senderId", "fullname profilePic");
    await message.populate("receiverId", "fullname profilePic");
    await message.populate("pinnedBy", "fullname profilePic");

    // Create a system message for pin status
    const pinnedByUser = await User.findById(userId);
    const pinnedByUserName = pinnedByUser?.fullname || "Someone";

    // Determine message type
    let messageType = "a message";
    if (message.image) {
      messageType = "a photo";
    } else if (message.audio) {
      messageType = "a voice message";
    } else if (message.file) {
      messageType = "a file";
    } else if (message.link) {
      messageType = "a link";
    }

    const pinStatusText = `📌 ${pinnedByUserName} pinned ${messageType}`;

    // Create system message
    const pinStatusMessage = new Message({
      senderId: userId,
      receiverId: message.groupId ? null : message.receiverId,
      groupId: message.groupId || null,
      text: pinStatusText,
    });

    await pinStatusMessage.save();
    await pinStatusMessage.populate("senderId", "fullname profilePic");
    if (pinStatusMessage.receiverId) {
      await pinStatusMessage.populate("receiverId", "fullname profilePic");
    }

    // Emit socket event for pinned message
    if (message.groupId) {
      const Group = (await import("../model/group.model.js")).default;
      const group = await Group.findById(message.groupId);
      if (group) {
        const allMembers = [group.admin, ...group.members];
        allMembers.forEach((memberId) => {
          io.emit("messagePinned", {
            message: message.toObject(),
            groupId: message.groupId,
            memberId: memberId.toString(),
          });
          // Emit pin status message
          io.emit("newMessage", pinStatusMessage.toObject());
        });
      }
    } else {
      const receiverSocketId = getReceiverSocketId(
        message.receiverId.toString()
      );
      const senderSocketId = getReceiverSocketId(message.senderId.toString());
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("messagePinned", message.toObject());
        io.to(receiverSocketId).emit("newMessage", pinStatusMessage.toObject());
      }
      if (senderSocketId) {
        io.to(senderSocketId).emit("messagePinned", message.toObject());
        io.to(senderSocketId).emit("newMessage", pinStatusMessage.toObject());
      }
    }

    res.status(200).json(message);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
};

export const unpinMessage = async (req, res) => {
  try {
    const { id: messageId } = req.params;
    const userId = req.user._id;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    if (!message.pinned) {
      return res.status(400).json({ error: "Message is not pinned" });
    }

    // Check permission (same as pin)
    const isSender = message.senderId.toString() === userId.toString();
    const isReceiver =
      message.receiverId && message.receiverId.toString() === userId.toString();

    if (message.groupId) {
      const Group = (await import("../model/group.model.js")).default;
      const group = await Group.findById(message.groupId);
      if (!group) {
        return res.status(404).json({ error: "Group not found" });
      }
      const isMember =
        group.admin.toString() === userId.toString() ||
        group.members.some((m) => m.toString() === userId.toString());
      if (!isMember) {
        return res
          .status(403)
          .json({ error: "You are not a member of this group" });
      }
    } else {
      if (!isSender && !isReceiver) {
        return res
          .status(403)
          .json({ error: "You don't have permission to unpin this message" });
      }
    }

    // Unpin the message
    message.pinned = false;
    message.pinnedAt = null;
    message.pinnedBy = null;
    await message.save();

    await message.populate("senderId", "fullname profilePic");
    await message.populate("receiverId", "fullname profilePic");

    // Emit socket event
    if (message.groupId) {
      const Group = (await import("../model/group.model.js")).default;
      const group = await Group.findById(message.groupId);
      if (group) {
        const allMembers = [group.admin, ...group.members];
        allMembers.forEach((memberId) => {
          io.emit("messageUnpinned", {
            message: message.toObject(),
            groupId: message.groupId,
            memberId: memberId.toString(),
          });
        });
      }
    } else {
      const receiverSocketId = getReceiverSocketId(
        message.receiverId.toString()
      );
      const senderSocketId = getReceiverSocketId(message.senderId.toString());
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("messageUnpinned", message.toObject());
      }
      if (senderSocketId) {
        io.to(senderSocketId).emit("messageUnpinned", message.toObject());
      }
    }

    res.status(200).json(message);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
};

export const addReaction = async (req, res) => {
  try {
    const { id: messageId } = req.params;
    const { emoji } = req.body;
    const userId = req.user._id;

    if (!emoji) {
      return res.status(400).json({ error: "Emoji is required" });
    }

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    // Check if user is part of the conversation/group
    const Group = (await import("../model/group.model.js")).default;
    const isParticipant =
      message.senderId.toString() === userId.toString() ||
      (message.receiverId &&
        message.receiverId.toString() === userId.toString()) ||
      (message.groupId &&
        (await Group.exists({
          _id: message.groupId,
          $or: [{ admin: userId }, { members: userId }],
        })));

    if (!isParticipant) {
      return res
        .status(403)
        .json({
          error:
            "You can only react to messages in conversations you are part of",
        });
    }

    // Remove existing reaction from this user if exists
    message.reactions = message.reactions.filter(
      (r) => r.userId.toString() !== userId.toString()
    );

    // Add new reaction
    message.reactions.push({
      userId: userId,
      emoji: emoji,
      createdAt: new Date(),
    });

    await message.save();
    await message.populate("reactions.userId", "fullname profilePic");
    await message.populate("senderId", "fullname profilePic");
    await message.populate("receiverId", "fullname profilePic");

    const messageObj = message.toObject ? message.toObject() : message;

    // Emit socket event for real-time update
    if (message.groupId) {
      const group = await Group.findById(message.groupId);
      if (group) {
        const allMembers = [group.admin, ...group.members];
        allMembers.forEach((memberId) => {
          io.emit("messageReactionAdded", {
            message: messageObj,
            groupId: message.groupId,
            memberId: memberId.toString(),
          });
        });
      }
    } else {
      const receiverSocketId = getReceiverSocketId(
        message.receiverId.toString()
      );
      const senderSocketId = getReceiverSocketId(message.senderId.toString());
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("messageReactionAdded", messageObj);
      }
      if (senderSocketId) {
        io.to(senderSocketId).emit("messageReactionAdded", messageObj);
      }
    }

    res.status(200).json(message);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
};

export const removeReaction = async (req, res) => {
  try {
    const { id: messageId } = req.params;
    const userId = req.user._id;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    // Remove user's reaction
    const initialLength = message.reactions.length;
    message.reactions = message.reactions.filter(
      (r) => r.userId.toString() !== userId.toString()
    );

    if (message.reactions.length === initialLength) {
      return res.status(400).json({ error: "Reaction not found" });
    }

    await message.save();
    await message.populate("reactions.userId", "fullname profilePic");
    await message.populate("senderId", "fullname profilePic");
    await message.populate("receiverId", "fullname profilePic");

    const messageObj = message.toObject ? message.toObject() : message;

    // Emit socket event for real-time update
    if (message.groupId) {
      const Group = (await import("../model/group.model.js")).default;
      const group = await Group.findById(message.groupId);
      if (group) {
        const allMembers = [group.admin, ...group.members];
        allMembers.forEach((memberId) => {
          io.emit("messageReactionRemoved", {
            message: messageObj,
            groupId: message.groupId,
            memberId: memberId.toString(),
          });
        });
      }
    } else {
      const receiverSocketId = getReceiverSocketId(
        message.receiverId.toString()
      );
      const senderSocketId = getReceiverSocketId(message.senderId.toString());
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("messageReactionRemoved", messageObj);
      }
      if (senderSocketId) {
        io.to(senderSocketId).emit("messageReactionRemoved", messageObj);
      }
    }

    res.status(200).json(message);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
};

// Delete individual media from message
export const deleteMessageMedia = async (req, res) => {
  try {
    const { id: messageId } = req.params;
    const { mediaType } = req.body; // 'image', 'video', 'audio', 'file'
    const userId = req.user._id;

    if (
      !mediaType ||
      !["image", "video", "audio", "file"].includes(mediaType)
    ) {
      return res
        .status(400)
        .json({
          error:
            "Invalid media type. Must be 'image', 'video', 'audio', or 'file'",
        });
    }

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    // Only sender can delete media
    if (message.senderId.toString() !== userId.toString()) {
      return res
        .status(403)
        .json({ error: "You can only delete media from your own messages" });
    }

    // Check if message has the media type
    if (!message[mediaType]) {
      return res
        .status(400)
        .json({ error: `Message does not have ${mediaType}` });
    }

    // Delete the media field
    message[mediaType] = null;
    if (mediaType === "file") {
      message.fileName = null;
      message.fileSize = null;
      message.fileType = null;
    }

    // If no content remains, delete the entire message
    const hasContent =
      message.text ||
      message.image ||
      message.video ||
      message.audio ||
      message.file ||
      message.link;
    if (!hasContent) {
      await Message.findByIdAndDelete(messageId);
      return res
        .status(200)
        .json({
          message: "Message deleted (no content remaining)",
          deleted: true,
        });
    }

    message.edited = true;
    message.editedAt = new Date();
    await message.save();
    await message.populate("senderId", "fullname profilePic");
    await message.populate("receiverId", "fullname profilePic");
    if (message.groupId) {
      await message.populate("seenBy.userId", "fullname profilePic");
    }

    const messageObj = message.toObject ? message.toObject() : message;

    // Emit socket event
    if (message.groupId) {
      const Group = (await import("../model/group.model.js")).default;
      const group = await Group.findById(message.groupId);
      if (group) {
        const allMembers = [group.admin, ...group.members];
        allMembers.forEach((memberId) => {
          io.emit("groupMessageEdited", {
            message: messageObj,
            groupId: message.groupId,
            memberId: memberId.toString(),
          });
        });
      }
    } else {
      const receiverSocketId = getReceiverSocketId(
        message.receiverId.toString()
      );
      const senderSocketId = getReceiverSocketId(message.senderId.toString());
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("messageEdited", messageObj);
      }
      if (senderSocketId) {
        io.to(senderSocketId).emit("messageEdited", messageObj);
      }
    }

    res
      .status(200)
      .json({ message: "Media deleted successfully", message: messageObj });
  } catch (error) {
    console.error("Error deleting message media:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Mark voice message as listened
export const markVoiceAsListened = async (req, res) => {
  try {
    const { id: messageId } = req.params;
    const userId = req.user._id;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    if (!message.audio) {
      return res.status(400).json({ error: "Message does not have audio" });
    }

    // Check if already listened
    const alreadyListened = message.listenedBy.some(
      (l) => l.userId.toString() === userId.toString()
    );

    if (!alreadyListened) {
      message.listenedBy.push({
        userId: userId,
        listenedAt: new Date(),
      });
      await message.save();
    }

    await message.populate("listenedBy.userId", "fullname profilePic");
    await message.populate("senderId", "fullname profilePic");
    if (message.groupId) {
      await message.populate("seenBy.userId", "fullname profilePic");
    }

    const messageObj = message.toObject ? message.toObject() : message;

    // Emit socket event
    if (message.groupId) {
      const Group = (await import("../model/group.model.js")).default;
      const group = await Group.findById(message.groupId);
      if (group) {
        const allMembers = [group.admin, ...group.members];
        allMembers.forEach((memberId) => {
          io.emit("voiceMessageListened", {
            message: messageObj,
            groupId: message.groupId,
            memberId: memberId.toString(),
          });
        });
      }
    } else {
      const receiverSocketId = getReceiverSocketId(
        message.receiverId.toString()
      );
      const senderSocketId = getReceiverSocketId(message.senderId.toString());
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("voiceMessageListened", messageObj);
      }
      if (senderSocketId) {
        io.to(senderSocketId).emit("voiceMessageListened", messageObj);
      }
    }

    res
      .status(200)
      .json({ message: "Voice marked as listened", message: messageObj });
  } catch (error) {
    console.error("Error marking voice as listened:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Save message
export const saveMessage = async (req, res) => {
  try {
    const { id: messageId } = req.params;
    const userId = req.user._id;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    // Check if already saved
    const alreadySaved = message.savedBy.some(
      (s) => s.userId.toString() === userId.toString()
    );

    if (alreadySaved) {
      return res.status(400).json({ error: "Message already saved" });
    }

    message.savedBy.push({
      userId: userId,
      savedAt: new Date(),
    });
    await message.save();

    res
      .status(200)
      .json({ message: "Message saved successfully", saved: true });
  } catch (error) {
    console.error("Error saving message:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Unsave message
export const unsaveMessage = async (req, res) => {
  try {
    const { id: messageId } = req.params;
    const userId = req.user._id;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    const initialLength = message.savedBy.length;
    message.savedBy = message.savedBy.filter(
      (s) => s.userId.toString() !== userId.toString()
    );

    if (message.savedBy.length === initialLength) {
      return res.status(400).json({ error: "Message not saved" });
    }

    await message.save();

    res
      .status(200)
      .json({ message: "Message unsaved successfully", saved: false });
  } catch (error) {
    console.error("Error unsaving message:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get saved messages
export const getSavedMessages = async (req, res) => {
  try {
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const messages = await Message.find({
      savedBy: { $elemMatch: { userId: userId } },
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("senderId", "fullname profilePic")
      .populate("receiverId", "fullname profilePic")
      .populate("groupId", "name profilePic")
      .populate("forwardedFrom.senderId", "fullname profilePic")
      .populate("reactions.userId", "fullname profilePic")
      .populate("seenBy.userId", "fullname profilePic")
      .populate("listenedBy.userId", "fullname profilePic");

    const total = await Message.countDocuments({
      savedBy: { $elemMatch: { userId: userId } },
    });

    res.status(200).json({
      messages,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error getting saved messages:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
