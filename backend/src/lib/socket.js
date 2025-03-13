import { Server } from "socket.io";
import http from "http";
import express from "express";
import Message from "../model/message.model.js";
import MapModel from "../model/map.model.js"; // Mongoose Map model

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173"], // Your frontend URL
  },
});

// ⚠️ Renamed userSocketMap to userSockets to avoid conflict
const userSockets = new Map(); // { userId: socketId }

export function getReceiverSocketId(userId) {
  return userSockets.get(userId);
}

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  const userId = socket.handshake.query.userId;

  if (userId) {
    if (userSockets.has(userId)) {
      console.log(`User ${userId} reconnected, updating socket ID.`);
    }
    userSockets.set(userId, socket.id);
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
        io.to(senderSocketId).emit("messageSeenUpdate", { messageId });
      }
    } catch (error) {
      console.error("Error updating message seen status:", error);
    }
  });

  // Real-time map updates with validation and saving to DB
  socket.on("createMap", async (newMap) => {
    if (!newMap || !newMap._id || !newMap.coordinates) {
      console.error("Invalid map data received for creation:", newMap);
      return;
    }

    try {
      const map = new MapModel(newMap);  // Create a new MapModel document
      await map.save();  // Save the map to the database

      console.log("New map created:", newMap._id);
      io.emit("newMap", newMap); // Emit the event to clients
    } catch (error) {
      console.error("Error saving new map:", error);
    }
  });

  socket.on("updateMap", async (updatedMap) => {
    if (!updatedMap || !updatedMap._id || !updatedMap.coordinates) {
      console.error("Invalid map data received for update:", updatedMap);
      return;
    }

    try {
      const map = await MapModel.findByIdAndUpdate(updatedMap._id, updatedMap, {
        new: true, // Returns the updated document
      });

      if (!map) {
        console.error("Map not found for update:", updatedMap._id);
        return;
      }

      console.log("Map updated:", updatedMap._id);
      io.emit("mapUpdated", updatedMap); // Emit the event to clients
    } catch (error) {
      console.error("Error updating map:", error);
    }
  });

  socket.on("deleteMap", async (mapId) => {
    if (!mapId) {
      console.error("Invalid map ID for deletion");
      return;
    }

    try {
      await MapModel.findByIdAndDelete(mapId);  // Delete the map from the database
      console.log("Map deleted:", mapId);
      io.emit("mapDeleted", mapId); // Emit the event to clients
    } catch (error) {
      console.error("Error deleting map:", error);
    }
  });

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

    if (disconnectedUserId) {
      console.log(`User ${disconnectedUserId} removed from online list`);
      io.emit("getOnlineUsers", Array.from(userSockets.keys()));
    }
  });
});

export { io, app, server };
