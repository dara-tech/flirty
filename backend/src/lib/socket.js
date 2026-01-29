import { Server } from "socket.io";
import http from "http";
import express from "express";
import mongoose from "mongoose";
import Message from "../model/message.model.js";
import Group from "../model/group.model.js";
import User from "../model/user.model.js";
import { createCallRecord } from "../controllers/call.controller.js";
import {
  checkSocketRateLimit,
  trackSocketDisconnection,
} from "../middleware/rateLimiter.js";
import logger from "./logger.js";

const app = express();
const server = http.createServer(app);

// Allowed origins for Socket.io - must match Express CORS configuration
const getAllowedSocketOrigins = () => {
  const allowedOrigins = [
    // Development origins
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    // Production frontend URL from environment variable
    process.env.FRONTEND_URL,
    // Additional allowed origins (comma-separated, optional)
    ...(process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(",")
      : []),
  ].filter(Boolean); // Remove undefined/null/empty values

  return allowedOrigins;
};

// Socket.io CORS origin checker - matches Express CORS logic
const socketCorsOrigin = (origin, callback) => {
  try {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) {
      return callback(null, true);
    }

    const allowedOrigins = getAllowedSocketOrigins();

    // Log for debugging (removed to keep logs clean)

    // In development, allow all origins (for flexibility)
    if (process.env.NODE_ENV === "development") {
      return callback(null, true);
    }

    // In production, only allow whitelisted origins
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Origin not allowed
    return callback(
      new Error(`Origin ${origin} is not allowed by Socket.io CORS policy`),
      false,
    );
  } catch (error) {
    console.error("Socket.IO CORS error:", error);
    return callback(new Error("Socket.IO CORS configuration error"), false);
  }
};

const io = new Server(server, {
  cors: {
    origin: socketCorsOrigin, // Function-based origin checking (matches Express)
    credentials: true, // Required for cookies/authentication
    methods: ["GET", "POST"], // WebSocket uses GET/POST
    allowedHeaders: ["Content-Type", "Authorization"],
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// MULTI-DEVICE SUPPORT
// ═══════════════════════════════════════════════════════════════════════════
// userSockets now stores Set<socketId> per user to support multiple devices
// This enables Telegram/WhatsApp-like experience where all devices ring
// and when call is answered on one device, others are notified
// ═══════════════════════════════════════════════════════════════════════════
const userSockets = new Map(); // { userId: Set<socketId> }

// Helper: Add a socket for a user
function addUserSocket(userId, socketId) {
  const userIdStr = typeof userId === "string" ? userId : userId.toString();
  if (!userSockets.has(userIdStr)) {
    userSockets.set(userIdStr, new Set());
  }
  userSockets.get(userIdStr).add(socketId);
}

// Helper: Remove a socket for a user
function removeUserSocket(userId, socketId) {
  const userIdStr = typeof userId === "string" ? userId : userId.toString();
  const sockets = userSockets.get(userIdStr);
  if (sockets) {
    sockets.delete(socketId);
    if (sockets.size === 0) {
      userSockets.delete(userIdStr);
    }
  }
}

// Helper: Get all socket IDs for a user (returns array)
function getAllUserSocketIds(userId) {
  const userIdStr = typeof userId === "string" ? userId : userId.toString();
  const sockets = userSockets.get(userIdStr);
  return sockets ? Array.from(sockets) : [];
}

// Helper: Emit to all of a user's devices
function emitToUser(userId, event, data) {
  const socketIds = getAllUserSocketIds(userId);
  socketIds.forEach((socketId) => {
    io.to(socketId).emit(event, data);
  });
  return socketIds.length;
}

// Helper: Emit to all of a user's devices EXCEPT one (for "answered elsewhere")
function emitToUserExcept(userId, exceptSocketId, event, data) {
  const socketIds = getAllUserSocketIds(userId);
  socketIds.forEach((socketId) => {
    if (socketId !== exceptSocketId) {
      io.to(socketId).emit(event, data);
    }
  });
}

// Helper: Check if user has any connected sockets
function isUserOnline(userId) {
  const userIdStr = typeof userId === "string" ? userId : userId.toString();
  const sockets = userSockets.get(userIdStr);
  return sockets && sockets.size > 0;
}

// Store active calls (temporary, in-memory)
// In production, consider using Redis or database
const activeCalls = new Map(); // { callId: { callerId, receiverId, callType, status } }

// Store pending calls for offline users (with timeout)
// { callId: { callerId, receiverId, callType, callerInfo, createdAt, timeoutId } }
const pendingCalls = new Map();

// Store active group call rooms (SFU-style)
// { roomId: { groupId, participants: [{ userId, socketId, tracks: { audio, video } }], callType } }
const groupCallRooms = new Map();

// Store user locations for real-time map
// { userId: { lat, lng, speed, heading, accuracy, timestamp, socketId } }
const userLocations = new Map();

// Location sharing rooms (for nearby users)
const locationRooms = new Map(); // { roomId: Set<userId> }

export function getReceiverSocketId(userId) {
  if (!userId) return null;
  // Convert to string to ensure consistent lookup
  const userIdStr = typeof userId === "string" ? userId : userId.toString();

  // MULTI-DEVICE: Return first socket ID (for backward compatibility)
  // For new code, use getAllUserSocketIds() or emitToUser() instead
  const sockets = userSockets.get(userIdStr);
  if (!sockets || sockets.size === 0) {
    return null;
  }

  // Return first socket (arbitrary but consistent)
  return Array.from(sockets)[0];
}

// MULTI-DEVICE: Get all socket IDs for a user (exported for use in other modules)
export function getReceiverSocketIds(userId) {
  return getAllUserSocketIds(userId);
}

io.on("connection", (socket) => {
  const userId = socket.handshake.query.userId;

  // Rate limit check for Socket.IO connections
  checkSocketRateLimit(socket, (result) => {
    if (!result.allowed) {
      logger.warn("Socket connection rejected due to rate limit", {
        userId,
        socketId: socket.id,
        reason: result.reason,
        retryAfter: result.retryAfter,
      });

      // Emit error to client before disconnecting
      socket.emit("error", {
        message: result.reason,
        retryAfter: result.retryAfter,
        code: "RATE_LIMIT_EXCEEDED",
      });

      // Disconnect the socket
      socket.disconnect(true);
      return;
    }

    // Connection allowed, proceed with normal flow
    if (userId) {
      // Ensure userId is stored as string for consistent lookup
      const userIdStr = typeof userId === "string" ? userId : userId.toString();

      // MULTI-DEVICE: Count existing sockets before adding new one
      const existingSocketCount = getAllUserSocketIds(userIdStr).length;

      logger.debug("Socket user connected", {
        userId: userIdStr,
        socketId: socket.id,
        existingDevices: existingSocketCount,
        isNewDevice: existingSocketCount > 0,
      });

      // MULTI-DEVICE: Add this socket to user's set of sockets
      // (No longer replaces - allows multiple devices)
      addUserSocket(userIdStr, socket.id);

      logger.info("Multi-device socket added", {
        userId: userIdStr,
        socketId: socket.id,
        totalDevices: getAllUserSocketIds(userIdStr).length,
      });

      // Check for pending calls when user comes online
      // Deliver any pending calls that were waiting for this user
      for (const [callId, pendingCall] of pendingCalls.entries()) {
        if (pendingCall.receiverId.toString() === userIdStr) {
          // Clear the timeout since user is now online
          clearTimeout(pendingCall.timeoutId);

          // Move from pending to active
          activeCalls.set(callId, {
            callerId: pendingCall.callerId,
            receiverId: pendingCall.receiverId,
            callType: pendingCall.callType,
            status: "ringing",
            createdAt: pendingCall.createdAt,
          });

          // MULTI-DEVICE: Send call invitation to ALL receiver's devices
          emitToUser(userIdStr, "call:incoming", {
            callId,
            callerId: pendingCall.callerId,
            callerInfo: pendingCall.callerInfo,
            callType: pendingCall.callType,
          });

          // Notify caller that receiver is now online and call is ringing
          const callerSocketId = getReceiverSocketId(pendingCall.callerId);
          if (callerSocketId) {
            io.to(callerSocketId).emit("call:ringing", {
              callId,
              receiverId: userIdStr,
            });
          }

          // Remove from pending
          pendingCalls.delete(callId);

          // Set timeout for this call (60 seconds from now)
          setTimeout(async () => {
            const callInfo = activeCalls.get(callId);
            if (callInfo && callInfo.status === "ringing") {
              // Call not answered after 60 seconds
              // Save missed call to database
              try {
                const savedCall = await createCallRecord({
                  callerId: callInfo.callerId,
                  receiverId: callInfo.receiverId,
                  groupId: null,
                  callType: callInfo.callType,
                  status: "missed",
                  duration: 0,
                  startedAt: callInfo.startedAt || callInfo.createdAt,
                  endedAt: new Date(),
                });
                // console.log("✅ Missed call record saved to database:", { // [DEBUG - Removed for production]
                // callId: savedCall._id,
                // callerId: callInfo.callerId,
                // receiverId: callInfo.receiverId,
                // });
              } catch (saveError) {
                console.error("❌ Error saving missed call record:", saveError);
              }

              activeCalls.delete(callId);

              // Notify caller
              const callerSocketId = getReceiverSocketId(callInfo.callerId);
              if (callerSocketId) {
                io.to(callerSocketId).emit("call:failed", {
                  callId,
                  reason: "No answer",
                });
              }

              // Notify receiver
              const receiverSocketId = getReceiverSocketId(callInfo.receiverId);
              if (receiverSocketId) {
                io.to(receiverSocketId).emit("call:missed", {
                  callId,
                  callerId: callInfo.callerId,
                });
              }
            }
          }, 60000); // 60 seconds timeout
        }
      }
    }
  }); // Close checkSocketRateLimit callback

  io.emit("getOnlineUsers", Array.from(userSockets.keys()));

  socket.on("typing", ({ receiverId }) => {
    try {
      if (receiverId && userId) {
        const receiverSocketId = getReceiverSocketId(receiverId);
        if (receiverSocketId) {
          io.to(receiverSocketId).emit("typing", { senderId: userId });
        }
      }
    } catch (error) {
      logger.error("[SOCKET] Error in typing handler", {
        error: error.message,
      });
    }
  });

  socket.on("stopTyping", ({ receiverId }) => {
    try {
      if (receiverId && userId) {
        const receiverSocketId = getReceiverSocketId(receiverId);
        if (receiverSocketId) {
          io.to(receiverSocketId).emit("stopTyping", { senderId: userId });
        }
      }
    } catch (error) {
      logger.error("[SOCKET] Error in stopTyping handler", {
        error: error.message,
      });
    }
  });

  // Editing indicator
  socket.on("editing", ({ receiverId }) => {
    try {
      if (receiverId && userId) {
        const receiverSocketId = getReceiverSocketId(receiverId);
        if (receiverSocketId) {
          io.to(receiverSocketId).emit("editing", { senderId: userId });
        }
      }
    } catch (error) {
      logger.error("[SOCKET] Error in editing handler", {
        error: error.message,
      });
    }
  });

  socket.on("stopEditing", ({ receiverId }) => {
    try {
      if (receiverId && userId) {
        const receiverSocketId = getReceiverSocketId(receiverId);
        if (receiverSocketId) {
          io.to(receiverSocketId).emit("stopEditing", { senderId: userId });
        }
      }
    } catch (error) {
      logger.error("[SOCKET] Error in stopEditing handler", {
        error: error.message,
      });
    }
  });

  // Deleting indicator
  socket.on("deleting", ({ receiverId }) => {
    try {
      if (receiverId && userId) {
        const receiverSocketId = getReceiverSocketId(receiverId);
        if (receiverSocketId) {
          io.to(receiverSocketId).emit("deleting", { senderId: userId });
        }
      }
    } catch (error) {
      logger.error("[SOCKET] Error in deleting handler", {
        error: error.message,
      });
    }
  });

  socket.on("stopDeleting", ({ receiverId }) => {
    try {
      if (receiverId && userId) {
        const receiverSocketId = getReceiverSocketId(receiverId);
        if (receiverSocketId) {
          io.to(receiverSocketId).emit("stopDeleting", { senderId: userId });
        }
      }
    } catch (error) {
      logger.error("[SOCKET] Error in stopDeleting handler", {
        error: error.message,
      });
    }
  });

  // Uploading photo indicator
  socket.on("uploadingPhoto", ({ receiverId }) => {
    try {
      if (receiverId && userId) {
        const receiverSocketId = getReceiverSocketId(receiverId);
        if (receiverSocketId) {
          io.to(receiverSocketId).emit("uploadingPhoto", { senderId: userId });
        }
      }
    } catch (error) {
      logger.error("[SOCKET] Error in uploadingPhoto handler", {
        error: error.message,
      });
    }
  });

  socket.on("stopUploadingPhoto", ({ receiverId }) => {
    try {
      if (receiverId && userId) {
        const receiverSocketId = getReceiverSocketId(receiverId);
        if (receiverSocketId) {
          io.to(receiverSocketId).emit("stopUploadingPhoto", {
            senderId: userId,
          });
        }
      }
    } catch (error) {
      logger.error("[SOCKET] Error in stopUploadingPhoto handler", {
        error: error.message,
      });
    }
  });

  socket.on("messageSeen", async ({ messageId, senderId }) => {
    try {
      // ✅ BEST PRACTICE: Input validation (Telegram-style safety)
      if (!messageId || !senderId || !userId) {
        logger.warn("[SOCKET] messageSeen - Invalid parameters", {
          messageId,
          senderId,
          userId,
          socketId: socket.id,
        });
        return;
      }

      // ✅ BEST PRACTICE: Validate ObjectId format before query
      if (!mongoose.Types.ObjectId.isValid(messageId)) {
        logger.warn("[SOCKET] messageSeen - Invalid messageId format", {
          messageId,
        });
        return;
      }

      const message = await Message.findById(messageId);
      if (!message) {
        logger.warn("[SOCKET] messageSeen - Message not found", {
          messageId,
        });
        return;
      }

      // ✅ PRODUCTION: Idempotent operation - skip if already seen
      if (message.seen) {
        logger.debug("[SOCKET] messageSeen - Already marked as seen", {
          messageId,
        });
        return;
      }

      // ✅ BEST PRACTICE: Authorization check - only receiver can mark as seen
      const receiverIdStr = message.receiverId?.toString();
      if (!receiverIdStr || userId.toString() !== receiverIdStr) {
        logger.warn("[SOCKET] messageSeen - Unauthorized attempt", {
          messageId,
          userId,
          receiverId: receiverIdStr,
        });
        return;
      }

      // ✅ PRODUCTION: Atomic update with timestamp
      message.seen = true;
      message.seenAt = new Date();
      await message.save();

      // console.log("✅ [SOCKET] Message marked as seen:", messageId);

      const updatePayload = {
        messageId,
        seenAt: message.seenAt,
        senderId: message.senderId?.toString(),
        receiverId: message.receiverId?.toString(),
      };

      // ✅ CRITICAL FIX: Emit to BOTH sender and receiver for real-time sync
      // Sender (original message author) needs to see ✓✓ checkmarks
      const senderSocketId = getReceiverSocketId(senderId);
      if (senderSocketId) {
        io.to(senderSocketId).emit("messageSeenUpdate", updatePayload);
        // console.log("📤 [SOCKET] Emitted messageSeenUpdate to sender:", {
        //   senderId,
        //   socketId: senderSocketId,
        //   messageId,
        // });
      } else {
        // console.log("⚠️ [SOCKET] Sender socket not found:", senderId); // [DEBUG - Removed for production]
      }

      // ✅ CRITICAL FIX: Also emit to receiver (person who marked as seen)
      // This ensures their chat list updates immediately after marking as seen
      // receiverIdStr already declared above, reuse it
      if (receiverIdStr) {
        const receiverSocketId = getReceiverSocketId(receiverIdStr);
        if (receiverSocketId && receiverSocketId !== senderSocketId) {
          io.to(receiverSocketId).emit("messageSeenUpdate", updatePayload);
          // console.log("📤 [SOCKET] Emitted messageSeenUpdate to receiver:", {
          //   receiverId: receiverIdStr,
          //   socketId: receiverSocketId,
          //   messageId,
          // });
        }
      }
    } catch (error) {
      console.error("❌ [SOCKET] Error updating message seen status:", error);
    }
  });

  // Helper function to emit to all group members except sender
  const emitToGroupMembers = async (groupId, senderId, event, data) => {
    try {
      const group = await Group.findById(groupId)
        .populate("admin", "fullname profilePic")
        .populate("members", "fullname profilePic");
      if (!group) return;

      const allMembers = [group.admin, ...group.members];
      allMembers.forEach((member) => {
        const memberIdStr = member._id
          ? member._id.toString()
          : member.toString();
        if (memberIdStr !== senderId) {
          const memberSocketId = getReceiverSocketId(memberIdStr);
          if (memberSocketId) {
            io.to(memberSocketId).emit(event, data);
          }
        }
      });
    } catch (error) {
      console.error(`Error in ${event}:`, error);
    }
  };

  // Group typing indicators
  socket.on("groupTyping", async ({ groupId }) => {
    if (groupId && userId) {
      try {
        const sender = await User.findById(userId).select("fullname");
        await emitToGroupMembers(groupId, userId, "groupTyping", {
          groupId,
          senderId: userId,
          senderName: sender?.fullname || "Someone",
        });
      } catch (error) {
        console.error("Error in groupTyping:", error);
      }
    }
  });

  socket.on("groupStopTyping", async ({ groupId }) => {
    try {
      if (groupId && userId) {
        await emitToGroupMembers(groupId, userId, "groupStopTyping", {
          groupId,
          senderId: userId,
        });
      }
    } catch (error) {
      logger.error("[SOCKET] Error in groupStopTyping", {
        error: error.message,
      });
    }
  });

  // Group editing indicator
  socket.on("groupEditing", async ({ groupId }) => {
    try {
      if (groupId && userId) {
        await emitToGroupMembers(groupId, userId, "groupEditing", {
          groupId,
          senderId: userId,
        });
      }
    } catch (error) {
      logger.error("[SOCKET] Error in groupEditing", { error: error.message });
    }
  });

  socket.on("groupStopEditing", async ({ groupId }) => {
    try {
      if (groupId && userId) {
        await emitToGroupMembers(groupId, userId, "groupStopEditing", {
          groupId,
          senderId: userId,
        });
      }
    } catch (error) {
      logger.error("[SOCKET] Error in groupStopEditing", {
        error: error.message,
      });
    }
  });

  // Group deleting indicator
  socket.on("groupDeleting", async ({ groupId }) => {
    try {
      if (groupId && userId) {
        await emitToGroupMembers(groupId, userId, "groupDeleting", {
          groupId,
          senderId: userId,
        });
      }
    } catch (error) {
      logger.error("[SOCKET] Error in groupDeleting", { error: error.message });
    }
  });

  socket.on("groupStopDeleting", async ({ groupId }) => {
    try {
      if (groupId && userId) {
        await emitToGroupMembers(groupId, userId, "groupStopDeleting", {
          groupId,
          senderId: userId,
        });
      }
    } catch (error) {
      logger.error("[SOCKET] Error in groupStopDeleting", {
        error: error.message,
      });
    }
  });

  // Group uploading photo indicator
  socket.on("groupUploadingPhoto", async ({ groupId }) => {
    try {
      if (groupId && userId) {
        await emitToGroupMembers(groupId, userId, "groupUploadingPhoto", {
          groupId,
          senderId: userId,
        });
      }
    } catch (error) {
      logger.error("[SOCKET] Error in groupUploadingPhoto", {
        error: error.message,
      });
    }
  });

  socket.on("groupStopUploadingPhoto", async ({ groupId }) => {
    try {
      if (groupId && userId) {
        await emitToGroupMembers(groupId, userId, "groupStopUploadingPhoto", {
          groupId,
          senderId: userId,
        });
      }
    } catch (error) {
      logger.error("[SOCKET] Error in groupStopUploadingPhoto", {
        error: error.message,
      });
    }
  });

  // Reaction handlers - WebSocket-based real-time reactions
  socket.on("reaction", async ({ messageId, emoji }) => {
    try {
      // ✅ BEST PRACTICE: Input validation
      if (!messageId || !emoji || !userId) {
        logger.warn("[SOCKET] reaction - Invalid parameters", {
          messageId,
          emoji,
          userId,
          socketId: socket.id,
        });
        return;
      }

      // ✅ BEST PRACTICE: Validate ObjectId format
      if (!mongoose.Types.ObjectId.isValid(messageId)) {
        logger.warn("[SOCKET] reaction - Invalid messageId format", {
          messageId,
        });
        return;
      }

      // ✅ PRODUCTION: Emoji validation (prevent XSS/injection)
      const emojiRegex = /^[\p{Emoji}\p{Emoji_Component}]+$/u;
      if (!emojiRegex.test(emoji) || emoji.length > 10) {
        logger.warn("[SOCKET] reaction - Invalid emoji format", {
          emoji,
          userId,
        });
        return;
      }

      const message = await Message.findById(messageId);
      if (!message) {
        logger.warn("[SOCKET] reaction - Message not found", { messageId });
        return;
      }

      // Check if user is part of the conversation/group
      let isParticipant = false;

      if (message.groupId) {
        const group = await Group.findById(message.groupId);
        if (group) {
          const userIdStr = userId.toString();
          isParticipant =
            group.admin.toString() === userIdStr ||
            group.members.some((m) => m.toString() === userIdStr);
        }
      } else {
        // Direct message
        const userIdStr = userId.toString();
        isParticipant =
          message.senderId.toString() === userIdStr ||
          (message.receiverId && message.receiverId.toString() === userIdStr);
      }

      if (!isParticipant) {
        logger.warn("[SOCKET] reaction - User not a participant", {
          messageId,
          userId,
          groupId: message.groupId?.toString(),
        });
        return;
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

      // ✅ PRODUCTION: Find existing reaction from this user
      const existingReactionIndex = message.reactions.findIndex(
        (r) => r.userId.toString() === userId.toString() && r.emoji === emoji,
      );

      const wasRemoved = existingReactionIndex !== -1;
      const actionType = wasRemoved ? "removed" : "added";

      if (existingReactionIndex !== -1) {
        // Remove reaction (toggle off)
        message.reactions.splice(existingReactionIndex, 1);
        logger.debug("[SOCKET] Reaction removed", {
          messageId,
          userId,
          emoji,
        });
      } else {
        // Remove any other reaction from this user for this message (one reaction per user per message)
        message.reactions = message.reactions.filter(
          (r) => r.userId.toString() !== userId.toString(),
        );
        // Add new reaction
        message.reactions.push({
          userId: userId,
          emoji: emoji,
          createdAt: new Date(),
        });
        logger.debug("[SOCKET] Reaction added", {
          messageId,
          userId,
          emoji,
        });
      }

      // ✅ PRODUCTION: Save with error handling
      try {
        await message.save();
      } catch (saveError) {
        logger.error("[SOCKET] Failed to save reaction", {
          error: saveError.message,
          messageId,
          userId,
        });
        return;
      }
      // ✅ PRODUCTION: Populate with error handling
      try {
        await message.populate("reactions.userId", "fullname profilePic");
        await message.populate("senderId", "fullname profilePic");
        await message.populate("receiverId", "fullname profilePic");
        // ✅ FIX: Also populate seenBy since we may have added user to it
        if (message.groupId) {
          await message.populate("seenBy.userId", "fullname profilePic");
        }
      } catch (populateError) {
        logger.error("[SOCKET] Failed to populate reaction message", {
          error: populateError.message,
          messageId,
        });
      }

      const messageObj = message.toObject ? message.toObject() : message;
      const reactionPayload = {
        messageId: messageId.toString(),
        reactions: messageObj.reactions || [],
        message: messageObj,
        actionType: actionType, // ✅ Tell client if added or removed
        userId: userId.toString(),
      };

      // ✅ PRODUCTION: Broadcast with logging
      if (message.groupId) {
        const group = await Group.findById(message.groupId);
        if (group) {
          const allMembers = [group.admin, ...group.members];
          let broadcastCount = 0;

          // Determine legacy event name based on action type
          const legacyGroupEvent =
            actionType === "removed"
              ? "groupMessageReactionRemoved"
              : "groupMessageReactionAdded";

          allMembers.forEach((memberId) => {
            const memberSocketId = getReceiverSocketId(memberId.toString());
            if (memberSocketId) {
              // Emit new unified event
              io.to(memberSocketId).emit("reaction-update", reactionPayload);
              // ✅ BACKWARD COMPAT: Also emit legacy event for Flutter app
              io.to(memberSocketId).emit(legacyGroupEvent, messageObj);
              broadcastCount++;
            }
          });

          logger.debug("[SOCKET] Reaction broadcast to group", {
            messageId,
            groupId: message.groupId.toString(),
            membersNotified: broadcastCount,
            totalMembers: allMembers.length,
            actionType,
          });
        }
      } else {
        // Direct message - notify both sender and receiver
        // Handle both ObjectId and populated object formats
        const receiverIdRaw = message.receiverId;
        const senderIdRaw = message.senderId;

        const receiverIdStr = receiverIdRaw
          ? receiverIdRaw._id
            ? receiverIdRaw._id.toString()
            : receiverIdRaw.toString()
          : null;
        const senderIdStr = senderIdRaw
          ? senderIdRaw._id
            ? senderIdRaw._id.toString()
            : senderIdRaw.toString()
          : null;

        const receiverSocketId = receiverIdStr
          ? getReceiverSocketId(receiverIdStr)
          : null;
        const senderSocketId = senderIdStr
          ? getReceiverSocketId(senderIdStr)
          : null;

        let broadcastCount = 0;
        const notifiedSockets = new Set();

        // Determine legacy event name based on action type
        const legacyEvent =
          actionType === "removed"
            ? "messageReactionRemoved"
            : "messageReactionAdded";

        // Emit to receiver if online and not already notified
        if (receiverSocketId && !notifiedSockets.has(receiverSocketId)) {
          io.to(receiverSocketId).emit("reaction-update", reactionPayload);
          // ✅ BACKWARD COMPAT: Also emit legacy event for Flutter app
          io.to(receiverSocketId).emit(legacyEvent, messageObj);
          notifiedSockets.add(receiverSocketId);
          broadcastCount++;
        }

        // Emit to sender if online and not already notified
        if (senderSocketId && !notifiedSockets.has(senderSocketId)) {
          io.to(senderSocketId).emit("reaction-update", reactionPayload);
          // ✅ BACKWARD COMPAT: Also emit legacy event for Flutter app
          io.to(senderSocketId).emit(legacyEvent, messageObj);
          notifiedSockets.add(senderSocketId);
          broadcastCount++;
        }

        logger.debug("[SOCKET] Reaction broadcast to direct message", {
          messageId,
          receiverId: receiverIdStr,
          senderId: senderIdStr,
          usersNotified: broadcastCount,
          actionType,
        });
      }
    } catch (error) {
      console.error("Error handling reaction:", error);
    }
  });

  // Group message seen status
  socket.on("groupMessageSeen", async ({ messageId, groupId }) => {
    try {
      // ✅ BEST PRACTICE: Input validation
      if (!messageId || !groupId || !userId) {
        logger.warn("[SOCKET] groupMessageSeen - Invalid parameters", {
          messageId,
          groupId,
          userId,
          socketId: socket.id,
        });
        return;
      }

      // ✅ BEST PRACTICE: Validate ObjectId formats
      if (
        !mongoose.Types.ObjectId.isValid(messageId) ||
        !mongoose.Types.ObjectId.isValid(groupId)
      ) {
        logger.warn("[SOCKET] groupMessageSeen - Invalid ID format", {
          messageId,
          groupId,
        });
        return;
      }

      const message = await Message.findById(messageId).populate(
        "senderId",
        "fullname",
      );
      if (!message || !message.groupId) {
        logger.warn(
          "[SOCKET] groupMessageSeen - Message not found or not a group message",
          { messageId },
        );
        return;
      }

      // ✅ BEST PRACTICE: Verify groupId matches
      if (message.groupId.toString() !== groupId.toString()) {
        logger.warn("[SOCKET] groupMessageSeen - GroupId mismatch", {
          messageGroupId: message.groupId.toString(),
          requestedGroupId: groupId.toString(),
        });
        return;
      }

      const group = await Group.findById(groupId);
      if (!group) {
        // console.log("❌ [GROUP_SEEN] Group not found"); // [DEBUG - Removed for production]
        return;
      }

      // Check if user is a member
      const userIdStr = userId.toString();
      const isMember =
        group.admin.toString() === userIdStr ||
        group.members.some((m) => m.toString() === userIdStr);
      if (!isMember) {
        // console.log("❌ [GROUP_SEEN] User not a member"); // [DEBUG - Removed for production]
        return;
      }

      // ✅ FIX: Skip if user is the sender of the message
      // Sender should not be added to seenBy - they sent it, they didn't "see" it
      const messageSenderId = message.senderId._id
        ? message.senderId._id.toString()
        : message.senderId.toString();
      if (messageSenderId === userIdStr) {
        console.log(
          "⏭️  [GROUP_SEEN] Skipping - user is the sender of this message",
        );
        return;
      }

      // Check if already seen by this user - normalize IDs for comparison
      const alreadySeen = message.seenBy.some((s) => {
        if (!s || !s.userId) return false;
        const seenUserId = s.userId._id
          ? s.userId._id.toString()
          : s.userId.toString();
        return seenUserId === userIdStr;
      });

      // console.log("🔍 [GROUP_SEEN] Check:", {
      //   messageId,
      //   userId: userIdStr,
      //   currentSeenBy: message.seenBy.length,
      //   alreadySeen,
      // });

      if (!alreadySeen) {
        // User hasn't seen this message yet - update database
        message.seenBy.push({
          userId: userId,
          seenAt: new Date(),
        });
        await message.save();

        // console.log("✅ [GROUP_SEEN] Database updated:", { // [DEBUG - Removed for production]
        // messageId,
        // newSeenByCount: message.seenBy.length,
        // });
      } else {
        // console.log(
        //   "⏭️  [GROUP_SEEN] Already seen by user, but will send current seenBy status"
        // );
      }

      // Populate seenBy for sending to clients (do this for both new and existing)
      await message.populate("seenBy.userId", "fullname profilePic");
      // ✅ FIX: Also populate full message data (like reactions do)
      // This ensures clients receive updated senderId.fullname and other fields
      await message.populate("senderId", "fullname profilePic");
      await message.populate("reactions.userId", "fullname profilePic");
      await message.populate("listenedBy.userId", "fullname profilePic");
      await message.populate({
        path: "replyTo",
        select:
          "text image audio video file sticker senderId receiverId createdAt",
        populate: {
          path: "senderId",
          select: "fullname profilePic",
        },
      });

      // Deduplicate seenBy before sending (in case of any duplicates from population)
      const seenByMap = new Map();
      message.seenBy.forEach((seen) => {
        const seenUserId =
          seen.userId?._id?.toString() || seen.userId?.toString();
        if (seenUserId && !seenByMap.has(seenUserId)) {
          seenByMap.set(seenUserId, seen);
        }
      });
      const deduplicatedSeenBy = Array.from(seenByMap.values());

      // ✅ FIX: Convert to object and include full message data
      const messageObj = message.toObject ? message.toObject() : message;
      messageObj.seenBy = deduplicatedSeenBy; // Use deduplicated seenBy

      // Notify all group members about the seen update
      // Even if alreadySeen=true, other members need to know the current seenBy status
      // ✅ FIX: Use emitToUser to notify ALL devices of each member (not just first socket)
      const allMembers = [group.admin, ...group.members];
      allMembers.forEach((memberId) => {
        const memberIdStr = memberId.toString();
        emitToUser(memberIdStr, "groupMessageSeenUpdate", {
          messageId,
          groupId,
          seenBy: deduplicatedSeenBy,
          userId: userId,
          message: messageObj, // ✅ FIX: Include full message for UI consistency
        });
      });
    } catch (error) {
      console.error(
        "❌ [GROUP_SEEN] Error updating group message seen status:",
        error,
      );
    }
  });

  // ========== WebRTC Call Signaling Events ==========

  // Call Initiation
  socket.on(
    "call:initiate",
    async ({ callId, receiverId, callType, callerInfo }) => {
      try {
        if (!userId || !receiverId || !callType) return;

        const receiverSocketId = getReceiverSocketId(receiverId);

        if (!receiverSocketId) {
          // Receiver is offline - allow the call but set up timeout (like Telegram)
          // Store as pending call
          const timeoutId = setTimeout(async () => {
            // After 60 seconds, cancel the call if still pending
            const pendingCall = pendingCalls.get(callId);
            if (pendingCall) {
              // Save missed call to database (user was offline)
              try {
                const savedCall = await createCallRecord({
                  callerId: pendingCall.callerId,
                  receiverId: pendingCall.receiverId,
                  groupId: null,
                  callType: pendingCall.callType,
                  status: "missed",
                  duration: 0,
                  startedAt: pendingCall.startedAt || pendingCall.createdAt,
                  endedAt: new Date(),
                });
                // console.log( // [DEBUG - Removed for production]
                // "✅ Offline missed call record saved to database:",
                // {
                // callId: savedCall._id,
                // callerId: pendingCall.callerId,
                // receiverId: pendingCall.receiverId,
                // }
                // );

                // Send push notification for missed call
                try {
                  const { sendMissedCallNotification } =
                    await import("../services/pushNotification.service.js");
                  await sendMissedCallNotification(pendingCall.receiverId, {
                    callId: savedCall._id,
                    callerId: pendingCall.callerId,
                    callType: pendingCall.callType,
                  });
                } catch (pushError) {
                  console.error(
                    "Failed to send missed call push notification:",
                    pushError,
                  );
                }

                // Send mobile push notification for missed call (Flutter)
                try {
                  const { sendMobileMissedCallNotification } =
                    await import("../services/mobilePushNotification.service.js");
                  await sendMobileMissedCallNotification(
                    pendingCall.receiverId,
                    {
                      callId: savedCall._id,
                      callerId: pendingCall.callerId,
                      callType: pendingCall.callType,
                    },
                  );
                } catch (pushError) {
                  console.error(
                    "Failed to send mobile missed call push notification:",
                    pushError,
                  );
                }
              } catch (saveError) {
                console.error(
                  "❌ Error saving offline missed call record:",
                  saveError,
                );
              }

              // Notify caller that call timed out
              const callerSocketId = getReceiverSocketId(pendingCall.callerId);
              if (callerSocketId) {
                io.to(callerSocketId).emit("call:failed", {
                  callId,
                  reason: "User is offline",
                });
              }
              // Clean up
              pendingCalls.delete(callId);
            }
          }, 60000); // 60 seconds timeout

          // MULTI-DEVICE: Track callerSocketId for routing WebRTC answer/ICE back
          pendingCalls.set(callId, {
            callerId: userId,
            callerSocketId: socket.id, // Track which socket initiated the call
            receiverId: receiverId,
            callType,
            callerInfo,
            createdAt: new Date(),
            startedAt: new Date(), // When call was initiated
            timeoutId,
          });

          // Send push notification for incoming call (receiver is offline)
          try {
            const { sendCallNotification } =
              await import("../services/pushNotification.service.js");
            await sendCallNotification(receiverId, {
              callId,
              callerId: userId,
              callType,
            });
          } catch (pushError) {
            console.error("Failed to send call push notification:", pushError);
          }

          // Send mobile push notification for incoming call (Flutter CallKit)
          try {
            const { sendMobileCallNotification } =
              await import("../services/mobilePushNotification.service.js");
            await sendMobileCallNotification(receiverId, {
              callId,
              callerId: userId,
              callType,
            });
          } catch (pushError) {
            console.error(
              "Failed to send mobile call push notification:",
              pushError,
            );
          }

          // Notify caller that call is ringing (even though user is offline)
          // This allows the UI to show "calling" state
          io.to(socket.id).emit("call:ringing", {
            callId,
            receiverId,
          });

          return;
        }

        // Receiver is online - proceed with normal call flow
        // Store call info with timestamps
        // MULTI-DEVICE: Track callerSocketId for routing WebRTC answer/ICE back
        activeCalls.set(callId, {
          callerId: userId,
          callerSocketId: socket.id, // Track which socket initiated the call
          receiverId: receiverId,
          callType,
          status: "ringing",
          createdAt: new Date(),
          startedAt: new Date(), // When call was initiated
          answeredAt: null, // When call was answered (if answered)
        });

        // MULTI-DEVICE: Send call invitation to ALL receiver's devices via socket
        const deviceCount = emitToUser(receiverId, "call:incoming", {
          callId,
          callerId: userId,
          callerInfo,
          callType,
        });

        logger.info("📞 [Call] Sent call:incoming to all receiver devices", {
          callId,
          receiverId,
          deviceCount,
        });

        // Also send mobile push notification (for background/locked screen CallKit)
        try {
          const { sendMobileCallNotification } =
            await import("../services/mobilePushNotification.service.js");
          await sendMobileCallNotification(receiverId, {
            callId,
            callerId: userId,
            callType,
          });
        } catch (pushError) {
          console.error(
            "Failed to send mobile call push notification:",
            pushError,
          );
        }

        // Notify caller that call is ringing
        io.to(socket.id).emit("call:ringing", {
          callId,
          receiverId,
        });

        // Set timeout for online users too (60 seconds)
        setTimeout(async () => {
          const callInfo = activeCalls.get(callId);
          if (callInfo && callInfo.status === "ringing") {
            // Call not answered after 60 seconds
            // Save missed call to database
            try {
              await createCallRecord({
                callerId: callInfo.callerId,
                receiverId: callInfo.receiverId,
                groupId: null,
                callType: callInfo.callType,
                status: "missed",
                duration: 0,
                startedAt: callInfo.startedAt || callInfo.createdAt,
                endedAt: new Date(),
              });
            } catch (saveError) {
              console.error("Error saving missed call record:", saveError);
            }

            activeCalls.delete(callId);

            // MULTI-DEVICE: Notify all caller's devices
            emitToUser(callInfo.callerId, "call:failed", {
              callId,
              reason: "No answer",
            });

            // MULTI-DEVICE: Notify all receiver's devices
            emitToUser(callInfo.receiverId, "call:missed", {
              callId,
              callerId: callInfo.callerId,
            });
          }
        }, 60000); // 60 seconds timeout
      } catch (error) {
        console.error("Error in call:initiate:", error);
        io.to(socket.id).emit("call:failed", {
          callId,
          reason: "Failed to initiate call",
        });
      }
    },
  );

  // Call Answer
  socket.on("call:answer", async ({ callId, answer }) => {
    try {
      // 🔥 CRITICAL: Check both activeCalls AND pendingCalls
      // When receiver was offline (push notification), call is in pendingCalls
      // When receiver was online (socket), call is in activeCalls
      let callInfo = activeCalls.get(callId);
      let wasInPendingCalls = false;

      if (!callInfo) {
        // Check pendingCalls (user was offline, received push notification)
        callInfo = pendingCalls.get(callId);
        wasInPendingCalls = true;

        if (callInfo) {
          // Clear the timeout since call is being answered
          if (callInfo.timeoutId) {
            clearTimeout(callInfo.timeoutId);
          }
          // Move from pendingCalls to activeCalls
          pendingCalls.delete(callId);
          activeCalls.set(callId, callInfo);
          console.log(
            `📞 [Call] Moved call ${callId} from pendingCalls to activeCalls`,
          );
        }
      }

      if (!callInfo) {
        console.log(`❌ [Call] Call not found: ${callId}`);
        io.to(socket.id).emit("call:failed", {
          callId,
          reason: "Call not found",
        });
        return;
      }

      if (callInfo.receiverId.toString() !== userId.toString()) {
        // Only receiver can answer
        console.log(
          `⚠️ [Call] Wrong user trying to answer. Expected: ${callInfo.receiverId}, Got: ${userId}`,
        );
        return;
      }

      // 🔥 CRITICAL FIX: If call is already answered, skip processing
      // This prevents multi-device race conditions where second socket overwrites
      // the answeredBySocketId, causing WebRTC offers to go to wrong socket
      if (callInfo.status === "answered" && callInfo.answeredBySocketId) {
        console.log(
          `⚠️ [Call] Call ${callId} already answered on socket ${callInfo.answeredBySocketId}, ignoring duplicate from ${socket.id}`,
        );
        // Notify this socket that call was answered elsewhere
        io.to(socket.id).emit("call:answered-elsewhere", {
          callId,
          answeredByDeviceId: callInfo.answeredBySocketId,
          message: "Call was already answered on another device",
        });
        return;
      }

      // Update call status and track when call was answered
      callInfo.status = "answered";
      callInfo.answeredAt = new Date();
      // MULTI-DEVICE: Track which socket answered the call
      callInfo.answeredBySocketId = socket.id;
      activeCalls.set(callId, callInfo);

      console.log(
        `✅ [Call] Call ${callId} answered by ${userId} on socket ${socket.id}`,
      );

      // ═══════════════════════════════════════════════════════════════════════
      // MULTI-DEVICE: Notify receiver's OTHER devices that call was answered elsewhere
      // This stops ringing on other devices (like Telegram/WhatsApp behavior)
      // ═══════════════════════════════════════════════════════════════════════
      emitToUserExcept(
        callInfo.receiverId,
        socket.id,
        "call:answered-elsewhere",
        {
          callId,
          answeredByDeviceId: socket.id,
          message: "Call was answered on another device",
        },
      );

      logger.info("📞 [Call] Notified other devices about answered call", {
        callId,
        receiverId: callInfo.receiverId,
        answeringSocketId: socket.id,
        otherDevicesNotified:
          getAllUserSocketIds(callInfo.receiverId).length - 1,
      });

      // MULTI-DEVICE: Notify ALL caller's devices that call was answered
      const callerDeviceCount = emitToUser(callInfo.callerId, "call:answered", {
        callId,
        receiverId: userId,
      });

      console.log(
        `📤 [Call] Emitted call:answered to ${callerDeviceCount} caller device(s) for caller ${callInfo.callerId}`,
      );

      // Forward WebRTC answer if provided (only to the specific caller socket that initiated)
      // For now, send to all caller devices - the WebRTC logic will handle which one connects
      if (answer) {
        emitToUser(callInfo.callerId, "webrtc:answer", {
          callId,
          answer,
        });
      }
    } catch (error) {
      console.error("Error in call:answer:", error);
    }
  });

  // Call Reject
  socket.on("call:reject", async ({ callId, reason }) => {
    try {
      // 🔥 Check both activeCalls AND pendingCalls (same as call:answer)
      let callInfo = activeCalls.get(callId);
      let wasInPendingCalls = false;

      if (!callInfo) {
        // Check pendingCalls (user was offline, received push notification)
        callInfo = pendingCalls.get(callId);
        wasInPendingCalls = true;

        if (callInfo) {
          // Clear the timeout since call is being rejected
          if (callInfo.timeoutId) {
            clearTimeout(callInfo.timeoutId);
          }
        }
      }

      if (!callInfo) {
        console.log(`⚠️ [Call] Call not found for reject: ${callId}`);
        return;
      }

      // Determine status based on reason
      const status = reason === "busy" ? "busy" : "rejected";

      console.log(
        `🚫 [Call] Call ${callId} rejected by ${userId} (reason: ${status})`,
      );

      // Save rejected call to database
      try {
        const savedCall = await createCallRecord({
          callerId: callInfo.callerId,
          receiverId: callInfo.receiverId,
          groupId: null,
          callType: callInfo.callType,
          status: status,
          duration: 0,
          startedAt: callInfo.startedAt || callInfo.createdAt,
          endedAt: new Date(),
        });
        // console.log("✅ Rejected call record saved to database:", { // [DEBUG - Removed for production]
        // callId: savedCall._id,
        // callerId: callInfo.callerId,
        // receiverId: callInfo.receiverId,
        // });
      } catch (saveError) {
        console.error("❌ Error saving rejected call record:", saveError);
      }

      // MULTI-DEVICE: Notify ALL caller's devices with appropriate event
      if (reason === "busy") {
        // User is already in another call
        emitToUser(callInfo.callerId, "call:busy", {
          callId,
          receiverId: userId,
        });
      } else {
        emitToUser(callInfo.callerId, "call:rejected", {
          callId,
          reason: reason || "Call rejected",
          receiverId: userId,
        });
      }

      // MULTI-DEVICE: Notify all receiver's OTHER devices that call was rejected on this device
      emitToUserExcept(
        callInfo.receiverId,
        socket.id,
        "call:rejected-elsewhere",
        {
          callId,
          rejectedByDeviceId: socket.id,
        },
      );

      // 🔥 CRITICAL: Send push notification to CALLER to dismiss their call UI
      // This handles the case when caller's app is terminated/background
      try {
        const { sendMobileCallEndNotification } =
          await import("../services/mobilePushNotification.service.js");
        await sendMobileCallEndNotification(callInfo.callerId, {
          callId,
          reason: reason === "busy" ? "busy" : "rejected",
          endedBy: userId,
        });
      } catch (pushError) {
        console.error(
          "Failed to send call reject push notification:",
          pushError,
        );
      }

      // Remove call from both maps (whichever it was in)
      activeCalls.delete(callId);
      pendingCalls.delete(callId);
    } catch (error) {
      console.error("Error in call:reject:", error);
    }
  });

  // Call Cancel (caller cancels before receiver answers)
  socket.on("call:cancel", async ({ callId }) => {
    try {
      // Check active calls first
      let callInfo = activeCalls.get(callId);
      let isPending = false;

      // If not in active, check pending calls
      if (!callInfo) {
        const pendingCall = pendingCalls.get(callId);
        if (pendingCall) {
          callInfo = pendingCall;
          isPending = true;
          // Clear the pending call timeout
          if (pendingCall.timeoutId) {
            clearTimeout(pendingCall.timeoutId);
          }
        }
      }

      if (!callInfo) {
        return; // Call not found, nothing to cancel
      }

      // Only caller can cancel
      if (callInfo.callerId.toString() !== userId.toString()) {
        return;
      }

      // Save cancelled call to database
      try {
        await createCallRecord({
          callerId: callInfo.callerId,
          receiverId: callInfo.receiverId,
          groupId: null,
          callType: callInfo.callType,
          status: "cancelled",
          duration: 0,
          startedAt: callInfo.startedAt || callInfo.createdAt,
          endedAt: new Date(),
        });
      } catch (saveError) {
        console.error("❌ Error saving cancelled call record:", saveError);
      }

      // MULTI-DEVICE: Notify ALL receiver's devices that call was cancelled
      emitToUser(callInfo.receiverId, "call:cancelled", {
        callId,
        callerId: callInfo.callerId,
      });

      // MULTI-DEVICE: Also notify all caller's OTHER devices
      emitToUserExcept(callInfo.callerId, socket.id, "call:cancelled", {
        callId,
        callerId: callInfo.callerId,
      });

      // 🔥 CRITICAL: Send push notification to dismiss CallKit on receiver's device
      // This handles the case when receiver's app is terminated/background
      try {
        const { sendMobileCallCancelNotification } =
          await import("../services/mobilePushNotification.service.js");
        await sendMobileCallCancelNotification(callInfo.receiverId, {
          callId,
          callerId: callInfo.callerId,
        });
      } catch (pushError) {
        console.error(
          "Failed to send call cancel push notification:",
          pushError,
        );
      }

      // Clean up
      if (isPending) {
        pendingCalls.delete(callId);
      } else {
        activeCalls.delete(callId);
      }
    } catch (error) {
      console.error("Error in call:cancel:", error);
    }
  });

  // Call End
  socket.on("call:end", async ({ callId, reason, duration }) => {
    try {
      const callInfo = activeCalls.get(callId);
      if (!callInfo) return;

      // Determine call status based on reason
      let callStatus = "cancelled";
      if (reason === "ended" && callInfo.status === "answered") {
        callStatus = "answered";
      } else if (reason === "rejected") {
        callStatus = "rejected";
      } else if (reason === "no-answer" || reason === "missed") {
        callStatus = "missed";
      } else if (callInfo.status === "answered") {
        callStatus = "answered";
      }

      // Calculate duration if call was answered
      let callDuration = 0;
      const endedAt = new Date();
      if (callInfo.answeredAt) {
        // Call was answered, calculate actual duration
        callDuration = Math.floor((endedAt - callInfo.answeredAt) / 1000); // Duration in seconds
      } else if (duration !== undefined) {
        // Duration provided from frontend
        callDuration = duration;
      }

      // Save call record to database
      try {
        const savedCall = await createCallRecord({
          callerId: callInfo.callerId,
          receiverId: callInfo.receiverId,
          groupId: null, // 1-on-1 calls don't have groupId
          callType: callInfo.callType,
          status: callStatus,
          duration: callDuration,
          startedAt: callInfo.startedAt || callInfo.createdAt,
          endedAt: endedAt,
        });
        // console.log("✅ Call record saved to database:", { // [DEBUG - Removed for production]
        // callId: savedCall._id,
        // status: callStatus,
        // duration: callDuration,
        // callerId: callInfo.callerId,
        // receiverId: callInfo.receiverId,
        // });
      } catch (saveError) {
        console.error("❌ Error saving call record:", saveError);
        // Don't block the call end process if save fails
      }

      // MULTI-DEVICE: Notify ALL devices of BOTH parties (except the one that ended)
      emitToUserExcept(callInfo.callerId, socket.id, "call:ended", {
        callId,
        reason: reason || "Call ended",
      });

      emitToUserExcept(callInfo.receiverId, socket.id, "call:ended", {
        callId,
        reason: reason || "Call ended",
      });

      // 🔥 CRITICAL: Send push notification to OTHER party to dismiss their call UI
      // This handles the case when other party's app is terminated/background
      try {
        const { sendMobileCallEndNotification } =
          await import("../services/mobilePushNotification.service.js");

        // Determine who is the other party (not the one who ended the call)
        const otherPartyId =
          userId.toString() === callInfo.callerId.toString()
            ? callInfo.receiverId
            : callInfo.callerId;

        await sendMobileCallEndNotification(otherPartyId, {
          callId,
          reason: reason || "ended",
          endedBy: userId,
        });
      } catch (pushError) {
        console.error("Failed to send call end push notification:", pushError);
      }

      // Remove call from active calls
      activeCalls.delete(callId);
    } catch (error) {
      console.error("Error in call:end:", error);
    }
  });

  // WebRTC Offer - MULTI-DEVICE: Send to ALL receiver sockets (handles engine restart)
  socket.on("webrtc:offer", ({ callId, offer, receiverId }) => {
    try {
      console.log(`📤 [WebRTC] Offer received from ${userId}:`);
      console.log(`   ├─ callId: ${callId}`);
      console.log(`   └─ receiverId: ${receiverId}`);

      // 🔥 CRITICAL FIX: Send offer to ALL sockets for the receiver
      // This handles the case where the receiver's Flutter engine restarts
      // after accepting the call, creating a NEW socket connection.
      // The old socket (answeredBySocketId) might be dead.
      const allReceiverSockets = getReceiverSocketIds(receiverId);

      if (allReceiverSockets && allReceiverSockets.length > 0) {
        // Send to ALL sockets - one of them will have the WebRTC listeners
        let sentCount = 0;
        for (const socketId of allReceiverSockets) {
          io.to(socketId).emit("webrtc:offer", {
            callId,
            offer,
            callerId: userId,
          });
          sentCount++;
        }
        console.log(
          `✅ [WebRTC] Offer forwarded to ${sentCount} socket(s) for receiver ${receiverId}`,
        );

        // Log which sockets received the offer
        console.log(`   └─ Sockets: ${allReceiverSockets.join(", ")}`);

        // Also log if the answeredBySocketId is still in the list
        const callInfo = activeCalls.get(callId);
        if (callInfo && callInfo.answeredBySocketId) {
          const stillActive = allReceiverSockets.includes(
            callInfo.answeredBySocketId,
          );
          console.log(
            `   └─ Original answering socket ${callInfo.answeredBySocketId}: ${stillActive ? "still active" : "DISCONNECTED"}`,
          );
        }
      } else {
        console.log(`⚠️ [WebRTC] Receiver ${receiverId} not connected`);
      }
    } catch (error) {
      console.error("Error in webrtc:offer:", error);
    }
  });

  // WebRTC Answer - MULTI-DEVICE: Send to ALL caller sockets
  socket.on("webrtc:answer", ({ callId, answer, callerId }) => {
    try {
      console.log(`📤 [WebRTC] Answer received from ${userId}:`);
      console.log(`   ├─ callId: ${callId}`);
      console.log(`   └─ callerId: ${callerId}`);

      // 🔥 CRITICAL FIX: Send answer to ALL sockets for the caller
      // This handles the case where the caller might have multiple sockets
      const allCallerSockets = getReceiverSocketIds(callerId);

      if (allCallerSockets && allCallerSockets.length > 0) {
        let sentCount = 0;
        for (const socketId of allCallerSockets) {
          io.to(socketId).emit("webrtc:answer", {
            callId,
            answer,
            receiverId: userId,
          });
          sentCount++;
        }
        console.log(
          `✅ [WebRTC] Answer forwarded to ${sentCount} socket(s) for caller ${callerId}`,
        );
      } else {
        console.log(`⚠️ [WebRTC] Caller ${callerId} not connected`);
      }
    } catch (error) {
      console.error("Error in webrtc:answer:", error);
    }
  });

  // Mute Status Update (1-on-1 calls)
  socket.on("call:mute-status", ({ callId, receiverId, isMuted }) => {
    try {
      const receiverSocketId = getReceiverSocketId(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("call:mute-status", {
          callId,
          isMuted,
        });
      }
    } catch (error) {
      console.error("Error in call:mute-status:", error);
    }
  });

  // ICE Candidate Exchange - MULTI-DEVICE: Send to ALL target sockets
  socket.on("webrtc:ice-candidate", ({ callId, candidate, receiverId }) => {
    try {
      if (!callId || !candidate || !receiverId) {
        return;
      }

      // 🔥 CRITICAL FIX: Send ICE candidates to ALL sockets for the target
      // ICE candidates are critical for connection establishment
      const allTargetSockets = getReceiverSocketIds(receiverId);

      if (allTargetSockets && allTargetSockets.length > 0) {
        for (const socketId of allTargetSockets) {
          io.to(socketId).emit("webrtc:ice-candidate", {
            callId,
            candidate,
            senderId: userId,
          });
        }
        // Don't log ICE candidates to reduce noise (there are many)
      }
    } catch (error) {
      console.error("Error in webrtc:ice-candidate:", error);
    }
  });

  // ========== Group Call (SFU-style) Signaling Events ==========

  // Join group call room
  socket.on(
    "groupcall:join",
    async ({ roomId, groupId, callType, userInfo }) => {
      try {
        if (!userId || !roomId || !groupId) return;

        // Verify user is member of group
        const group = await Group.findById(groupId);
        if (!group) {
          io.to(socket.id).emit("groupcall:error", {
            roomId,
            error: "Group not found",
          });
          return;
        }

        const userIdStr = userId.toString();
        const isMember =
          group.admin.toString() === userIdStr ||
          group.members.some((m) => m.toString() === userIdStr);
        if (!isMember) {
          io.to(socket.id).emit("groupcall:error", {
            roomId,
            error: "You are not a member of this group",
          });
          return;
        }

        // Get or create room
        let room = groupCallRooms.get(roomId);
        const isNewRoom = !room;
        if (!room) {
          room = {
            groupId,
            callType: callType || "video",
            participants: [],
            createdAt: new Date(),
          };
          groupCallRooms.set(roomId, room);

          // If this is a new room, notify all group members about the group call
          const allMembers = [group.admin, ...group.members];

          // 🔥 Send push notifications AND socket events to all members
          for (const memberId of allMembers) {
            const memberIdStr = memberId.toString();
            // Don't notify the person who started the call
            if (memberIdStr !== userIdStr) {
              const memberSocketId = getReceiverSocketId(memberIdStr);

              // Send socket event if online
              if (memberSocketId) {
                io.to(memberSocketId).emit("groupcall:invitation", {
                  roomId,
                  groupId,
                  callType: room.callType,
                  callerInfo: userInfo || {},
                  groupName: group.name || "Group",
                });
              }

              // 🔥 ALWAYS send push notification for CallKit (even if online)
              // This ensures CallKit UI shows up on iOS/Android
              try {
                const { sendMobileGroupCallNotification } =
                  await import("../services/mobilePushNotification.service.js");
                await sendMobileGroupCallNotification(memberIdStr, {
                  roomId,
                  groupId,
                  groupName: group.name || "Group",
                  callerId: userId,
                  callType: room.callType,
                });
              } catch (pushError) {
                console.error(
                  `Failed to send group call push notification to ${memberIdStr}:`,
                  pushError.message,
                );
              }
            }
          }
        }

        // Check if user already in room
        const existingParticipant = room.participants.find(
          (p) => p.userId === userIdStr,
        );
        if (existingParticipant) {
          // Update socket ID if reconnecting
          existingParticipant.socketId = socket.id;
        } else {
          // Add new participant
          room.participants.push({
            userId: userIdStr,
            socketId: socket.id,
            userInfo: userInfo || {},
            tracks: { audio: true, video: callType === "video" },
            joinedAt: new Date(),
          });
        }

        // Notify existing participants about new join
        room.participants.forEach((participant) => {
          if (participant.socketId !== socket.id) {
            io.to(participant.socketId).emit("groupcall:participant-joined", {
              roomId,
              participant: {
                userId: userIdStr,
                userInfo: userInfo || {},
                tracks: { audio: true, video: callType === "video" },
              },
            });
          }
        });

        // Step C: Send room state immediately (even if empty)
        // This ensures client can render UI immediately
        const existingParticipants = room.participants
          .filter((p) => p.socketId !== socket.id)
          .map((p) => ({
            userId: p.userId,
            userInfo: p.userInfo,
            tracks: p.tracks,
          }));

        // Send room state immediately (Step C: room ready / initial state)
        io.to(socket.id).emit("groupcall:joined", {
          roomId,
          participants: existingParticipants,
          callType: room.callType,
          roomState: {
            totalParticipants: room.participants.length,
            callType: room.callType,
          },
        });
      } catch (error) {
        console.error("Error in groupcall:join:", error);
        io.to(socket.id).emit("groupcall:error", {
          roomId,
          error: "Failed to join group call",
        });
      }
    },
  );

  // Leave group call room
  socket.on("groupcall:leave", ({ roomId }) => {
    try {
      if (!userId || !roomId) return;

      const room = groupCallRooms.get(roomId);
      if (!room) return;

      const userIdStr = userId.toString();
      const participantIndex = room.participants.findIndex(
        (p) => p.userId === userIdStr,
      );

      if (participantIndex !== -1) {
        room.participants.splice(participantIndex, 1);

        // Notify other participants
        room.participants.forEach((participant) => {
          io.to(participant.socketId).emit("groupcall:participant-left", {
            roomId,
            userId: userIdStr,
          });
        });

        // Clean up room if empty
        if (room.participants.length === 0) {
          groupCallRooms.delete(roomId);
        }
      }
    } catch (error) {
      console.error("Error in groupcall:leave:", error);
    }
  });

  // Update participant tracks (mute/unmute, camera on/off)
  socket.on("groupcall:update-tracks", ({ roomId, tracks }) => {
    try {
      if (!userId || !roomId) return;

      const room = groupCallRooms.get(roomId);
      if (!room) return;

      const userIdStr = userId.toString();
      const participant = room.participants.find((p) => p.userId === userIdStr);

      if (participant) {
        participant.tracks = { ...participant.tracks, ...tracks };

        // Notify other participants
        room.participants.forEach((p) => {
          if (p.socketId !== socket.id) {
            io.to(p.socketId).emit("groupcall:tracks-updated", {
              roomId,
              userId: userIdStr,
              tracks: participant.tracks,
            });
          }
        });
      }
    } catch (error) {
      console.error("Error in groupcall:update-tracks:", error);
    }
  });

  // Screen share start (group call)
  socket.on("groupcall:screen-share-start", ({ roomId, trackId }) => {
    try {
      if (!userId || !roomId) return;

      const room = groupCallRooms.get(roomId);
      if (!room) return;

      const userIdStr = userId.toString();
      const participant = room.participants.find((p) => p.userId === userIdStr);

      if (participant) {
        participant.screenSharing = true;
        participant.screenShareTrackId = trackId;

        // Notify other participants
        room.participants.forEach((p) => {
          if (p.socketId !== socket.id) {
            io.to(p.socketId).emit("groupcall:screen-share-started", {
              roomId,
              userId: userIdStr,
              trackId,
            });
          }
        });
      }
    } catch (error) {
      console.error("Error in groupcall:screen-share-start:", error);
    }
  });

  // Screen share stop (group call)
  socket.on("groupcall:screen-share-stop", ({ roomId }) => {
    try {
      if (!userId || !roomId) return;

      const room = groupCallRooms.get(roomId);
      if (!room) return;

      const userIdStr = userId.toString();
      const participant = room.participants.find((p) => p.userId === userIdStr);

      if (participant) {
        participant.screenSharing = false;
        participant.screenShareTrackId = null;

        // Notify other participants
        room.participants.forEach((p) => {
          if (p.socketId !== socket.id) {
            io.to(p.socketId).emit("groupcall:screen-share-stopped", {
              roomId,
              userId: userIdStr,
            });
          }
        });
      }
    } catch (error) {
      console.error("Error in groupcall:screen-share-stop:", error);
    }
  });

  // WebRTC signaling for group calls (SFU-style)
  // Each participant sends offer/answer to SFU (in this case, signaling server forwards)
  socket.on("groupcall:webrtc-offer", ({ roomId, offer, targetUserId }) => {
    try {
      if (!userId || !roomId) return;

      const room = groupCallRooms.get(roomId);
      if (!room) return;

      // If targetUserId specified, send to that participant (for SFU, this would go to SFU server)
      // For now, we'll broadcast to all participants (simplified SFU)
      if (targetUserId) {
        const targetParticipant = room.participants.find(
          (p) => p.userId === targetUserId,
        );
        if (targetParticipant) {
          io.to(targetParticipant.socketId).emit("groupcall:webrtc-offer", {
            roomId,
            offer,
            senderId: userId,
          });
        }
      } else {
        // Broadcast to all other participants (for mesh or simplified SFU)
        room.participants.forEach((participant) => {
          if (participant.socketId !== socket.id) {
            io.to(participant.socketId).emit("groupcall:webrtc-offer", {
              roomId,
              offer,
              senderId: userId,
            });
          }
        });
      }
    } catch (error) {
      console.error("Error in groupcall:webrtc-offer:", error);
    }
  });

  socket.on("groupcall:webrtc-answer", ({ roomId, answer, targetUserId }) => {
    try {
      if (!userId || !roomId) return;

      const room = groupCallRooms.get(roomId);
      if (!room) return;

      if (targetUserId) {
        const targetParticipant = room.participants.find(
          (p) => p.userId === targetUserId,
        );
        if (targetParticipant) {
          io.to(targetParticipant.socketId).emit("groupcall:webrtc-answer", {
            roomId,
            answer,
            senderId: userId,
          });
        }
      }
    } catch (error) {
      console.error("Error in groupcall:webrtc-answer:", error);
    }
  });

  socket.on(
    "groupcall:webrtc-ice-candidate",
    ({ roomId, candidate, targetUserId }) => {
      try {
        if (!userId || !roomId || !candidate) return;

        const room = groupCallRooms.get(roomId);
        if (!room) {
          return;
        }

        if (targetUserId) {
          // Send to specific target user
          const targetParticipant = room.participants.find(
            (p) => p.userId === targetUserId,
          );
          if (targetParticipant) {
            io.to(targetParticipant.socketId).emit(
              "groupcall:webrtc-ice-candidate",
              {
                roomId,
                candidate,
                senderId: userId,
              },
            );
          }
        } else {
          // Broadcast to all other participants (fallback)
          room.participants.forEach((participant) => {
            if (participant.socketId !== socket.id) {
              io.to(participant.socketId).emit(
                "groupcall:webrtc-ice-candidate",
                {
                  roomId,
                  candidate,
                  senderId: userId,
                },
              );
            }
          });
        }
      } catch (error) {
        console.error("Error in groupcall:webrtc-ice-candidate:", error);
      }
    },
  );

  // Real-time location sharing handlers
  socket.on(
    "location:update",
    async ({ lat, lng, speed, heading, accuracy }) => {
      if (!userId || !lat || !lng) return;

      try {
        const userIdStr = userId.toString();
        const locationData = {
          lat: parseFloat(lat),
          lng: parseFloat(lng),
          speed: speed ? parseFloat(speed) : null,
          heading: heading ? parseFloat(heading) : null,
          accuracy: accuracy ? parseFloat(accuracy) : null,
          timestamp: Date.now(),
          socketId: socket.id,
        };

        // Store user location
        userLocations.set(userIdStr, locationData);

        // Get user info for broadcasting
        const user = await User.findById(userId).select("fullname profilePic");

        // Broadcast to nearby users (friends/contacts)
        // For now, broadcast to all online users (can be filtered by privacy settings)
        const locationUpdate = {
          userId: userIdStr,
          ...locationData,
          user: {
            fullname: user?.fullname || "Unknown",
            profilePic: user?.profilePic || null,
          },
        };

        // Emit to all connected sockets (they can filter by privacy on client side)
        socket.broadcast.emit("location:peer", locationUpdate);

        // Also emit to sender for confirmation
        socket.emit("location:confirmed", locationUpdate);
      } catch (error) {
        console.error("Error handling location update:", error);
      }
    },
  );

  socket.on("location:join", ({ roomId }) => {
    if (!roomId) return;
    socket.join(`location:${roomId}`);

    if (!locationRooms.has(roomId)) {
      locationRooms.set(roomId, new Set());
    }
    locationRooms.get(roomId).add(userId?.toString());
  });

  socket.on("location:leave", ({ roomId }) => {
    if (!roomId) return;
    socket.leave(`location:${roomId}`);

    if (locationRooms.has(roomId)) {
      locationRooms.get(roomId).delete(userId?.toString());
      if (locationRooms.get(roomId).size === 0) {
        locationRooms.delete(roomId);
      }
    }
  });

  socket.on("location:request", async ({ targetUserId }) => {
    if (!userId || !targetUserId) return;

    try {
      const targetLocation = userLocations.get(targetUserId.toString());
      if (targetLocation) {
        const user = await User.findById(targetUserId).select(
          "fullname profilePic",
        );
        socket.emit("location:response", {
          userId: targetUserId.toString(),
          ...targetLocation,
          user: {
            fullname: user?.fullname || "Unknown",
            profilePic: user?.profilePic || null,
          },
        });
      }
    } catch (error) {
      console.error("Error handling location request:", error);
    }
  });

  // Cleanup active calls on disconnect
  socket.on("disconnect", (reason) => {
    // Track disconnection for rate limit metrics
    trackSocketDisconnection(socket);

    logger.debug("Socket user disconnected", {
      socketId: socket.id,
      userId: userId,
      reason,
    });

    // Clean up any pending calls where this user was the caller
    if (userId) {
      const userIdStr = userId.toString();
      for (const [callId, pendingCall] of pendingCalls.entries()) {
        if (pendingCall.callerId.toString() === userIdStr) {
          clearTimeout(pendingCall.timeoutId);
          pendingCalls.delete(callId);
          logger.debug("Cleaned up pending call on disconnect", {
            callId,
            userId: userIdStr,
          });
        }
      }
    }

    // MULTI-DEVICE: Remove only THIS socket from user's set
    if (userId) {
      const userIdStr = userId.toString();
      const hadSocketsBefore = getAllUserSocketIds(userIdStr).length;
      removeUserSocket(userIdStr, socket.id);
      const hasSocketsAfter = getAllUserSocketIds(userIdStr).length;

      logger.debug("Removed socket from user", {
        userId: userIdStr,
        socketId: socket.id,
        remainingDevices: hasSocketsAfter,
        wasLastDevice: hadSocketsBefore > 0 && hasSocketsAfter === 0,
      });

      // MULTI-DEVICE: Only cleanup calls if this was the SPECIFIC socket in the call
      // Check if this socket was the answering socket for any active call
      for (const [callId, callInfo] of activeCalls.entries()) {
        // Only end call if this specific socket was the one in the call
        const wasCallerSocket = callInfo.callerId.toString() === userIdStr;
        const wasAnsweringSocket = callInfo.answeredBySocketId === socket.id;

        if (wasCallerSocket || wasAnsweringSocket) {
          // This socket was actively in the call - notify other party
          const otherPartyId = wasCallerSocket
            ? callInfo.receiverId
            : callInfo.callerId;

          // MULTI-DEVICE: Notify ALL devices of other party
          emitToUser(otherPartyId, "call:ended", {
            callId,
            reason: "User disconnected",
          });

          activeCalls.delete(callId);
          logger.info("Call ended due to socket disconnect", {
            callId,
            disconnectedSocket: socket.id,
            wasCallerSocket,
            wasAnsweringSocket,
          });
        }
      }

      // Cleanup group calls - only remove this specific socket
      for (const [roomId, room] of groupCallRooms.entries()) {
        const participantIndex = room.participants.findIndex(
          (p) => p.socketId === socket.id,
        );

        if (participantIndex !== -1) {
          room.participants.splice(participantIndex, 1);

          // Notify other participants
          room.participants.forEach((participant) => {
            io.to(participant.socketId).emit("groupcall:participant-left", {
              roomId,
              userId: userIdStr,
            });
          });

          // Clean up room if empty
          if (room.participants.length === 0) {
            groupCallRooms.delete(roomId);
          }
        }
      }

      // MULTI-DEVICE: Only clean up location/broadcast offline if NO devices remain
      if (hasSocketsAfter === 0) {
        // Clean up location data
        userLocations.delete(userIdStr);
        // Remove from all location rooms
        locationRooms.forEach((userSet, roomId) => {
          userSet.delete(userIdStr);
          if (userSet.size === 0) {
            locationRooms.delete(roomId);
          }
        });

        // Notify others that user went offline (only when ALL devices disconnected)
        socket.broadcast.emit("location:offline", {
          userId: userIdStr,
        });

        const onlineUserIds = Array.from(userSockets.keys());
        io.emit("getOnlineUsers", onlineUserIds);
      }
    }
  });
});

// Note: getReceiverSocketId is already exported as function declaration
export { io, app, server, activeCalls, pendingCalls, emitToUser };
