import User from "../model/user.model.js";
import Message from "../model/message.model.js";
import {
  getReceiverSocketId,
  getReceiverSocketIds,
  io,
  emitToUser,
} from "../lib/socket.js";
import { toPlainObject } from "../lib/utils.js";
import logger from "../lib/logger.js";
import { paginatedResponse } from "../lib/apiResponse.js";
import mongoose from "mongoose";
import { sendMobileMessageNotification } from "../services/mobilePushNotification.service.js";
import { sendMessageNotification } from "../services/pushNotification.service.js";

export const getLastMessages = async (req, res) => {
  try {
    // Safety check for authenticated user
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
        message: "User not authenticated",
      });
    }

    const myId = new mongoose.Types.ObjectId(req.user._id);

    // Get pagination parameters (Telegram-style: page-based)
    // ?page=1&limit=50 means first page with 50 items
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    // Optimized aggregation pipeline - single query to get all data
    const pipeline = [
      // Stage 1: Match messages where user is sender or receiver (exclude group messages)
      {
        $match: {
          $or: [{ senderId: myId }, { receiverId: myId }],
          groupId: { $exists: false }, // Only direct messages
          receiverId: { $ne: null }, // Exclude messages with null receiver
        },
      },
      // Stage 2: Determine the partner and sort by createdAt
      {
        $project: {
          partnerId: {
            $cond: [{ $eq: ["$senderId", myId] }, "$receiverId", "$senderId"],
          },
          createdAt: 1,
          message: "$$ROOT",
        },
      },
      // Stage 3: Sort by createdAt descending (most recent first)
      {
        $sort: { createdAt: -1 },
      },
      // Stage 4: Group by partnerId to get the most recent message for each partner
      {
        $group: {
          _id: "$partnerId",
          lastMessage: { $first: "$message" },
          lastMessageTime: { $first: "$createdAt" },
        },
      },
      // Stage 5: Sort by lastMessageTime descending
      {
        $sort: { lastMessageTime: -1 },
      },
      // Stage 6: Use facet to get total count and paginated results in parallel
      {
        $facet: {
          totalCount: [{ $count: "count" }],
          paginatedResults: [
            { $skip: skip },
            { $limit: limit },
            // Stage 7: Lookup sender user data
            {
              $lookup: {
                from: "users",
                localField: "lastMessage.senderId",
                foreignField: "_id",
                as: "senderData",
                pipeline: [
                  {
                    $project: {
                      _id: 1,
                      fullname: 1,
                      profilePic: 1,
                      email: 1,
                    },
                  },
                ],
              },
            },
            // Stage 8: Lookup receiver user data
            {
              $lookup: {
                from: "users",
                localField: "lastMessage.receiverId",
                foreignField: "_id",
                as: "receiverData",
                pipeline: [
                  {
                    $project: {
                      _id: 1,
                      fullname: 1,
                      profilePic: 1,
                      email: 1,
                    },
                  },
                ],
              },
            },
            // Stage 8.5: Lookup replyTo message data (for reply UI context)
            {
              $lookup: {
                from: "messages",
                localField: "lastMessage.replyTo",
                foreignField: "_id",
                as: "replyToData",
                pipeline: [
                  {
                    $project: {
                      _id: 1,
                      text: 1,
                      image: 1,
                      audio: 1,
                      video: 1,
                      file: 1,
                      senderId: 1,
                      receiverId: 1,
                      createdAt: 1,
                    },
                  },
                  // Populate senderId in replyTo message
                  {
                    $lookup: {
                      from: "users",
                      localField: "senderId",
                      foreignField: "_id",
                      as: "senderInfo",
                      pipeline: [
                        {
                          $project: {
                            _id: 1,
                            fullname: 1,
                            profilePic: 1,
                          },
                        },
                      ],
                    },
                  },
                  {
                    $addFields: {
                      senderId: { $arrayElemAt: ["$senderInfo", 0] },
                    },
                  },
                  {
                    $project: {
                      senderInfo: 0,
                    },
                  },
                ],
              },
            },
            // Stage 9: Reshape the document to match expected format
            {
              $project: {
                _id: "$lastMessage._id",
                senderId: {
                  $cond: [
                    { $gt: [{ $size: "$senderData" }, 0] },
                    { $arrayElemAt: ["$senderData", 0] },
                    { _id: "$lastMessage.senderId" },
                  ],
                },
                receiverId: {
                  $cond: [
                    { $gt: [{ $size: "$receiverData" }, 0] },
                    { $arrayElemAt: ["$receiverData", 0] },
                    { _id: "$lastMessage.receiverId" },
                  ],
                },
                text: "$lastMessage.text",
                image: "$lastMessage.image",
                audio: "$lastMessage.audio",
                video: "$lastMessage.video",
                file: "$lastMessage.file",
                fileName: "$lastMessage.fileName",
                fileSize: "$lastMessage.fileSize",
                fileType: "$lastMessage.fileType",
                sticker: "$lastMessage.sticker",
                link: "$lastMessage.link",
                linkPreview: "$lastMessage.linkPreview",
                seen: "$lastMessage.seen",
                seenAt: "$lastMessage.seenAt",
                seenBy: "$lastMessage.seenBy",
                edited: "$lastMessage.edited",
                editedAt: "$lastMessage.editedAt",
                pinned: "$lastMessage.pinned",
                pinnedAt: "$lastMessage.pinnedAt",
                pinnedBy: "$lastMessage.pinnedBy",
                reactions: "$lastMessage.reactions",
                replyTo: { $arrayElemAt: ["$replyToData", 0] }, // ✅ Add replyTo field
                forwardedFrom: "$lastMessage.forwardedFrom",
                listenedBy: "$lastMessage.listenedBy",
                savedBy: "$lastMessage.savedBy",
                createdAt: "$lastMessage.createdAt",
                updatedAt: "$lastMessage.updatedAt",
              },
            },
          ],
        },
      },
      // Stage 10: Unwind and format the result
      {
        $project: {
          total: { $ifNull: [{ $arrayElemAt: ["$totalCount.count", 0] }, 0] },
          messages: "$paginatedResults",
        },
      },
    ];

    const result = await Message.aggregate(pipeline, { allowDiskUse: true });

    const total = result[0]?.total || 0;
    const lastMessages = result[0]?.messages || [];
    const totalPages = Math.ceil(total / limit);
    const hasMore = page < totalPages;

    // Use standardized paginated response
    return paginatedResponse(
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
      "Messages retrieved successfully",
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
      message:
        process.env.NODE_ENV === "development" ? error.message : undefined,
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

    // ✅ PRODUCTION: Only get users who have conversations with the current user
    // This is much more efficient than loading all users - Telegram pattern
    const usersWithConversations = await Message.aggregate([
      {
        $match: {
          $or: [{ senderId: myId }, { receiverId: myId }],
        },
      },
      {
        $project: {
          otherUserId: {
            $cond: [{ $eq: ["$senderId", myId] }, "$receiverId", "$senderId"],
          },
        },
      },
      {
        $group: {
          _id: "$otherUserId",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user",
          pipeline: [
            {
              // ✅ BEST PRACTICE: Project only needed fields (reduce data transfer)
              $project: {
                _id: 1,
                fullname: 1,
                email: 1,
                profilePic: 1,
                createdAt: 1,
              },
            },
          ],
        },
      },
      {
        $unwind: "$user",
      },
      {
        $project: {
          _id: "$user._id",
          fullname: "$user.fullname",
          email: "$user.email",
          profilePic: "$user.profilePic",
        },
      },
      // Apply pagination
      { $skip: skip },
      { $limit: limit },
    ]);

    // Get total count
    const totalCount = await Message.aggregate(
      [
        {
          $match: {
            $or: [{ senderId: myId }, { receiverId: myId }],
          },
        },
        {
          $project: {
            otherUserId: {
              $cond: [{ $eq: ["$senderId", myId] }, "$receiverId", "$senderId"],
            },
          },
        },
        {
          $group: {
            _id: "$otherUserId",
          },
        },
        {
          $count: "total",
        },
      ],
      { allowDiskUse: true },
    );

    const total = totalCount[0]?.total || 0;
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
      "Users retrieved successfully",
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

// Get all users (for contacts page and search)
export const getAllUsers = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;

    // Get pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 200; // Default 200 users per page
    const skip = (page - 1) * limit;

    // Get search query parameter
    const searchQuery = req.query.search?.trim() || "";

    // Build query
    const query = { _id: { $ne: loggedInUserId } };

    // Add search filter if search query exists
    if (searchQuery) {
      query.$or = [
        { fullname: { $regex: searchQuery, $options: "i" } },
        { email: { $regex: searchQuery, $options: "i" } },
      ];
    }

    // Get users with search and pagination
    const users = await User.find(query)
      .select("fullname email profilePic")
      .sort({ fullname: 1 }) // Sort alphabetically
      .skip(skip)
      .limit(limit);

    // Get total count
    const total = await User.countDocuments(query);
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
      searchQuery
        ? `Found ${users.length} user${
            users.length !== 1 ? "s" : ""
          } matching "${searchQuery}"`
        : "All users retrieved successfully",
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
    const limit = parseInt(req.query.limit) || 50; // Default: last 50 messages
    const before = req.query.before; // Message ID to load messages before (for pagination)

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
    // Optimize: Use projection to only get createdAt - much faster than full document
    if (before) {
      try {
        const beforeObjectId = new mongoose.Types.ObjectId(before);
        // Use a projection query to only get createdAt - much faster than full document
        // Use lean() for even better performance
        const beforeMessage = await Message.findById(beforeObjectId)
          .select("createdAt")
          .lean()
          .exec();
        if (beforeMessage && beforeMessage.createdAt) {
          query.createdAt = { $lt: beforeMessage.createdAt };
        }
      } catch (e) {
        // Invalid before ID, ignore
      }
    }

    // Optimize: Use lean() for faster queries, populate reactions efficiently
    // Sort descending (newest first) and limit - uses compound index on (senderId/receiverId, createdAt)
    // Performance optimizations:
    // 1. Use lean() to skip Mongoose document overhead
    // 2. Limit + 1 to efficiently check hasMore without extra query
    // 3. Compound index on (senderId, receiverId, createdAt) ensures fast sorting
    // 4. Only select createdAt for before query to minimize data transfer
    const messages = await Message.find(query)
      .populate({
        path: "reactions.userId",
        select: "fullname profilePic",
      })
      .populate({
        path: "listenedBy.userId",
        select: "fullname profilePic",
      })
      .populate({
        path: "replyTo",
        select:
          "text image audio video file sticker senderId receiverId createdAt",
        populate: {
          path: "senderId",
          select: "fullname profilePic",
        },
      })
      .sort({ createdAt: -1 }) // Newest first (Telegram-style) - uses compound index
      .limit(limit + 1) // Fetch one extra to check if there are more
      .lean(); // Use lean() for read-only queries (faster - no Mongoose document overhead)

    // Check if there are more messages
    const hasMore = messages.length > limit;
    const messagesToReturn = hasMore ? messages.slice(0, limit) : messages;

    // Return messages in descending order (newest first)
    // Frontend ListView with reverse: true will display newest at bottom (Telegram-style)
    res.status(200).json({
      messages: messagesToReturn,
      hasMore: hasMore,
    });
  } catch (error) {
    logger.error("Error in getMessages", {
      requestId: req?.requestId,
      error: error.message,
      stack: error.stack,
      userId: req?.user?._id,
      userToChatId: req?.params?.id,
    });
    res.status(500).json({ error: "Internal server error" });
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
      (v) => v && (typeof v === "string" ? v.length > 0 : true),
    );
  return [value].filter(
    (v) => v && (typeof v === "string" ? v.length > 0 : true),
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
      audioDuration, // Duration in seconds for voice messages
      audioWaveform, // Waveform data (array of amplitude values 0-100)
      video,
      file,
      fileName,
      fileSize,
      fileType,
      sticker,
      forwardedFrom,
      replyTo, // Reply message ID
      idempotencyKey, // ✅ BEST PRACTICE: Telegram-style deduplication
    } = req.body;
    const { id: receiverId } = req.params;
    const senderId = req.user._id;

    // ✅ PRODUCTION: Message deduplication using idempotency key
    // Prevents duplicate messages from network retries or multiple submissions
    // Telegram uses this pattern to ensure exactly-once message delivery
    if (idempotencyKey) {
      // Check if message with this idempotency key already exists
      const existingMessage = await Message.findOne({
        senderId,
        receiverId,
        createdAt: {
          $gte: new Date(Date.now() - 60000), // Within last 60 seconds
        },
      })
        .sort({ createdAt: -1 })
        .limit(1)
        .lean();

      // If found, return existing message instead of creating duplicate
      if (existingMessage) {
        const textMatch = existingMessage.text === (text || "");
        const stickerMatch = existingMessage.sticker === (sticker || undefined);

        // Check if content is identical (basic deduplication)
        if (textMatch && stickerMatch) {
          logger.info("[DEDUP] Prevented duplicate message", {
            requestId: req?.requestId,
            senderId,
            receiverId,
            idempotencyKey,
            existingMessageId: existingMessage._id,
          });

          // Return existing message (already populated in full)
          return res.status(200).json(existingMessage);
        }
      }
    }

    // Normalize inputs to arrays (supports both single values and arrays for backward compatibility)
    const images = normalizeToArray(image);
    const audios = normalizeToArray(audio);
    const audioDurations = normalizeToArray(audioDuration)
      .map((d) => {
        // Ensure duration is a valid number (in seconds)
        const parsed = parseFloat(d);
        return isNaN(parsed) ? null : Math.round(parsed);
      })
      .filter((d) => d !== null);
    // Normalize audioWaveform - can be single array or array of arrays
    const audioWaveforms = audioWaveform
      ? Array.isArray(audioWaveform[0])
        ? audioWaveform
        : [audioWaveform]
      : [];
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
        imageUrls:
          images.length > 0
            ? images.map(
                (img, idx) =>
                  `[${idx}]: ${
                    typeof img === "string"
                      ? img.substring(0, 50) + "..."
                      : "non-string"
                  }`,
              )
            : [],
        videoUrls:
          videos.length > 0
            ? videos.map(
                (vid, idx) =>
                  `[${idx}]: ${
                    typeof vid === "string"
                      ? vid.substring(0, 50) + "..."
                      : "non-string"
                  }`,
              )
            : [],
        fileUrls:
          files.length > 0
            ? files.map(
                (f, idx) =>
                  `[${idx}]: ${
                    typeof f === "string"
                      ? f.substring(0, 50) + "..."
                      : "non-string"
                  }`,
              )
            : [],
      });
    }

    // Validate that at least one of text, image, audio, video, file, or sticker is provided
    const hasText = text && typeof text === "string" && text.trim().length > 0;
    const hasImage = images.length > 0;
    const hasAudio = audios.length > 0;
    const hasVideo = videos.length > 0;
    const hasFile = files.length > 0;
    const hasSticker =
      sticker && typeof sticker === "string" && sticker.trim().length > 0;

    if (
      !hasText &&
      !hasImage &&
      !hasAudio &&
      !hasVideo &&
      !hasFile &&
      !hasSticker
    ) {
      return res.status(400).json({
        error:
          "Message must contain either text, image, audio, video, file, or sticker",
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

    // ✅ PRODUCTION: Handle reply-to message validation
    let validatedReplyTo = null;
    if (replyTo) {
      // Validate replyTo is a valid ObjectId
      if (!mongoose.Types.ObjectId.isValid(replyTo)) {
        logger.warn("[SEND] Invalid replyTo message ID", {
          requestId: req?.requestId,
          replyTo,
          senderId,
        });
        return res.status(400).json({ error: "Invalid reply-to message ID" });
      }

      // Verify the message being replied to exists
      try {
        const replyToMessage = await Message.findById(replyTo)
          .select("_id senderId receiverId groupId createdAt")
          .lean();

        if (!replyToMessage) {
          logger.warn("[SEND] Reply-to message not found", {
            requestId: req?.requestId,
            replyTo,
          });
          return res.status(404).json({ error: "Reply-to message not found" });
        }

        // ✅ BEST PRACTICE: Verify user has access to the message being replied to
        // For direct messages: user must be sender or receiver
        // For group messages: user must be group member
        const userIdStr = senderId.toString();
        let hasAccess = false;

        if (replyToMessage.groupId) {
          // Group message - verify user is member
          const Group = (await import("../model/group.model.js")).default;
          const group = await Group.findById(replyToMessage.groupId)
            .select("admin admins members") // 🔥 FIX: Include admins in select
            .lean();
          if (group) {
            // 🔥 FIX: Include co-admins (admins array) in access check
            hasAccess =
              group.admin.toString() === userIdStr ||
              (group.admins &&
                group.admins.some((a) => a.toString() === userIdStr)) ||
              group.members.some((m) => m.toString() === userIdStr);
          }
        } else {
          // Direct message - verify user is sender or receiver
          hasAccess =
            replyToMessage.senderId.toString() === userIdStr ||
            replyToMessage.receiverId.toString() === userIdStr;
        }

        if (!hasAccess) {
          logger.warn("[SEND] User cannot reply to this message", {
            requestId: req?.requestId,
            replyTo,
            userId: userIdStr,
          });
          return res
            .status(403)
            .json({ error: "Cannot reply to this message" });
        }

        validatedReplyTo = replyTo;
      } catch (error) {
        logger.error("[SEND] Error validating reply-to message", {
          error: error.message,
          replyTo,
        });
        return res
          .status(500)
          .json({ error: "Failed to validate reply-to message" });
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
      audioDuration: audioDurations.length > 0 ? audioDurations : undefined,
      audioWaveform: audioWaveforms.length > 0 ? audioWaveforms : undefined,
      video: videoUrls.length > 0 ? videoUrls : undefined,
      file: fileUrls.length > 0 ? fileUrls : undefined,
      fileName: fileNames.length > 0 ? fileNames : undefined,
      fileSize: fileSizes.length > 0 ? fileSizes : undefined,
      fileType: fileTypes.length > 0 ? fileTypes : undefined,
      sticker: sticker || undefined,
      link: linkUrl,
      linkPreview: linkPreview,
      forwardedFrom: forwardedFromData,
      replyTo: validatedReplyTo || undefined, // ✅ Use validated replyTo
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
        savedImageCount: Array.isArray(newMessage.image)
          ? newMessage.image.length
          : newMessage.image
            ? 1
            : 0,
        savedVideoCount: Array.isArray(newMessage.video)
          ? newMessage.video.length
          : newMessage.video
            ? 1
            : 0,
        savedFileCount: Array.isArray(newMessage.file)
          ? newMessage.file.length
          : newMessage.file
            ? 1
            : 0,
      });
    }
    await newMessage.populate("senderId", "fullname profilePic");
    await newMessage.populate("receiverId", "fullname profilePic");

    // Populate replyTo if present (for reply messages)
    if (newMessage.replyTo) {
      await newMessage.populate({
        path: "replyTo",
        select:
          "text image audio video file sticker senderId receiverId createdAt",
        populate: {
          path: "senderId",
          select: "fullname profilePic",
        },
      });
    }

    // CRITICAL: Add delay to ensure MongoDB write is fully committed and indexed
    // This prevents race condition where Socket.IO triggers client GET before write is visible
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Convert Mongoose document to plain object for socket emit
    const messageObj = newMessage.toObject ? newMessage.toObject() : newMessage;

    // ✅ CRITICAL FIX: Emit to BOTH sender and receiver BEFORE push notification
    // The sender MUST receive "newMessage" before any "messageSeenUpdate" event.
    // Previously, push notification handling (await) delayed sender emit by 100-2000ms,
    // allowing the receiver to emit "messageSeen" → backend emits "messageSeenUpdate"
    // to sender BEFORE the sender received "newMessage". This race condition caused
    // the sender's read receipt to be permanently stuck on single-check (✓).
    emitToUser(receiverId, "newMessage", messageObj);
    emitToUser(senderId.toString(), "newMessage", messageObj);

    // ✅ BEST PRACTICE: Fire-and-forget push notification (non-blocking)
    // Push notifications should NOT delay the Socket.IO event flow
    const isSavedMessage = senderId.toString() === receiverId.toString();

    if (!isSavedMessage) {
      // Fire-and-forget: Don't await push notification
      (async () => {
        try {
          const mobilePushResult = await sendMobileMessageNotification(
            receiverId,
            messageObj,
          );

          if (mobilePushResult.success) {
            logger.info("✅ [Push] Mobile notification sent", {
              requestId: req.requestId,
              receiverId,
              messageId: newMessage._id,
              sent: mobilePushResult.sent,
              failed: mobilePushResult.failed,
              total: mobilePushResult.total,
            });
          } else {
            logger.debug(
              `⚠️ [Push] Mobile push failed: ${mobilePushResult.error}, trying web push`,
              {
                requestId: req.requestId,
                receiverId,
              },
            );

            const pushResult = await sendMessageNotification(
              receiverId,
              messageObj,
            );

            if (pushResult.success) {
              logger.info("✅ [Push] Web notification sent", {
                requestId: req.requestId,
                receiverId,
                messageId: newMessage._id,
                sent: pushResult.sent,
                failed: pushResult.failed,
                total: pushResult.total,
              });
            }
          }
        } catch (pushError) {
          logger.error("❌ [Push] Failed to send push notification:", {
            error: pushError.message,
            stack: pushError.stack,
            receiverId,
            messageId: newMessage._id,
          });
        }
      })();
    }

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
  const startTime = Date.now();
  try {
    const { id: messageId } = req.params;
    const { text, editTimestamp } = req.body;
    const userId = req.user._id;

    // ✅ PRODUCTION: Validate inputs
    if (!messageId) {
      return res.status(400).json({ error: "Message ID is required" });
    }

    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ error: "Invalid message ID format" });
    }

    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "Message text is required" });
    }

    // ✅ PRODUCTION: Text length validation (Telegram allows 4096 chars)
    if (text.trim().length > 4096) {
      return res
        .status(400)
        .json({ error: "Message text too long (max 4096 characters)" });
    }

    const message = await Message.findById(messageId);

    if (!message) {
      logger.warn("[EDIT] Message not found", { messageId, userId });
      return res.status(404).json({ error: "Message not found" });
    }

    // ✅ PRODUCTION: Authorization check
    if (message.senderId.toString() !== userId.toString()) {
      logger.warn("[EDIT] Unauthorized edit attempt", {
        messageId,
        userId,
        actualSenderId: message.senderId.toString(),
      });
      return res
        .status(403)
        .json({ error: "You can only edit your own messages" });
    }

    // ✅ PRODUCTION: Idempotency check - don't re-edit if text unchanged
    if (message.text === text.trim()) {
      logger.info("[EDIT] No changes detected", { messageId });
      // Return existing message without updating
      await message.populate("senderId", "fullname profilePic email");
      await message.populate("receiverId", "fullname profilePic email");
      if (message.replyTo) {
        await message.populate({
          path: "replyTo",
          select:
            "text image audio video file sticker senderId receiverId createdAt",
          populate: { path: "senderId", select: "fullname profilePic email" },
        });
      }
      return res.status(200).json(message.toObject());
    }

    // ✅ PRODUCTION: Check for duplicate edit timestamp (prevent race conditions)
    if (editTimestamp && message.editedAt) {
      const lastEditTime = new Date(message.editedAt).getTime();
      if (editTimestamp <= lastEditTime) {
        logger.warn("[EDIT] Stale edit detected", {
          messageId,
          clientTimestamp: editTimestamp,
          lastEditTime,
        });
        return res.status(409).json({
          error: "Message was edited more recently",
          currentVersion: message.toObject(),
        });
      }
    }

    // 🔥 FIXED: Allow editing text/caption for media messages
    // Users can add or edit captions for images, videos, audio, and files
    // This matches Telegram/WhatsApp behavior where captions are editable
    // console.log(`📝 [EDIT] Editing message ${messageId}:`);
    // console.log(`   ├─ Has image: ${!!message.image}`);
    // console.log(`   ├─ Has video: ${!!message.video}`);
    // console.log(`   ├─ Has audio: ${!!message.audio}`);
    // console.log(`   ├─ Has file: ${!!message.file}`);
    // console.log(`   ├─ Old text: "${message.text || "<no caption>"}"`);
    // console.log(`   └─ New text: "${text.trim()}"`);

    // ✅ PRODUCTION: Update message with timestamp tracking
    const oldText = message.text;
    message.text = text.trim();
    message.edited = true;
    message.editedAt = new Date();
    await message.save();

    logger.info("[EDIT] Message updated successfully", {
      requestId: req?.requestId,
      messageId,
      userId,
      duration: Date.now() - startTime + "ms",
    });

    // ✅ CRITICAL: MongoDB write delay (ensure indexes updated)
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Populate message with user data before emitting
    await message.populate("senderId", "fullname profilePic email");
    await message.populate("receiverId", "fullname profilePic email");

    // 🔥 CRITICAL: Populate replyTo to preserve reply UI in edited messages
    if (message.replyTo) {
      await message.populate({
        path: "replyTo",
        select:
          "text image audio video file sticker senderId receiverId createdAt",
        populate: {
          path: "senderId",
          select: "fullname profilePic email",
        },
      });
      // console.log(`   ├─ Populated replyTo: ${message.replyTo._id}`); // [DEBUG - Removed for production]
    }

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

      const senderIdStr = userId.toString();

      // ✅ BUG FIX: Use emitToUser for multi-device support
      emitToUser(receiverIdStr, "messageEdited", messageObj);
      emitToUser(senderIdStr, "messageEdited", messageObj);
    } else if (message.groupId) {
      // Group message - notify all group members
      const groupIdStr = message.groupId.toString();
      const senderIdStr = userId.toString();

      // console.log("\n══════════════════════════════════════");
      // console.log("✏️ [EDIT] Group message edit");
      // console.log("══════════════════════════════════════");
      // console.log("📝 Message details:");
      // console.log("   ├─ messageId:", messageId);
      // console.log("   ├─ senderId (editor):", senderIdStr);
      // console.log("   ├─ groupId:", groupIdStr);
      // console.log(
      //   "   └─ new text:",
      //   text.trim().substring(0, 50) + (text.trim().length > 50 ? "..." : "")
      // );

      const Group = (await import("../model/group.model.js")).default;
      const group = await Group.findById(message.groupId);

      if (group) {
        // 🔥 FIX: Include co-admins (admins array)
        const allMembers = [
          group.admin,
          ...(group.admins || []),
          ...group.members,
        ];
        // console.log( // [DEBUG - Removed for production]
        // "\n📤 [SOCKET] Emitting groupMessageEdited to ALL group members"
        // );
        // console.log("   └─ Total members:", allMembers.length); // [DEBUG - Removed for production]

        // ✅ BUG FIX: Use emitToUser for multi-device support
        allMembers.forEach((memberId) => {
          emitToUser(memberId.toString(), "groupMessageEdited", messageObj);
        });

        // console.log(
        //   "\n✅ [EDIT] Group message edited for ALL members in real-time"
        // );
        // console.log("   ├─ Online members notified:", onlineCount, "✅");
        // console.log(
        //   "   ├─ Offline members:",
        //   offlineCount,
        //   "(will see on reconnect)"
        // );
        // console.log("   ├─ Editor sees update: YES ✅");
        // console.log("   ├─ All members see update: YES ✅");
        // console.log("   └─ No refresh needed: 0ms latency ⚡");
        // console.log("══════════════════════════════════════\n");
      } else {
        // console.log("❌ [EDIT] Group not found:", groupIdStr); // [DEBUG - Removed for production]
        // console.log("══════════════════════════════════════\n"); // [DEBUG - Removed for production]
      }
    }

    // Return populated message for response
    // 🔥 CRITICAL: Build populate query conditionally based on what fields exist
    let query = Message.findById(message._id)
      .populate("senderId", "fullname profilePic email")
      .populate("receiverId", "fullname profilePic email");

    // Only populate replyTo if the message actually has one (not null/undefined)
    if (message.replyTo) {
      query = query.populate({
        path: "replyTo",
        populate: {
          path: "senderId",
          select: "fullname profilePic email",
        },
      });
      // console.log(`   ├─ Including replyTo in response`); // [DEBUG - Removed for production]
    } else {
      // console.log(`   ├─ No replyTo to populate (standalone message)`); // [DEBUG - Removed for production]
    }

    const populatedMessage = await query.exec();

    res.status(200).json(populatedMessage);
  } catch (error) {
    logger.error("[EDIT] Error in editMessage", {
      requestId: req?.requestId,
      error: error.message,
      stack: error.stack,
      messageId: req.params.id,
      userId: req.user?._id,
    });
    res.status(500).json({ error: "Internal server error" });
  }
};

export const deleteMessage = async (req, res) => {
  const startTime = Date.now();
  try {
    const { id: messageId } = req.params;
    const { deleteType = "forEveryone" } = req.body; // "forMe" or "forEveryone"
    const userId = req.user._id;

    // ✅ PRODUCTION: Validate inputs
    if (!messageId) {
      return res.status(400).json({ error: "Message ID is required" });
    }

    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ error: "Invalid message ID format" });
    }

    if (deleteType && !["forMe", "forEveryone"].includes(deleteType)) {
      return res.status(400).json({ error: "Invalid delete type" });
    }

    const message = await Message.findById(messageId);

    if (!message) {
      logger.warn("[DELETE] Message not found", { messageId, userId });
      return res.status(404).json({ error: "Message not found" });
    }

    if (deleteType === "forEveryone") {
      // ✅ PRODUCTION: Authorization check
      if (message.senderId.toString() !== userId.toString()) {
        logger.warn("[DELETE] Unauthorized delete attempt", {
          messageId,
          userId,
          actualSenderId: message.senderId.toString(),
        });
        return res.status(403).json({
          error: "You can only delete your own messages for everyone",
        });
      }

      // ✅ PRODUCTION: Save message info before deletion
      const deletedMessageReceiverId = message.receiverId;
      const deletedMessageSenderId = message.senderId;
      const deletedMessageGroupId = message.groupId;

      // ✅ PRODUCTION: Delete the message completely
      try {
        await Message.findByIdAndDelete(messageId);
        logger.info("[DELETE] Message deleted from database", {
          requestId: req?.requestId,
          messageId,
          userId,
          deleteType,
          duration: Date.now() - startTime + "ms",
        });
      } catch (deleteError) {
        logger.error("[DELETE] Failed to delete message", {
          error: deleteError.message,
          messageId,
        });
        return res.status(500).json({ error: "Failed to delete message" });
      }

      // ✅ CRITICAL: MongoDB write delay (ensure deletion propagated)
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Find the new last message for this conversation (if any messages remain)
      let newLastMessage = null;
      if (deletedMessageReceiverId) {
        // Use ObjectId for proper database comparison
        const senderObjectId = new mongoose.Types.ObjectId(
          deletedMessageSenderId,
        );
        const receiverObjectId = new mongoose.Types.ObjectId(
          deletedMessageReceiverId,
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

        // console.log("\n════════════════════════════════════════");
        // console.log("🗑️ [DELETE] Personal message deletion");
        // console.log("════════════════════════════════════════");
        // console.log("📝 Message details:");
        // console.log("   ├─ messageId:", messageIdStr);
        // console.log("   ├─ senderId (owner):", userId.toString());
        // console.log("   └─ receiverId:", receiverIdStr);
        // console.log("\n📤 [SOCKET] Emitting messageDeleted to BOTH users");

        // ✅ BUG FIX: Use emitToUser for multi-device support
        const deletePayload = {
          messageId: messageIdStr,
          senderId: userId.toString(),
          receiverId: receiverIdStr,
          deleteType: "forEveryone",
          newLastMessage: newLastMessage,
          conversationDeleted: !newLastMessage,
        };
        emitToUser(receiverIdStr, "messageDeleted", deletePayload);

        // Also notify sender
        const senderIdStr = userId.toString();
        emitToUser(senderIdStr, "messageDeleted", {
          ...deletePayload,
          senderId: senderIdStr,
        });
      } else if (message.groupId) {
        // Group message - notify all group members
        const messageIdStr = messageId.toString();
        const groupIdStr = message.groupId.toString();
        const senderIdStr = userId.toString();

        // console.log("\n════════════════════════════════════════");
        // console.log("🗑️ [DELETE] Group message deletion");
        // console.log("════════════════════════════════════════");
        // console.log("📝 Message details:");
        // console.log("   ├─ messageId:", messageIdStr);
        // console.log("   ├─ senderId (owner):", senderIdStr);
        // console.log("   └─ groupId:", groupIdStr);

        const Group = (await import("../model/group.model.js")).default;
        const group = await Group.findById(message.groupId);

        if (group) {
          // 🔥 FIX: Include co-admins (admins array)
          const allMembers = [
            group.admin,
            ...(group.admins || []),
            ...group.members,
          ];
          // console.log(
          //   "\n📤 [SOCKET] Emitting groupMessageDeleted to ALL group members"
          // );
          // console.log("   └─ Total members:", allMembers.length);

          let onlineCount = 0;
          let offlineCount = 0;

          // ✅ BUG FIX: Use emitToUser for multi-device support
          const deleteGroupPayload = {
            messageId: messageIdStr,
            senderId: senderIdStr,
            groupId: groupIdStr,
            deleteType: "forEveryone",
          };
          allMembers.forEach((memberId) => {
            emitToUser(
              memberId.toString(),
              "groupMessageDeleted",
              deleteGroupPayload,
            );
          });

          // console.log(
          //   "\n✅ [DELETE] Group message deleted for ALL members in real-time"
          // );
          // console.log("   ├─ Online members notified:", onlineCount, "✅");
          // console.log(
          //   "   ├─ Offline members:",
          //   offlineCount,
          //   "(will see on reconnect)"
          // );
          // console.log("   ├─ Owner sees deletion: YES ✅");
          // console.log("   ├─ All members see deletion: YES ✅");
          // console.log("   └─ No refresh needed: 0ms latency ⚡");
          // console.log("════════════════════════════════════════\n");
        } else {
          // console.log("❌ [DELETE] Group not found:", groupIdStr); // [DEBUG - Removed for production]
          // console.log("════════════════════════════════════════\n"); // [DEBUG - Removed for production]
        }
      }
    } else {
      // Delete for me - just notify the user's client
      const messageIdStr = messageId.toString();
      // ✅ BUG FIX: Use emitToUser for multi-device support
      if (message.receiverId) {
        emitToUser(userId, "messageDeleted", {
          messageId: messageIdStr,
          deleteType: "forMe",
        });
      } else if (message.groupId) {
        emitToUser(userId, "groupMessageDeleted", {
          messageId: messageIdStr,
          groupId: message.groupId,
          memberId: userId.toString(),
          deleteType: "forMe",
        });
      }
    }

    res
      .status(200)
      .json({ message: "Message deleted successfully", deleteType });
  } catch (error) {
    logger.error("[DELETE] Error in deleteMessage", {
      requestId: req?.requestId,
      error: error.message,
      stack: error.stack,
      messageId: req.params.id,
      userId: req.user?._id,
    });
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

      const senderIdStr = userId.toString();

      // ✅ BUG FIX: Use emitToUser for multi-device support
      emitToUser(receiverIdStr, "messageEdited", messageObj);
      emitToUser(senderIdStr, "messageEdited", messageObj);
    }
    // Note: Group message edit handled above with comprehensive logging

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
      // ✅ BUG FIX: Use emitToUser for multi-device support
      emitToUser(otherUserIdStr, "conversationDeleted", {
        userId: myIdStr,
        deleteType: "forEveryone",
      });
      emitToUser(myIdStr, "conversationDeleted", {
        userId: otherUserIdStr,
        deleteType: "forEveryone",
      });
    } else {
      // Delete for me - just notify the user's client (no database changes)
      // ✅ BUG FIX: Use emitToUser for multi-device support
      emitToUser(myIdStr, "conversationDeleted", {
        userId: otherUserIdStr,
        deleteType: "forMe",
      });

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
      return res.status(400).json({
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
      .populate("listenedBy.userId", "fullname profilePic") // Populate voice listened users
      .populate("reactions.userId", "fullname profilePic") // Populate reaction users
      .sort({ createdAt: -1 })
      .limit(100) // Limit to 100 most recent
      .lean(); // Use lean() for read-only queries (faster)

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
      // 🔥 FIX: Include co-admins (admins array) in member check
      const isMember =
        group.admin.toString() === userId.toString() ||
        (group.admins &&
          group.admins.some((a) => a.toString() === userId.toString())) ||
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

    // NOTE: We now support multiple pinned messages per conversation (like Telegram)
    // The old logic that unpinned other messages has been removed to allow
    // users to pin multiple important messages that can be navigated through

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
    // ✅ CRITICAL FIX: For personal chats, receiverId must be the OTHER participant.
    // If the pinner IS the original receiver, we need to send TO the original sender.
    // Without this, both senderId and receiverId would be the same user when the
    // receiver pins → _isRelevantMessage filters it out → notification never shows.
    const pinNotificationReceiverId = message.groupId
      ? null
      : message.senderId.toString() === userId.toString()
        ? message.receiverId // Pinner is sender → send to receiver
        : message.senderId; // Pinner is receiver → send to sender

    const pinStatusMessage = new Message({
      senderId: userId,
      receiverId: pinNotificationReceiverId,
      groupId: message.groupId || null,
      text: pinStatusText,
      replyTo: messageId, // Reference to the exact pinned message for tap-to-scroll
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
        // 🔥 FIX: Include co-admins (admins array)
        const allMembers = [
          group.admin,
          ...(group.admins || []),
          ...group.members,
        ];
        // console.log("\n════════════════════════════════════════"); // [DEBUG - Removed for production]
        // console.log("📌 [PIN] Group message pinned"); // [DEBUG - Removed for production]
        // console.log("════════════════════════════════════════"); // [DEBUG - Removed for production]
        // ✅ BUG FIX: Use emitToUser for multi-device support
        // ✅ CRITICAL FIX: Emit FLAT message payload (same as personal chat).
        // Previously sent WRAPPED { message: {...}, groupId, memberId } which
        // caused Flutter to read eventData['_id'] as null → no UI update.
        const msgObj = message.toObject();
        const pinMsgPayload = pinStatusMessage.toObject();
        allMembers.forEach((memberId) => {
          const mId = memberId.toString();
          emitToUser(mId, "messagePinned", msgObj);
          emitToUser(mId, "newMessage", pinMsgPayload);
        });
        // console.log("✅ Notified", notifiedCount, "members ⚡"); // [DEBUG - Removed for production]
        // console.log("════════════════════════════════════════\n"); // [DEBUG - Removed for production]
      }
    } else {
      // ✅ BUG FIX: Use emitToUser for multi-device support
      // ✅ SAFETY: Extract _id from populated objects to avoid [object Object]
      const msgObj = message.toObject();
      const pinMsgObj = pinStatusMessage.toObject();
      const receiverIdStr = message.receiverId?._id
        ? message.receiverId._id.toString()
        : message.receiverId.toString();
      const senderIdStr = message.senderId?._id
        ? message.senderId._id.toString()
        : message.senderId.toString();
      emitToUser(receiverIdStr, "messagePinned", msgObj);
      emitToUser(receiverIdStr, "newMessage", pinMsgObj);
      emitToUser(senderIdStr, "messagePinned", msgObj);
      emitToUser(senderIdStr, "newMessage", pinMsgObj);
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
      // 🔥 FIX: Include co-admins (admins array) in member check
      const isMember =
        group.admin.toString() === userId.toString() ||
        (group.admins &&
          group.admins.some((a) => a.toString() === userId.toString())) ||
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

    // 📌 Delete pin notification message(s) from the database.
    // These are the system messages ("📌 User pinned a photo") created by pinMessage.
    // Uses deleteMany to clean up duplicates from previous pin/unpin cycles.
    // The IDs are included in the socket payload so clients can remove them from UI.
    const pinNotifications = await Message.find({
      replyTo: messageId,
      text: { $regex: /^📌/ },
    })
      .select("_id")
      .lean();
    const pinNotificationIds = pinNotifications.map((n) => n._id.toString());
    if (pinNotificationIds.length > 0) {
      await Message.deleteMany({
        _id: { $in: pinNotifications.map((n) => n._id) },
      });
    }

    await message.populate("senderId", "fullname profilePic");
    await message.populate("receiverId", "fullname profilePic");

    // Emit socket event (include pinNotificationIds so clients remove them from UI)
    if (message.groupId) {
      const Group = (await import("../model/group.model.js")).default;
      const group = await Group.findById(message.groupId);
      if (group) {
        // 🔥 FIX: Include co-admins (admins array)
        const allMembers = [
          group.admin,
          ...(group.admins || []),
          ...group.members,
        ];
        const messageObj = { ...message.toObject(), pinNotificationIds };

        // console.log("\n══════════════════════════════════════"); // [DEBUG - Removed for production]
        // console.log("📌❌ [UNPIN] Group message unpin"); // [DEBUG - Removed for production]
        // console.log("══════════════════════════════════════"); // [DEBUG - Removed for production]
        // console.log("📝 Message details:"); // [DEBUG - Removed for production]
        // console.log("   ├─ messageId:", message._id.toString()); // [DEBUG - Removed for production]
        // console.log("   ├─ senderId:", message.senderId.toString()); // [DEBUG - Removed for production]
        // console.log("   └─ groupId:", message.groupId.toString()); // [DEBUG - Removed for production]
        // console.log("\n📤 [SOCKET] Emitting to members"); // [DEBUG - Removed for production]

        // ✅ BUG FIX: Use emitToUser for multi-device support
        allMembers.forEach((memberId) => {
          emitToUser(memberId.toString(), "messageUnpinned", messageObj);
        });

        // console.log("✅ Notified", onlineCount, "online members ⚡"); // [DEBUG - Removed for production]
        // console.log("⚫ Skipped", offlineCount, "offline members"); // [DEBUG - Removed for production]
        // console.log("══════════════════════════════════════\n"); // [DEBUG - Removed for production]
      }
    } else {
      // ✅ BUG FIX: Use emitToUser for multi-device support
      // ✅ SAFETY: Extract _id from populated objects to avoid [object Object]
      const msgObj = { ...message.toObject(), pinNotificationIds };
      const receiverIdStr = message.receiverId?._id
        ? message.receiverId._id.toString()
        : message.receiverId.toString();
      const senderIdStr = message.senderId?._id
        ? message.senderId._id.toString()
        : message.senderId.toString();
      emitToUser(receiverIdStr, "messageUnpinned", msgObj);
      emitToUser(senderIdStr, "messageUnpinned", msgObj);
    }

    res.status(200).json(message);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Get all pinned messages for a conversation (personal or group)
 * Supports multiple pinned messages per conversation (Telegram-style)
 * @route GET /api/messages/pinned/:id
 * @param {string} id - User ID (for personal chat) or Group ID
 * @query {string} type - 'user' for personal chat, 'group' for group chat
 */
export const getPinnedMessages = async (req, res) => {
  try {
    const { id: targetId } = req.params;
    const { type = "user" } = req.query; // 'user' or 'group'
    const myId = req.user._id;

    let query;

    if (type === "group") {
      // Verify user is member of the group
      const Group = (await import("../model/group.model.js")).default;
      const group = await Group.findById(targetId);
      if (!group) {
        return res.status(404).json({ error: "Group not found" });
      }

      // 🔥 FIX: Include co-admins (admins array) in member check
      const isMember =
        group.admin.toString() === myId.toString() ||
        (group.admins &&
          group.admins.some((a) => a.toString() === myId.toString())) ||
        group.members.some((m) => m.toString() === myId.toString());
      if (!isMember) {
        return res
          .status(403)
          .json({ error: "You are not a member of this group" });
      }

      query = {
        groupId: new mongoose.Types.ObjectId(targetId),
        pinned: true,
      };
    } else {
      // Personal chat - both directions
      const myObjectId = new mongoose.Types.ObjectId(myId);
      const otherUserObjectId = new mongoose.Types.ObjectId(targetId);

      query = {
        $or: [
          { senderId: myObjectId, receiverId: otherUserObjectId },
          { senderId: otherUserObjectId, receiverId: myObjectId },
        ],
        pinned: true,
      };
    }

    // Fetch all pinned messages, sorted by pinnedAt (most recent first)
    const pinnedMessages = await Message.find(query)
      .populate("senderId", "fullname profilePic")
      .populate("receiverId", "fullname profilePic")
      .populate("pinnedBy", "fullname profilePic")
      .populate({
        path: "replyTo",
        select:
          "text image audio video file sticker senderId receiverId createdAt",
        populate: {
          path: "senderId",
          select: "fullname profilePic",
        },
      })
      .sort({ pinnedAt: -1 }) // Most recently pinned first
      .lean();

    res.status(200).json({
      pinnedMessages: pinnedMessages,
      count: pinnedMessages.length,
    });
  } catch (error) {
    console.error("[getPinnedMessages] Error:", error);
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

    const isSender = message.senderId.toString() === userId.toString();
    const isReceiver =
      message.receiverId && message.receiverId.toString() === userId.toString();
    let isGroupMember = false;

    if (message.groupId) {
      // Check admin, admins (co-admins), AND members arrays
      isGroupMember = await Group.exists({
        _id: message.groupId,
        $or: [{ admin: userId }, { admins: userId }, { members: userId }],
      });
    }

    const isParticipant = isSender || isReceiver || isGroupMember;

    if (!isParticipant) {
      return res.status(403).json({
        error:
          "You can only react to messages in conversations you are part of",
      });
    }

    // ✅ FIX: If user reacts, they must have seen the message - add to seenBy if not already
    // Skip if user is the sender (sender doesn't "see" their own message)
    const messageSenderId = message.senderId._id
      ? message.senderId._id.toString()
      : message.senderId.toString();
    const userIdStr = userId.toString();

    if (messageSenderId !== userIdStr && message.groupId) {
      const alreadySeen = message.seenBy.some((s) => {
        if (!s || !s.userId) return false;
        const seenUserId = s.userId._id
          ? s.userId._id.toString()
          : s.userId.toString();
        return seenUserId === userIdStr;
      });

      if (!alreadySeen) {
        message.seenBy.push({
          userId: userId,
          seenAt: new Date(),
        });
      }
    }

    // Remove existing reaction from this user if exists
    message.reactions = message.reactions.filter(
      (r) => r.userId.toString() !== userId.toString(),
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
    // ✅ FIX: Also populate seenBy since we may have added user to it
    if (message.groupId) {
      await message.populate("seenBy.userId", "fullname profilePic");
    }

    const messageObj = message.toObject ? message.toObject() : message;

    // Emit socket event for real-time update
    if (message.groupId) {
      // Group message - targeted emission to all members (admin, co-admins, members)
      const group = await Group.findById(message.groupId);
      if (group) {
        // Include admin, co-admins (admins array), and members
        const allMembers = [
          group.admin,
          ...(group.admins || []),
          ...group.members,
        ];
        // console.log("\n════════════════════════════════════════");
        // console.log("😍 [REACTION] Group reaction added");
        // console.log("════════════════════════════════════════");
        // console.log("📝 Details:");
        // console.log("   ├─ messageId:", messageId);
        // console.log("   ├─ userId:", userId.toString());
        // console.log("   ├─ emoji:", emoji);
        // console.log("   └─ groupId:", message.groupId.toString());

        // ✅ BUG FIX: Use emitToUser for multi-device support + correct group event name
        allMembers.forEach((memberId) => {
          emitToUser(
            memberId.toString(),
            "groupMessageReactionAdded",
            messageObj,
          );
        });

        // console.log( // [DEBUG - Removed for production]
        // "✅ [REACTION] Emitted to",
        // onlineCount,
        // "online members ⚡"
        // );
        // console.log("════════════════════════════════════════\n"); // [DEBUG - Removed for production]
      }
    } else {
      // Personal message - emit to sender and receiver
      // console.log("\n════════════════════════════════════════");
      // console.log("😍 [REACTION] Personal chat reaction added");
      // console.log("════════════════════════════════════════");
      // console.log("📝 Details:");
      // console.log("   ├─ messageId:", messageId);
      // console.log("   ├─ userId:", userId.toString());
      // console.log("   ├─ emoji:", emoji);

      // CRITICAL DEBUG: Check if IDs are populated objects
      // console.log("🔍 Sender/Receiver Types:");
      // console.log("   ├─ senderId type:", typeof message.senderId);
      // console.log("   ├─ senderId value:", message.senderId);
      // console.log("   ├─ receiverId type:", typeof message.receiverId);
      // console.log("   └─ receiverId value:", message.receiverId);

      // Extract actual IDs (handle both populated and non-populated)
      const senderIdStr = message.senderId?._id
        ? message.senderId._id.toString()
        : message.senderId.toString();
      const receiverIdStr = message.receiverId?._id
        ? message.receiverId._id.toString()
        : message.receiverId.toString();

      // console.log("📝 Extracted IDs:");
      // console.log("   ├─ senderIdStr:", senderIdStr);
      // console.log("   └─ receiverIdStr:", receiverIdStr);

      // ✅ BUG FIX: Use emitToUser to send to ALL devices (multi-device support)
      emitToUser(receiverIdStr, "messageReactionAdded", messageObj);
      emitToUser(senderIdStr, "messageReactionAdded", messageObj);

      // console.log("✅ [REACTION] Emitted to online users ⚡");
      // console.log("════════════════════════════════════════\n");
    }

    res.status(200).json(message);
  } catch (error) {
    console.error("[addReaction] Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const removeReaction = async (req, res) => {
  try {
    const { id: messageId } = req.params;
    const { emoji } = req.body;
    const userId = req.user._id;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    // Remove user's reaction (matching both userId AND emoji if provided)
    const initialLength = message.reactions.length;
    message.reactions = message.reactions.filter((r) => {
      const matchesUser = r.userId.toString() === userId.toString();
      const matchesEmoji = emoji ? r.emoji === emoji : true;
      return !(matchesUser && matchesEmoji);
    });

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
      // Group message - targeted emission to all members (admin, co-admins, members)
      const Group = (await import("../model/group.model.js")).default;
      const group = await Group.findById(message.groupId);
      if (group) {
        // Include admin, co-admins (admins array), and members
        const allMembers = [
          group.admin,
          ...(group.admins || []),
          ...group.members,
        ];
        // console.log("\n════════════════════════════════════════");
        // console.log("🚫 [REACTION] Group reaction removed");
        // console.log("════════════════════════════════════════");
        // console.log("📝 Details:");
        // console.log("   ├─ messageId:", messageId);
        // console.log("   ├─ userId:", userId.toString());
        // console.log("   └─ groupId:", message.groupId.toString());

        // ✅ BUG FIX: Use emitToUser for multi-device support + correct group event name
        allMembers.forEach((memberId) => {
          emitToUser(
            memberId.toString(),
            "groupMessageReactionRemoved",
            messageObj,
          );
        });
      }
    } else {
      // Personal message - emit to sender and receiver
      // console.log("\n════════════════════════════════════════");
      // console.log("🚫 [REACTION] Personal chat reaction removed");
      // console.log("════════════════════════════════════════");
      // console.log("📝 Details:");
      // console.log("   ├─ messageId:", messageId);
      // console.log("   ├─ userId:", userId.toString());

      // Extract actual IDs (handle both populated and non-populated)
      const senderIdStr = message.senderId?._id
        ? message.senderId._id.toString()
        : message.senderId.toString();
      const receiverIdStr = message.receiverId?._id
        ? message.receiverId._id.toString()
        : message.receiverId.toString();

      // ✅ BUG FIX: Use emitToUser for multi-device support
      emitToUser(receiverIdStr, "messageReactionRemoved", messageObj);
      emitToUser(senderIdStr, "messageReactionRemoved", messageObj);
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
      return res.status(400).json({
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
      return res.status(200).json({
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
        // 🔥 FIX: Include co-admins (admins array)
        const allMembers = [
          group.admin,
          ...(group.admins || []),
          ...group.members,
        ];

        // console.log("\n══════════════════════════════════════");
        // console.log("✏️ [EDIT] Group message edit (media deleted)");
        // console.log("══════════════════════════════════════");
        // console.log("📝 Message details:");
        // console.log("   ├─ messageId:", message._id.toString());
        // console.log("   ├─ senderId:", message.senderId.toString());
        // console.log("   └─ groupId:", message.groupId.toString());
        // console.log("\n📤 [SOCKET] Emitting to members");

        // ✅ BUG FIX: Use emitToUser for multi-device support
        allMembers.forEach((memberId) => {
          emitToUser(memberId.toString(), "groupMessageEdited", messageObj);
        });

        // console.log("✅ Notified online members ⚡");
        // console.log("══════════════════════════════════════\n");
      }
    } else {
      // ✅ BUG FIX: Use emitToUser for multi-device support
      emitToUser(message.receiverId.toString(), "messageEdited", messageObj);
      emitToUser(message.senderId.toString(), "messageEdited", messageObj);
    }

    res
      .status(200)
      .json({ message: "Media deleted successfully", message: messageObj });
  } catch (error) {
    console.error("Error in deleteMessageMedia:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

/// Delete individual media item from batch (array)
///
/// DELETE /api/messages/media-item/:id
/// Body: { mediaType: 'image'|'video'|'audio'|'file', index: number }
///
/// Removes ONE item from media array (e.g., delete 2nd image from batch of 5)
/// If array becomes empty or no content remains, deletes entire message
export const deleteIndividualMediaItem = async (req, res) => {
  try {
    const { id: messageId } = req.params;
    const { mediaType, index } = req.body;
    const userId = req.user._id;

    // console.log("\n🗑️ ========================================");
    // console.log("🗑️ DELETE INDIVIDUAL MEDIA ITEM");
    // console.log("🗑️ ========================================");
    // console.log("📋 Request details:");
    // console.log("   ├─ Message ID:", messageId);
    // console.log("   ├─ Media Type:", mediaType);
    // console.log("   ├─ Index:", index);
    // console.log("   └─ User ID:", userId.toString());

    // Validate input
    if (
      !mediaType ||
      !["image", "video", "audio", "file"].includes(mediaType)
    ) {
      // console.log("❌ Invalid media type:", mediaType); // [DEBUG - Removed for production]
      return res.status(400).json({
        success: false,
        error:
          "Invalid media type. Must be 'image', 'video', 'audio', or 'file'",
      });
    }

    if (index === undefined || index === null || index < 0) {
      // console.log("❌ Invalid index:", index); // [DEBUG - Removed for production]
      return res.status(400).json({
        success: false,
        error: "Invalid index. Must be a non-negative number",
      });
    }

    const message = await Message.findById(messageId);
    if (!message) {
      // console.log("❌ Message not found"); // [DEBUG - Removed for production]
      return res
        .status(404)
        .json({ success: false, error: "Message not found" });
    }

    // Only sender can delete media
    if (message.senderId.toString() !== userId.toString()) {
      // console.log("❌ Permission denied - not sender"); // [DEBUG - Removed for production]
      return res.status(403).json({
        success: false,
        error: "You can only delete media from your own messages",
      });
    }

    // Get the media array
    const mediaArray = message[mediaType];

    // console.log("📊 Current state:");
    // console.log("   ├─ Media type:", mediaType);
    // console.log("   ├─ Is array:", Array.isArray(mediaArray));
    // console.log(
    //   "   ├─ Array length:",
    //   Array.isArray(mediaArray) ? mediaArray.length : "N/A"
    // );
    // console.log("   └─ Target index:", index);

    // Check if message has this media type
    if (!mediaArray) {
      // console.log("❌ Message does not have this media type"); // [DEBUG - Removed for production]
      return res.status(400).json({
        success: false,
        error: `Message does not have ${mediaType}`,
      });
    }

    // Handle array media
    if (Array.isArray(mediaArray)) {
      if (index >= mediaArray.length) {
        // console.log("❌ Index out of bounds"); // [DEBUG - Removed for production]
        return res.status(400).json({
          success: false,
          error: `Index ${index} out of bounds. Array has ${mediaArray.length} items`,
        });
      }

      // console.log("🔪 Removing item at index", index); // [DEBUG - Removed for production]
      // console.log("   Before:", JSON.stringify(mediaArray)); // [DEBUG - Removed for production]

      // Remove item at index
      mediaArray.splice(index, 1);

      // console.log("   After:", JSON.stringify(mediaArray)); // [DEBUG - Removed for production]
      // console.log("   New length:", mediaArray.length); // [DEBUG - Removed for production]

      // If array is now empty, remove the field entirely
      if (mediaArray.length === 0) {
        // console.log("📭 Array now empty, removing field"); // [DEBUG - Removed for production]
        message[mediaType] = null;

        // Also remove file metadata if applicable
        if (mediaType === "file") {
          if (
            Array.isArray(message.fileName) &&
            message.fileName.length > index
          ) {
            message.fileName.splice(index, 1);
            if (message.fileName.length === 0) message.fileName = null;
          }
          if (
            Array.isArray(message.fileSize) &&
            message.fileSize.length > index
          ) {
            message.fileSize.splice(index, 1);
            if (message.fileSize.length === 0) message.fileSize = null;
          }
          if (
            Array.isArray(message.fileType) &&
            message.fileType.length > index
          ) {
            message.fileType.splice(index, 1);
            if (message.fileType.length === 0) message.fileType = null;
          }
        }
      } else {
        // Update the array with the item removed
        message[mediaType] = mediaArray;

        // Also update file metadata arrays if applicable
        if (mediaType === "file") {
          if (
            Array.isArray(message.fileName) &&
            message.fileName.length > index
          ) {
            message.fileName.splice(index, 1);
          }
          if (
            Array.isArray(message.fileSize) &&
            message.fileSize.length > index
          ) {
            message.fileSize.splice(index, 1);
          }
          if (
            Array.isArray(message.fileType) &&
            message.fileType.length > index
          ) {
            message.fileType.splice(index, 1);
          }
        }
      }
    } else {
      // Single media item (not array) - delete entire field
      // console.log("📭 Single media item, removing field"); // [DEBUG - Removed for production]
      message[mediaType] = null;
      if (mediaType === "file") {
        message.fileName = null;
        message.fileSize = null;
        message.fileType = null;
      }
    }

    // Check if message still has content
    const hasContent =
      message.text ||
      message.image ||
      message.video ||
      message.audio ||
      message.file ||
      message.link;

    // console.log("🔍 Checking remaining content:");
    // console.log("   ├─ Text:", !!message.text);
    // console.log("   ├─ Image:", !!message.image);
    // console.log("   ├─ Video:", !!message.video);
    // console.log("   ├─ Audio:", !!message.audio);
    // console.log("   ├─ File:", !!message.file);
    // console.log("   ├─ Link:", !!message.link);
    // console.log("   └─ Has content:", hasContent);

    if (!hasContent) {
      // console.log("🗑️ No content remaining, deleting entire message");
      await Message.findByIdAndDelete(messageId);

      // console.log("✅ Message deleted successfully");
      // console.log("🗑️ ========================================\n");

      return res.status(200).json({
        success: true,
        message: "Message deleted (no content remaining)",
        deleted: true,
      });
    }

    // Mark as edited and save
    message.edited = true;
    message.editedAt = new Date();
    await message.save();

    // console.log("💾 Message saved with changes");

    await message.populate("senderId", "fullname profilePic");
    await message.populate("receiverId", "fullname profilePic");
    if (message.groupId) {
      await message.populate("seenBy.userId", "fullname profilePic");
    }

    const messageObj = message.toObject ? message.toObject() : message;

    // console.log("📤 Emitting socket events...");
    // console.log("   ├─ Sender ID:", message.senderId._id || message.senderId);
    // console.log(
    //   "   ├─ Receiver ID:",
    //   message.receiverId ? message.receiverId._id || message.receiverId : "N/A"
    // );
    // console.log("   ├─ Group ID:", message.groupId || "N/A");
    // console.log(
    //   "   └─ Updated image array length:",
    //   Array.isArray(messageObj.image) ? messageObj.image.length : "N/A"
    // );

    // Emit socket event for real-time updates
    if (message.groupId) {
      const Group = (await import("../model/group.model.js")).default;
      const group = await Group.findById(message.groupId);
      if (group) {
        // 🔥 FIX: Include co-admins (admins array)
        const allMembers = [
          group.admin,
          ...(group.admins || []),
          ...group.members,
        ];
        // ✅ BUG FIX: Use emitToUser for multi-device support
        allMembers.forEach((memberId) => {
          emitToUser(memberId.toString(), "groupMessageEdited", messageObj);
        });
      }
    } else {
      // ✅ BUG FIX: Use emitToUser for multi-device support
      emitToUser(message.receiverId.toString(), "messageEdited", messageObj);
      emitToUser(message.senderId.toString(), "messageEdited", messageObj);
    }

    // console.log("✅ Individual media item deleted successfully");
    // console.log("🗑️ ========================================\n");

    res.status(200).json({
      success: true,
      message: "Individual media item deleted successfully",
      deleted: false,
      updatedMessage: messageObj,
    });
  } catch (error) {
    console.error("❌ Error in deleteIndividualMediaItem:", error.message);
    console.error("Stack:", error.stack);
    res.status(500).json({ success: false, error: "Internal server error" });
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

    // ✅ FIX: If user listens, they must have seen the message - add to seenBy if not already
    // Skip if user is the sender (sender doesn't "see" their own message)
    const messageSenderId = message.senderId._id
      ? message.senderId._id.toString()
      : message.senderId.toString();
    const userIdStr = userId.toString();

    if (messageSenderId !== userIdStr && message.groupId) {
      const alreadySeen = message.seenBy.some((s) => {
        if (!s || !s.userId) return false;
        const seenUserId = s.userId._id
          ? s.userId._id.toString()
          : s.userId.toString();
        return seenUserId === userIdStr;
      });

      if (!alreadySeen) {
        message.seenBy.push({
          userId: userId,
          seenAt: new Date(),
        });
      }
    }

    // Check if already listened
    const alreadyListened = message.listenedBy.some(
      (l) => l.userId.toString() === userId.toString(),
    );

    if (!alreadyListened) {
      message.listenedBy.push({
        userId: userId,
        listenedAt: new Date(),
      });
    }

    await message.save();

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
        // 🔥 FIX: Include co-admins (admins array)
        const allMembers = [
          group.admin,
          ...(group.admins || []),
          ...group.members,
        ];

        // console.log("\n══════════════════════════════════════");
        // console.log("🎤👂 [VOICE] Voice message listened");
        // console.log("══════════════════════════════════════");
        // console.log("📝 Message details:");
        // console.log("   ├─ messageId:", message._id.toString());
        // console.log("   ├─ senderId:", message.senderId.toString());
        // console.log("   └─ groupId:", message.groupId.toString());
        // console.log("\n📤 [SOCKET] Emitting to members");

        // ✅ BUG FIX: Use emitToUser for multi-device support
        allMembers.forEach((memberId) => {
          emitToUser(memberId.toString(), "voiceMessageListened", messageObj);
        });
      }
    } else {
      // ✅ BUG FIX: Use emitToUser for multi-device support
      emitToUser(
        message.receiverId.toString(),
        "voiceMessageListened",
        messageObj,
      );
      emitToUser(
        message.senderId.toString(),
        "voiceMessageListened",
        messageObj,
      );
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
      (s) => s.userId.toString() === userId.toString(),
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
      (s) => s.userId.toString() !== userId.toString(),
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

/**
 * Search messages in a conversation (personal or group)
 *
 * @description Telegram-style message search within a specific conversation
 * - Supports text search with case-insensitive matching
 * - Works for both personal chats and group chats
 * - Returns messages sorted by relevance and date
 * - Pagination support for large result sets
 *
 * @route GET /api/messages/search/:conversationId
 * @query {string} q - Search query (required, min 1 character)
 * @query {number} page - Page number (default: 1)
 * @query {number} limit - Results per page (default: 20, max: 100)
 * @query {string} type - Conversation type: 'personal' or 'group' (required)
 *
 * @returns {Object} { messages: Message[], pagination: { page, limit, total, pages } }
 */
export const searchMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { q: searchQuery, page = 1, limit = 20, type } = req.query;
    const userId = req.user._id;

    // ✅ VALIDATION: Search query required
    if (!searchQuery || searchQuery.trim().length === 0) {
      return res.status(400).json({
        error: "Search query is required",
        code: "SEARCH_QUERY_REQUIRED",
      });
    }

    // ✅ VALIDATION: Conversation type required
    if (!type || !["personal", "group"].includes(type)) {
      return res.status(400).json({
        error: "Conversation type must be 'personal' or 'group'",
        code: "INVALID_CONVERSATION_TYPE",
      });
    }

    // ✅ VALIDATION: Limit bounds
    const parsedPage = Math.max(1, parseInt(page) || 1);
    const parsedLimit = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const skip = (parsedPage - 1) * parsedLimit;

    // ✅ SECURITY: Escape regex special characters to prevent ReDoS
    const escapedQuery = searchQuery
      .trim()
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const searchRegex = new RegExp(escapedQuery, "i");

    let query;
    let isParticipant = false;

    if (type === "group") {
      // ✅ GROUP CHAT SEARCH
      const Group = (await import("../model/group.model.js")).default;
      const group = await Group.findById(conversationId);

      if (!group) {
        return res.status(404).json({
          error: "Group not found",
          code: "GROUP_NOT_FOUND",
        });
      }

      // ✅ SECURITY: Verify user is a member of the group
      const userIdStr = userId.toString();
      // 🔥 FIX: Include co-admins (admins array) in participant check
      isParticipant =
        group.admin.toString() === userIdStr ||
        (group.admins &&
          group.admins.some((a) => a.toString() === userIdStr)) ||
        group.members.some((m) => m.toString() === userIdStr);

      if (!isParticipant) {
        return res.status(403).json({
          error: "You are not a member of this group",
          code: "NOT_GROUP_MEMBER",
        });
      }

      query = {
        groupId: conversationId,
        $or: [
          { text: { $regex: searchRegex } },
          { fileName: { $regex: searchRegex } },
        ],
      };
    } else {
      // ✅ PERSONAL CHAT SEARCH
      const otherUserId = conversationId;

      // Verify the other user exists
      const User = (await import("../model/user.model.js")).default;
      const otherUser = await User.findById(otherUserId);
      if (!otherUser) {
        return res.status(404).json({
          error: "User not found",
          code: "USER_NOT_FOUND",
        });
      }

      // Search in both directions of the conversation
      query = {
        $and: [
          {
            $or: [
              { senderId: userId, receiverId: otherUserId },
              { senderId: otherUserId, receiverId: userId },
            ],
          },
          {
            $or: [
              { text: { $regex: searchRegex } },
              { fileName: { $regex: searchRegex } },
            ],
          },
        ],
        groupId: { $exists: false }, // Exclude group messages
      };
    }

    // ✅ PERFORMANCE: Use compound index for efficient search
    // Count total matches for pagination
    const total = await Message.countDocuments(query);

    // Fetch matching messages with pagination
    const messages = await Message.find(query)
      .sort({ createdAt: -1 }) // Newest first (Telegram-style)
      .skip(skip)
      .limit(parsedLimit)
      .populate("senderId", "fullname profilePic")
      .populate("receiverId", "fullname profilePic")
      .populate("groupId", "name profilePic")
      .populate("reactions.userId", "fullname profilePic")
      .populate("seenBy.userId", "fullname profilePic")
      .populate("listenedBy.userId", "fullname profilePic")
      .populate({
        path: "replyTo",
        select:
          "text image audio video file sticker senderId receiverId createdAt",
        populate: {
          path: "senderId",
          select: "fullname profilePic",
        },
      })
      .lean();

    res.status(200).json({
      messages,
      query: searchQuery.trim(),
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total,
        pages: Math.ceil(total / parsedLimit),
        hasMore: skip + messages.length < total,
      },
    });
  } catch (error) {
    console.error("Error searching messages:", error);
    res.status(500).json({
      error: "Internal server error",
      code: "SEARCH_ERROR",
    });
  }
};

/**
 * Get messages around a specific message ID (for search result navigation)
 *
 * **Use Case:**
 * When user taps a search result, we need to load messages around that message
 * to provide context (messages before and after the target message).
 *
 * **Request:**
 * GET /api/messages/around/:conversationId/:messageId
 *
 * **Query Params:**
 * - type: 'personal' | 'group' (required)
 * - before: number (messages before target, default 15)
 * - after: number (messages after target, default 15)
 *
 * **Response:**
 * {
 *   messages: Message[],         // Sorted by createdAt DESC (newest first)
 *   targetIndex: number,         // Index of target message in array
 *   hasMoreBefore: boolean,      // Can load more older messages
 *   hasMoreAfter: boolean,       // Can load more newer messages
 * }
 */
export const getMessagesAround = async (req, res) => {
  try {
    const userId = req.user._id;
    const { conversationId, messageId } = req.params;
    const { type = "personal", before = 15, after = 15 } = req.query;

    // ✅ VALIDATION: Required params
    if (!conversationId || !messageId) {
      return res.status(400).json({
        error: "conversationId and messageId are required",
        code: "MISSING_PARAMS",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({
        error: "Invalid messageId format",
        code: "INVALID_MESSAGE_ID",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({
        error: "Invalid conversationId format",
        code: "INVALID_CONVERSATION_ID",
      });
    }

    if (!["personal", "group"].includes(type)) {
      return res.status(400).json({
        error: "Conversation type must be 'personal' or 'group'",
        code: "INVALID_CONVERSATION_TYPE",
      });
    }

    const parsedBefore = Math.min(50, Math.max(1, parseInt(before) || 15));
    const parsedAfter = Math.min(50, Math.max(1, parseInt(after) || 15));

    // ✅ Get the target message first
    const targetMessage = await Message.findById(messageId).lean();
    if (!targetMessage) {
      return res.status(404).json({
        error: "Message not found",
        code: "MESSAGE_NOT_FOUND",
      });
    }

    const targetCreatedAt = targetMessage.createdAt;

    let baseQuery;
    let isParticipant = false;

    if (type === "group") {
      // ✅ GROUP CHAT
      const Group = (await import("../model/group.model.js")).default;
      const group = await Group.findById(conversationId);

      if (!group) {
        return res.status(404).json({
          error: "Group not found",
          code: "GROUP_NOT_FOUND",
        });
      }

      // Verify user is a member
      const userIdStr = userId.toString();
      // 🔥 FIX: Include co-admins (admins array) in participant check
      isParticipant =
        group.admin.toString() === userIdStr ||
        (group.admins &&
          group.admins.some((a) => a.toString() === userIdStr)) ||
        group.members.some((m) => m.toString() === userIdStr);

      if (!isParticipant) {
        return res.status(403).json({
          error: "You are not a member of this group",
          code: "NOT_GROUP_MEMBER",
        });
      }

      baseQuery = { groupId: conversationId };
    } else {
      // ✅ PERSONAL CHAT
      const otherUserId = conversationId;
      baseQuery = {
        $or: [
          { senderId: userId, receiverId: otherUserId },
          { senderId: otherUserId, receiverId: userId },
        ],
        groupId: { $exists: false },
      };
    }

    // ✅ Get messages BEFORE target (older messages)
    const messagesBefore = await Message.find({
      ...baseQuery,
      createdAt: { $lt: targetCreatedAt },
    })
      .sort({ createdAt: -1 }) // Newest of the older messages first
      .limit(parsedBefore)
      .populate("senderId", "fullname profilePic")
      .populate("receiverId", "fullname profilePic")
      .populate("groupId", "name profilePic")
      .populate("reactions.userId", "fullname profilePic")
      .populate("seenBy.userId", "fullname profilePic")
      .populate({
        path: "replyTo",
        select:
          "text image audio video file sticker senderId receiverId createdAt",
        populate: { path: "senderId", select: "fullname profilePic" },
      })
      .lean();

    // ✅ Get messages AFTER target (newer messages, including target)
    const messagesAfter = await Message.find({
      ...baseQuery,
      createdAt: { $gte: targetCreatedAt },
    })
      .sort({ createdAt: 1 }) // Oldest of the newer messages first
      .limit(parsedAfter + 1) // +1 to include target message
      .populate("senderId", "fullname profilePic")
      .populate("receiverId", "fullname profilePic")
      .populate("groupId", "name profilePic")
      .populate("reactions.userId", "fullname profilePic")
      .populate("seenBy.userId", "fullname profilePic")
      .populate({
        path: "replyTo",
        select:
          "text image audio video file sticker senderId receiverId createdAt",
        populate: { path: "senderId", select: "fullname profilePic" },
      })
      .lean();

    // ✅ Check if there are more messages
    const hasMoreBefore = messagesBefore.length === parsedBefore;
    const hasMoreAfter = messagesAfter.length > parsedAfter;

    // ✅ Combine and sort: newest first (match normal chat view order)
    // messagesAfter: [oldest, ..., target, ..., newest] → reverse to [newest, ..., target, ..., oldest]
    // messagesBefore: [newest-of-older, ..., oldest] (already in desc order)
    const combinedMessages = [
      ...messagesAfter.reverse(), // Newer messages (including target)
      ...messagesBefore, // Older messages
    ];

    // ✅ Find target index in combined array
    const targetIndex = combinedMessages.findIndex(
      (m) => m._id.toString() === messageId,
    );

    res.status(200).json({
      messages: combinedMessages,
      targetIndex,
      targetMessageId: messageId,
      hasMoreBefore,
      hasMoreAfter,
      count: combinedMessages.length,
    });
  } catch (error) {
    console.error("Error getting messages around:", error);
    res.status(500).json({
      error: "Internal server error",
      code: "AROUND_ERROR",
    });
  }
};
