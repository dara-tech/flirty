import { Server } from "socket.io";
import http from "http";
import express from "express";
import Message from "../model/message.model.js";


const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173"], // Your frontend URL
  },
});

// Used to store online users
const userSocketMap = new Map(); // { userId: socketId }

export function getReceiverSocketId(userId) {
  return userSocketMap.get(userId);
}

io.on("connection", (socket) => {
  console.log("A user connected", socket.id);

  const userId = socket.handshake.query.userId;

  if (userId) {
    userSocketMap.set(userId, socket.id);
  }

  io.emit("getOnlineUsers", Array.from(userSocketMap.keys()));

  socket.on("typing", ({ receiverId }) => {
    if (receiverId && userId) {
      console.log(`User ${userId} is typing to ${receiverId}`);
      const receiverSocketId = getReceiverSocketId(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("typing", { senderId: userId });
      }
    } else {
      console.log("Invalid receiverId or userId in typing event");
    }
  });
  
  socket.on("stopTyping", ({ receiverId }) => {
    if (receiverId && userId) {
      const receiverSocketId = getReceiverSocketId(receiverId);
      if (receiverSocketId) {
        console.log(`User ${userId} stopped typing to ${receiverId}`);
        io.to(receiverSocketId).emit("stopTyping", { senderId: userId });
      }
    } else {
      console.log("Invalid receiverId or userId in stopTyping event");
    }
  });

  socket.on("messageSeen", async ({ messageId, senderId }) => {
    try {
      const message = await Message.findById(messageId);
      if (!message) {
        console.log("Message not found");
        return;
      }
      
      // Only update if message is not already seen
      if (!message.seen) {
        message.seen = true;
        message.seenAt = new Date();
        await message.save();
        
        console.log(`Message ${messageId} seen by receiver`);
        const senderSocketId = getReceiverSocketId(senderId);
        if (senderSocketId) {
          io.to(senderSocketId).emit("messageSeenUpdate", { messageId });
        }
      }
    } catch (error) {
      console.error("Error updating message seen status:", error);
    }
  });

  socket.on("disconnect", () => {
    console.log("A user disconnected", socket.id);

    for (const [key, value] of userSocketMap.entries()) {
      if (value === socket.id) {
        userSocketMap.delete(key);
        break;
      }
    }

    io.emit("getOnlineUsers", Array.from(userSocketMap.keys()));
  });
});

export { io, app, server };
