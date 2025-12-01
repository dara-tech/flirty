import User from "../model/user.model.js";
import Message from "../model/message.model.js";
import cloudinary from "../lib/cloudinary.js";
import { getReceiverSocketId, io } from "../lib/socket.js";


import mongoose from 'mongoose';

export const getLastMessages = async (req, res) => {
  try {
    const myId = new mongoose.Types.ObjectId(req.user._id);

    // Get the last message for each conversation
    const lastMessages = await Message.aggregate([
      // Match messages where I'm either sender or receiver
      {
        $match: {
          $or: [
            { senderId: myId },
            { receiverId: myId }
          ]
        }
      },
      // Sort by createdAt descending to get latest messages first
      { $sort: { createdAt: -1 } },
      // Group by conversation to get last message
      {
        $group: {
          _id: {
            $cond: [
              { $eq: ["$senderId", myId] },
              "$receiverId",
              "$senderId"
            ]
          },
          lastMessage: { $first: "$$ROOT" }
        }
      },
      // Replace root with lastMessage
      { $replaceRoot: { newRoot: "$lastMessage" } }
    ]);

    res.status(200).json(lastMessages);
  } catch (error) {
    console.error("Error in getLastMessages: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getUsersForSidebar = async (req, res) => {
    try {
      const loggedInUserId = req.user._id;
      const filteredUsers = await User.find({ _id: { $ne: loggedInUserId } }).select("-password");
  
      res.status(200).json(filteredUsers);
    } catch (error) {
      console.error("Error in getUsersForSidebar: ", error.message);
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
      if (before) {
        try {
          const beforeMessage = await Message.findById(before);
          if (beforeMessage) {
            query.createdAt = { $lt: beforeMessage.createdAt };
          }
        } catch (e) {
          // Invalid before ID, ignore
        }
      }
  
      // Sort descending (newest first) and limit
      const messages = await Message.find(query)
        .sort({ createdAt: -1 }) // Newest first (Telegram-style)
        .limit(limit);
  
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
      console.log("Error in getMessages controller: ", error.message);
      res.status(500).json({ error: "Internal server error" });
    }
  };

  export const sendMessage = async (req, res) => {
    try {
      const { text, image, audio } = req.body;
      const { id: receiverId } = req.params;
      const senderId = req.user._id;
  
      // Validate that at least one of text, image, or audio is provided
      if (!text && !image && !audio) {
        return res.status(400).json({ error: "Message must contain either text, image, or audio" });
      }
  
      let imageUrl;
      if (image) {
        const uploadResponse = await cloudinary.uploader.upload(image);
        imageUrl = uploadResponse.secure_url;
      }

      let audioUrl;
      if (audio) {
        // Upload audio file to Cloudinary with resource_type 'video' (supports audio)
        // Cloudinary will auto-detect and convert audio formats
        const uploadResponse = await cloudinary.uploader.upload(audio, {
          resource_type: 'video', // Cloudinary uses 'video' for audio/video files
        });
        audioUrl = uploadResponse.secure_url;
      }
  
      const newMessage = new Message({
        senderId,
        receiverId,
        text: text || "", // Provide empty string if no text
        image: imageUrl,
        audio: audioUrl,
      });
  
      await newMessage.save();
      await newMessage.populate("senderId", "fullname profilePic");
      await newMessage.populate("receiverId", "fullname profilePic");
  
      // Emit to both sender and receiver for real-time updates
      const receiverSocketId = getReceiverSocketId(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("newMessage", newMessage);
      }
      
      // Also emit to sender so they see their own message in real-time
      const senderSocketId = getReceiverSocketId(senderId.toString());
      if (senderSocketId) {
        io.to(senderSocketId).emit("newMessage", newMessage);
      }
  
      res.status(201).json(newMessage);
    } catch (error) {
      console.log("Error in sendMessage controller: ", error.message);
      res.status(500).json({ error: "Internal server error" });
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
        return res.status(403).json({ error: "You can only edit your own messages" });
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
        const receiverIdStr = typeof message.receiverId === 'object' && message.receiverId._id 
          ? message.receiverId._id.toString() 
          : message.receiverId.toString();
        
        const receiverSocketId = getReceiverSocketId(receiverIdStr);
        if (receiverSocketId) {
          io.to(receiverSocketId).emit("messageEdited", messageObj);
          console.log(`Emitted messageEdited to receiver socket ${receiverSocketId}`);
        } else {
          console.log(`Receiver socket not found for userId: ${receiverIdStr}`);
        }
        
        // Also notify sender
        const senderIdStr = userId.toString();
        const senderSocketId = getReceiverSocketId(senderIdStr);
        if (senderSocketId) {
          io.to(senderSocketId).emit("messageEdited", messageObj);
          console.log(`Emitted messageEdited to sender socket ${senderSocketId}`);
        } else {
          console.log(`Sender socket not found for userId: ${senderIdStr}`);
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
      console.log("Error in editMessage controller: ", error.message);
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
          return res.status(403).json({ error: "You can only delete your own messages for everyone" });
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
          const senderObjectId = new mongoose.Types.ObjectId(deletedMessageSenderId);
          const receiverObjectId = new mongoose.Types.ObjectId(deletedMessageReceiverId);
          
          // Find the most recent remaining message in this conversation
          const remainingMessages = await Message.find({
            $or: [
              { senderId: senderObjectId, receiverId: receiverObjectId },
              { senderId: receiverObjectId, receiverId: senderObjectId }
            ]
          })
          .sort({ createdAt: -1 })
          .limit(1)
          .populate("senderId", "fullname profilePic email")
          .populate("receiverId", "fullname profilePic email");

          if (remainingMessages.length > 0) {
            newLastMessage = remainingMessages[0].toObject ? remainingMessages[0].toObject() : remainingMessages[0];
            // Ensure edited flag is included
            newLastMessage.edited = remainingMessages[0].edited || false;
            newLastMessage.editedAt = remainingMessages[0].editedAt || null;
            console.log(`Found new last message: ${newLastMessage._id} for conversation`);
          } else {
            console.log(`No remaining messages found - conversation is now empty`);
          }
        }

        // Emit socket event to notify receivers with new last message info
        if (message.receiverId) {
          // Direct message - convert messageId to string for consistency
          const messageIdStr = messageId.toString();
          
          // Extract receiverId as string (handle both ObjectId and populated object)
          const receiverIdStr = typeof message.receiverId === 'object' && message.receiverId._id 
            ? message.receiverId._id.toString() 
            : message.receiverId.toString();
          
          const receiverSocketId = getReceiverSocketId(receiverIdStr);
          if (receiverSocketId) {
            io.to(receiverSocketId).emit("messageDeleted", { 
              messageId: messageIdStr, 
              deleteType: "forEveryone",
              newLastMessage: newLastMessage, // Send new last message if exists
              conversationDeleted: !newLastMessage // Flag if conversation is now empty
            });
            console.log(`Emitted messageDeleted to receiver socket ${receiverSocketId}, newLastMessage: ${newLastMessage ? 'exists' : 'none'}`);
          } else {
            console.log(`Receiver socket not found for userId: ${receiverIdStr}`);
          }
          
          // Also notify sender
          const senderIdStr = userId.toString();
          const senderSocketId = getReceiverSocketId(senderIdStr);
          if (senderSocketId) {
            io.to(senderSocketId).emit("messageDeleted", { 
              messageId: messageIdStr, 
              deleteType: "forEveryone",
              newLastMessage: newLastMessage, // Send new last message if exists
              conversationDeleted: !newLastMessage // Flag if conversation is now empty
            });
            console.log(`Emitted messageDeleted to sender socket ${senderSocketId}, newLastMessage: ${newLastMessage ? 'exists' : 'none'}`);
          } else {
            console.log(`Sender socket not found for userId: ${senderIdStr}`);
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
            io.to(userSocketId).emit("messageDeleted", { messageId: messageIdStr, deleteType: "forMe" });
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

      res.status(200).json({ message: "Message deleted successfully", deleteType });
    } catch (error) {
      console.log("Error in deleteMessage controller: ", error.message);
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
        return res.status(403).json({ error: "You can only edit your own messages" });
      }

      // Check if message has an image
      if (!message.image) {
        return res.status(400).json({ error: "This message does not have an image" });
      }

      // Upload new image
      const uploadResponse = await cloudinary.uploader.upload(image);
      const newImageUrl = uploadResponse.secure_url;

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
        const receiverIdStr = typeof message.receiverId === 'object' && message.receiverId._id 
          ? message.receiverId._id.toString() 
          : message.receiverId.toString();
        
        const receiverSocketId = getReceiverSocketId(receiverIdStr);
        if (receiverSocketId) {
          io.to(receiverSocketId).emit("messageEdited", messageObj);
          console.log(`Emitted messageEdited (image) to receiver socket ${receiverSocketId}`);
        } else {
          console.log(`Receiver socket not found for userId: ${receiverIdStr}`);
        }
        
        // Also notify sender
        const senderIdStr = userId.toString();
        const senderSocketId = getReceiverSocketId(senderIdStr);
        if (senderSocketId) {
          io.to(senderSocketId).emit("messageEdited", messageObj);
          console.log(`Emitted messageEdited (image) to sender socket ${senderSocketId}`);
        } else {
          console.log(`Sender socket not found for userId: ${senderIdStr}`);
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
      console.log("Error in updateMessageImage controller: ", error.message);
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
      const otherUserIdStr = typeof otherUserId === 'object' && otherUserId._id 
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
          { senderId: otherUserObjectId, receiverId: myObjectId }
        ]
      });

        console.log(`Deleted ${result.deletedCount} messages between users ${myIdStr} and ${otherUserIdStr} for everyone`);

      // Emit socket event to notify both users with normalized IDs
      const otherUserSocketId = getReceiverSocketId(otherUserIdStr);
      if (otherUserSocketId) {
          io.to(otherUserSocketId).emit("conversationDeleted", { 
            userId: myIdStr,
            deleteType: "forEveryone"
          });
          console.log(`Emitted conversationDeleted (forEveryone) to other user socket ${otherUserSocketId}`);
      } else {
        console.log(`Other user socket not found for userId: ${otherUserIdStr}`);
      }
      
      const mySocketId = getReceiverSocketId(myIdStr);
      if (mySocketId) {
          io.to(mySocketId).emit("conversationDeleted", { 
            userId: otherUserIdStr,
            deleteType: "forEveryone"
          });
          console.log(`Emitted conversationDeleted (forEveryone) to my socket ${mySocketId}`);
        } else {
          console.log(`My socket not found for userId: ${myIdStr}`);
        }
      } else {
        // Delete for me - just notify the user's client (no database changes)
        // The frontend will handle filtering this conversation from the user's view
        console.log(`Conversation deleted for me (user ${myIdStr}) with user ${otherUserIdStr}`);
        
        const mySocketId = getReceiverSocketId(myIdStr);
        if (mySocketId) {
          io.to(mySocketId).emit("conversationDeleted", { 
            userId: otherUserIdStr,
            deleteType: "forMe"
          });
          console.log(`Emitted conversationDeleted (forMe) to my socket ${mySocketId}`);
      } else {
        console.log(`My socket not found for userId: ${myIdStr}`);
        }
        
        result.deletedCount = 0; // No messages deleted from database
      }

      res.status(200).json({ 
        message: "Conversation deleted successfully", 
        deletedCount: result.deletedCount,
        deleteType
      });
    } catch (error) {
      console.log("Error in deleteConversation controller: ", error.message);
      res.status(500).json({ error: "Internal server error" });
    }
  };