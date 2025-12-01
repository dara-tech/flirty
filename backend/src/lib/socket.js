import { Server } from "socket.io";
import http from "http";
import express from "express";
import Message from "../model/message.model.js";
import Group from "../model/group.model.js";
import User from "../model/user.model.js";

const app = express();
const server = http.createServer(app);

// Allowed origins for Socket.io - must match Express CORS configuration
const getAllowedSocketOrigins = () => {
  const allowedOrigins = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    // Production URLs - add your Netlify URL here
    process.env.FRONTEND_URL, // e.g., https://your-app.netlify.app
    "https://flirty-ffpq.onrender.com"
  ].filter(Boolean); // Remove undefined values
  
  return allowedOrigins;
};

// Socket.io CORS origin checker - matches Express CORS logic
const socketCorsOrigin = (origin, callback) => {
  // Allow requests with no origin (mobile apps, Postman, etc.)
  if (!origin) {
    return callback(null, true);
  }
  
  const allowedOrigins = getAllowedSocketOrigins();
  
  // In development, allow all origins (for flexibility)
  // In production, only allow whitelisted origins
  if (process.env.NODE_ENV === 'development' || allowedOrigins.indexOf(origin) !== -1) {
    return callback(null, true);
  }
  
  // Origin not allowed
  return callback(new Error('Not allowed by Socket.io CORS'), false);
};

const io = new Server(server, {
  cors: {
    origin: socketCorsOrigin, // Function-based origin checking (matches Express)
    credentials: true, // Required for cookies/authentication
    methods: ['GET', 'POST'], // WebSocket uses GET/POST
    allowedHeaders: ['Content-Type', 'Authorization'],
  },
});

// ⚠️ Renamed userSocketMap to userSockets to avoid conflict
const userSockets = new Map(); // { userId: socketId }

// Store active calls (temporary, in-memory)
// In production, consider using Redis or database
const activeCalls = new Map(); // { callId: { callerId, receiverId, callType, status } }

export function getReceiverSocketId(userId) {
  if (!userId) return null;
  // Convert to string to ensure consistent lookup
  const userIdStr = typeof userId === 'string' ? userId : userId.toString();
  return userSockets.get(userIdStr);
}

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  const userId = socket.handshake.query.userId;

  if (userId) {
    // Ensure userId is stored as string for consistent lookup
    const userIdStr = typeof userId === 'string' ? userId : userId.toString();
    if (userSockets.has(userIdStr)) {
      console.log(`User ${userIdStr} reconnected, updating socket ID.`);
    }
    userSockets.set(userIdStr, socket.id);
    console.log(`Socket ${socket.id} mapped to user ${userIdStr}`);
  }

  io.emit("getOnlineUsers", Array.from(userSockets.keys()));

  socket.on("typing", ({ receiverId }) => {
    if (receiverId && userId) {
      const receiverSocketId = getReceiverSocketId(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("typing", { senderId: userId });
      }
    }
  });

  socket.on("stopTyping", ({ receiverId }) => {
    if (receiverId && userId) {
      const receiverSocketId = getReceiverSocketId(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("stopTyping", { senderId: userId });
      }
    }
  });

  // Editing indicator
  socket.on("editing", ({ receiverId }) => {
    if (receiverId && userId) {
      const receiverSocketId = getReceiverSocketId(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("editing", { senderId: userId });
      }
    }
  });

  socket.on("stopEditing", ({ receiverId }) => {
    if (receiverId && userId) {
      const receiverSocketId = getReceiverSocketId(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("stopEditing", { senderId: userId });
      }
    }
  });

  // Deleting indicator
  socket.on("deleting", ({ receiverId }) => {
    if (receiverId && userId) {
      const receiverSocketId = getReceiverSocketId(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("deleting", { senderId: userId });
      }
    }
  });

  socket.on("stopDeleting", ({ receiverId }) => {
    if (receiverId && userId) {
      const receiverSocketId = getReceiverSocketId(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("stopDeleting", { senderId: userId });
      }
    }
  });

  // Uploading photo indicator
  socket.on("uploadingPhoto", ({ receiverId }) => {
    if (receiverId && userId) {
      const receiverSocketId = getReceiverSocketId(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("uploadingPhoto", { senderId: userId });
      }
    }
  });

  socket.on("stopUploadingPhoto", ({ receiverId }) => {
    if (receiverId && userId) {
      const receiverSocketId = getReceiverSocketId(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("stopUploadingPhoto", { senderId: userId });
      }
    }
  });

  socket.on("messageSeen", async ({ messageId, senderId }) => {
    try {
      const message = await Message.findById(messageId);
      if (!message || message.seen) return;

      message.seen = true;
      message.seenAt = new Date();
      await message.save();

      console.log(`Message ${messageId} seen by receiver`);
      const senderSocketId = getReceiverSocketId(senderId);
      if (senderSocketId) {
        io.to(senderSocketId).emit("messageSeenUpdate", { 
          messageId, 
          seenAt: message.seenAt 
        });
      }
    } catch (error) {
      console.error("Error updating message seen status:", error);
    }
  });

  // Helper function to emit to all group members except sender
  const emitToGroupMembers = async (groupId, senderId, event, data) => {
    try {
      const group = await Group.findById(groupId).populate("admin", "fullname profilePic").populate("members", "fullname profilePic");
      if (!group) return;

      const allMembers = [group.admin, ...group.members];
      allMembers.forEach((member) => {
        const memberIdStr = member._id ? member._id.toString() : member.toString();
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
          senderName: sender?.fullname || "Someone"
        });
      } catch (error) {
        console.error("Error in groupTyping:", error);
      }
    }
  });

  socket.on("groupStopTyping", async ({ groupId }) => {
    if (groupId && userId) {
      await emitToGroupMembers(groupId, userId, "groupStopTyping", {
        groupId,
        senderId: userId
      });
    }
  });

  // Group editing indicator
  socket.on("groupEditing", async ({ groupId }) => {
    if (groupId && userId) {
      await emitToGroupMembers(groupId, userId, "groupEditing", {
        groupId,
        senderId: userId
      });
    }
  });

  socket.on("groupStopEditing", async ({ groupId }) => {
    if (groupId && userId) {
      await emitToGroupMembers(groupId, userId, "groupStopEditing", {
        groupId,
        senderId: userId
      });
    }
  });

  // Group deleting indicator
  socket.on("groupDeleting", async ({ groupId }) => {
    if (groupId && userId) {
      await emitToGroupMembers(groupId, userId, "groupDeleting", {
        groupId,
        senderId: userId
      });
    }
  });

  socket.on("groupStopDeleting", async ({ groupId }) => {
    if (groupId && userId) {
      await emitToGroupMembers(groupId, userId, "groupStopDeleting", {
        groupId,
        senderId: userId
      });
    }
  });

  // Group uploading photo indicator
  socket.on("groupUploadingPhoto", async ({ groupId }) => {
    if (groupId && userId) {
      await emitToGroupMembers(groupId, userId, "groupUploadingPhoto", {
        groupId,
        senderId: userId
      });
    }
  });

  socket.on("groupStopUploadingPhoto", async ({ groupId }) => {
    if (groupId && userId) {
      await emitToGroupMembers(groupId, userId, "groupStopUploadingPhoto", {
        groupId,
        senderId: userId
      });
    }
  });

  // Group message seen status
  socket.on("groupMessageSeen", async ({ messageId, groupId }) => {
    try {
      const message = await Message.findById(messageId).populate("senderId", "fullname");
      if (!message || !message.groupId) return;

      const group = await Group.findById(groupId);
      if (!group) return;

      // Check if user is a member
      const userIdStr = userId.toString();
      const isMember = group.admin.toString() === userIdStr || 
                       group.members.some(m => m.toString() === userIdStr);
      if (!isMember) return;

      // Check if already seen by this user - normalize IDs for comparison
      const alreadySeen = message.seenBy.some((s) => {
        if (!s || !s.userId) return false;
        const seenUserId = s.userId._id ? s.userId._id.toString() : s.userId.toString();
        return seenUserId === userIdStr;
      });

      if (!alreadySeen) {
        message.seenBy.push({
          userId: userId,
          seenAt: new Date()
        });
        await message.save();

        // Populate seenBy for sending to clients
        await message.populate("seenBy.userId", "fullname profilePic");

        // Deduplicate seenBy before sending (in case of any duplicates from population)
        const seenByMap = new Map();
        message.seenBy.forEach((seen) => {
          const seenUserId = seen.userId?._id?.toString() || seen.userId?.toString();
          if (seenUserId && !seenByMap.has(seenUserId)) {
            seenByMap.set(seenUserId, seen);
          }
        });
        const deduplicatedSeenBy = Array.from(seenByMap.values());

        // Notify all group members about the seen update
        const allMembers = [group.admin, ...group.members];
        allMembers.forEach((memberId) => {
          const memberIdStr = memberId.toString();
          const memberSocketId = getReceiverSocketId(memberIdStr);
          if (memberSocketId) {
            io.to(memberSocketId).emit("groupMessageSeenUpdate", {
              messageId,
              groupId,
              seenBy: deduplicatedSeenBy,
              userId: userId
            });
          }
        });
      }
    } catch (error) {
      console.error("Error updating group message seen status:", error);
    }
  });

  // ========== WebRTC Call Signaling Events ==========
  
  // Call Initiation
  socket.on("call:initiate", async ({ callId, receiverId, callType, callerInfo }) => {
    try {
      if (!userId || !receiverId || !callType) return;
      
      const receiverSocketId = getReceiverSocketId(receiverId);
      if (!receiverSocketId) {
        // Receiver is offline
        io.to(socket.id).emit("call:failed", {
          callId,
          reason: "User is offline",
        });
        return;
      }
      
      // Store call info
      activeCalls.set(callId, {
        callerId: userId,
        receiverId: receiverId,
        callType,
        status: "ringing",
        createdAt: new Date(),
      });
      
      // Send call invitation to receiver
      io.to(receiverSocketId).emit("call:incoming", {
        callId,
        callerId: userId,
        callerInfo,
        callType,
      });
      
      // Notify caller that call is ringing
      io.to(socket.id).emit("call:ringing", {
        callId,
        receiverId,
      });
      
      console.log(`Call ${callId} initiated: ${userId} -> ${receiverId} (${callType})`);
    } catch (error) {
      console.error("Error in call:initiate:", error);
      io.to(socket.id).emit("call:failed", {
        callId,
        reason: "Failed to initiate call",
      });
    }
  });
  
  // Call Answer
  socket.on("call:answer", ({ callId, answer }) => {
    try {
      const callInfo = activeCalls.get(callId);
      if (!callInfo) {
        io.to(socket.id).emit("call:failed", {
          callId,
          reason: "Call not found",
        });
        return;
      }
      
      if (callInfo.receiverId.toString() !== userId.toString()) {
        // Only receiver can answer
        return;
      }
      
      // Update call status
      callInfo.status = "answered";
      activeCalls.set(callId, callInfo);
      
      // Notify caller that call was answered
      const callerSocketId = getReceiverSocketId(callInfo.callerId);
      if (callerSocketId) {
        io.to(callerSocketId).emit("call:answered", {
          callId,
          receiverId: userId,
        });
      }
      
      // Forward WebRTC answer if provided
      if (answer) {
        io.to(callerSocketId).emit("webrtc:answer", {
          callId,
          answer,
        });
      }
      
      console.log(`Call ${callId} answered by ${userId}`);
    } catch (error) {
      console.error("Error in call:answer:", error);
    }
  });
  
  // Call Reject
  socket.on("call:reject", ({ callId, reason }) => {
    try {
      const callInfo = activeCalls.get(callId);
      if (!callInfo) return;
      
      // Notify caller
      const callerSocketId = getReceiverSocketId(callInfo.callerId);
      if (callerSocketId) {
        io.to(callerSocketId).emit("call:rejected", {
          callId,
          reason: reason || "Call rejected",
          receiverId: userId,
        });
      }
      
      // Remove call from active calls
      activeCalls.delete(callId);
      
      console.log(`Call ${callId} rejected by ${userId}`);
    } catch (error) {
      console.error("Error in call:reject:", error);
    }
  });
  
  // Call End
  socket.on("call:end", ({ callId, reason }) => {
    try {
      const callInfo = activeCalls.get(callId);
      if (!callInfo) return;
      
      // Notify both parties
      const callerSocketId = getReceiverSocketId(callInfo.callerId);
      const receiverSocketId = getReceiverSocketId(callInfo.receiverId);
      
      if (callerSocketId && callerSocketId !== socket.id) {
        io.to(callerSocketId).emit("call:ended", {
          callId,
          reason: reason || "Call ended",
        });
      }
      
      if (receiverSocketId && receiverSocketId !== socket.id) {
        io.to(receiverSocketId).emit("call:ended", {
          callId,
          reason: reason || "Call ended",
        });
      }
      
      // Remove call from active calls
      activeCalls.delete(callId);
      
      console.log(`Call ${callId} ended (${reason || "ended"})`);
    } catch (error) {
      console.error("Error in call:end:", error);
    }
  });
  
  // WebRTC Offer
  socket.on("webrtc:offer", ({ callId, offer, receiverId }) => {
    try {
      const receiverSocketId = getReceiverSocketId(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("webrtc:offer", {
          callId,
          offer,
          callerId: userId,
        });
      }
    } catch (error) {
      console.error("Error in webrtc:offer:", error);
    }
  });
  
  // WebRTC Answer
  socket.on("webrtc:answer", ({ callId, answer, callerId }) => {
    try {
      const callerSocketId = getReceiverSocketId(callerId);
      if (callerSocketId) {
        io.to(callerSocketId).emit("webrtc:answer", {
          callId,
          answer,
          receiverId: userId,
        });
      }
    } catch (error) {
      console.error("Error in webrtc:answer:", error);
    }
  });
  
  // ICE Candidate Exchange
  socket.on("webrtc:ice-candidate", ({ callId, candidate, receiverId }) => {
    try {
      if (!callId || !candidate || !receiverId) {
        console.warn("Invalid ICE candidate data:", { callId, candidate, receiverId });
        return;
      }
      
      const receiverSocketId = getReceiverSocketId(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("webrtc:ice-candidate", {
          callId,
          candidate,
          senderId: userId,
        });
        console.log(`ICE candidate forwarded: ${userId} -> ${receiverId}`);
      } else {
        console.warn(`Receiver ${receiverId} not found for ICE candidate`);
      }
    } catch (error) {
      console.error("Error in webrtc:ice-candidate:", error);
    }
  });
  
  // Cleanup active calls on disconnect
  socket.on("disconnect", () => {
    console.log("A user disconnected:", socket.id);

    let disconnectedUserId = null;
    for (const [userId, socketId] of userSockets.entries()) {
      if (socketId === socket.id) {
        disconnectedUserId = userId;
        userSockets.delete(userId);
        break;
      }
    }

    // Cleanup active calls where user was participating
    if (disconnectedUserId) {
      for (const [callId, callInfo] of activeCalls.entries()) {
        if (
          callInfo.callerId.toString() === disconnectedUserId.toString() ||
          callInfo.receiverId.toString() === disconnectedUserId.toString()
        ) {
          // Notify other party
          const otherPartyId = callInfo.callerId.toString() === disconnectedUserId.toString()
            ? callInfo.receiverId
            : callInfo.callerId;
          const otherPartySocketId = getReceiverSocketId(otherPartyId);
          
          if (otherPartySocketId) {
            io.to(otherPartySocketId).emit("call:ended", {
              callId,
              reason: "User disconnected",
            });
          }
          
          activeCalls.delete(callId);
        }
      }
      
      console.log(`User ${disconnectedUserId} removed from online list`);
      io.emit("getOnlineUsers", Array.from(userSockets.keys()));
    }
  });
});

export { io, app, server };
