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
      { $replaceRoot: { newRoot: "$lastMessage" } },
      // Populate senderId and receiverId
      {
        $lookup: {
          from: "users",
          localField: "senderId",
          foreignField: "_id",
          as: "senderId"
        }
      },
      {
        $unwind: {
          path: "$senderId",
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $lookup: {
          from: "users",
          localField: "receiverId",
          foreignField: "_id",
          as: "receiverId"
        }
      },
      {
        $unwind: {
          path: "$receiverId",
          preserveNullAndEmptyArrays: true
        }
      },
      // Project only necessary user fields
      {
        $project: {
          senderId: {
            _id: "$senderId._id",
            fullname: "$senderId.fullname",
            email: "$senderId.email",
            profilePic: "$senderId.profilePic"
          },
          receiverId: {
            _id: "$receiverId._id",
            fullname: "$receiverId.fullname",
            email: "$receiverId.email",
            profilePic: "$receiverId.profilePic"
          },
          text: 1,
          image: 1,
          audio: 1,
          file: 1,
          createdAt: 1,
          updatedAt: 1,
          seen: 1,
          _id: 1
        }
      }
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
        .populate("reactions.userId", "fullname profilePic")
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

  export const sendMessage = async (req, res) => {
    try {
      const { text, image, audio, file, fileName, fileSize, fileType } = req.body;
      const { id: receiverId } = req.params;
      const senderId = req.user._id;
  
      // Validate that at least one of text, image, audio, or file is provided
      // Note: Links are extracted from text, so text can contain links
      // Check if text has content (not just empty string)
      const hasText = text && typeof text === 'string' && text.trim().length > 0;
      const hasImage = image && typeof image === 'string' && image.length > 0;
      const hasAudio = audio && typeof audio === 'string' && audio.length > 0;
      const hasFile = file && typeof file === 'string' && file.length > 0;
      
      if (!hasText && !hasImage && !hasAudio && !hasFile) {
        return res.status(400).json({ error: "Message must contain either text, image, audio, or file" });
      }
  
      let imageUrl;
      if (image) {
        try {
          const uploadResponse = await cloudinary.uploader.upload(image, {
            quality: 'auto:best', // Use best quality with automatic format optimization
            fetch_format: 'auto', // Automatically choose best format (WebP, AVIF, etc.)
            flags: 'immutable_cache', // Cache optimization
          });
          imageUrl = uploadResponse.secure_url;
        } catch (uploadError) {
          console.error("Error uploading image to Cloudinary:", uploadError);
          return res.status(500).json({ error: "Failed to upload image. Please try again." });
        }
      }

      let audioUrl;
      if (audio) {
        try {
          // Cloudinary doesn't accept data URIs directly for video/audio
          // Need to convert base64 data URI to buffer
          let audioBuffer;
          let audioFormat = 'webm'; // Default format
          
          if (audio.startsWith('data:')) {
            // Extract base64 data from data URI
            // Format can be: 
            // - data:audio/webm;codecs=opus;base64,<base64data>
            // - data:audio/webm;base64,<base64data>
            // - data:audio/webm,<base64data>
            
            // Try to match format with codecs parameter first
            let matches = audio.match(/^data:audio\/([^;]+)(?:;[^;]+)*;base64,(.+)$/);
            if (matches) {
              audioFormat = matches[1]; // Extract format (webm, mp3, etc.)
              const base64Data = matches[2];
              audioBuffer = Buffer.from(base64Data, 'base64');
            } else {
              // Try format without codecs: data:audio/webm;base64,<data>
              matches = audio.match(/^data:audio\/([^;]+);base64,(.+)$/);
              if (matches) {
                audioFormat = matches[1];
                audioBuffer = Buffer.from(matches[2], 'base64');
              } else {
                // Try generic format: data:audio/webm,<data> or data:audio/webm;base64,<data>
                matches = audio.match(/^data:audio\/([^,;]+)[,;](.+)$/);
                if (matches) {
                  audioFormat = matches[1];
                  // Remove 'base64,' prefix if present
                  const dataPart = matches[2].replace(/^base64,/, '');
                  audioBuffer = Buffer.from(dataPart, 'base64');
                } else {
                  throw new Error('Invalid audio data URI format');
                }
              }
            }
          } else {
            // If it's already base64 (without data URI prefix), convert directly
            audioBuffer = Buffer.from(audio, 'base64');
          }
          
          // Upload audio buffer to Cloudinary
          // Use upload_stream for better handling of binary data
          const uploadResponse = await new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
              {
          resource_type: 'video', // Cloudinary uses 'video' for audio/video files
                folder: 'voice-messages', // Organize voice messages in a folder
                format: audioFormat, // Preserve original format
              },
              (error, result) => {
                if (error) reject(error);
                else resolve(result);
              }
            );
            uploadStream.end(audioBuffer);
        });
          
        audioUrl = uploadResponse.secure_url;
        } catch (uploadError) {
          console.error("Error uploading audio to Cloudinary:", uploadError);
          console.error("Upload error details:", {
            message: uploadError.message,
            http_code: uploadError.http_code,
            name: uploadError.name,
            error: uploadError.error
          });
          // Return more detailed error in development
          const errorMessage = process.env.NODE_ENV === 'development' 
            ? `Failed to upload voice message: ${uploadError.message || 'Unknown error'}`
            : "Failed to upload voice message. Please try again.";
          return res.status(500).json({ error: errorMessage });
        }
      }

      let fileUrl;
      if (file) {
        try {
          // Upload file to Cloudinary as raw file
          const uploadResponse = await cloudinary.uploader.upload(file, {
            resource_type: 'raw', // For general files (PDFs, docs, etc.)
          });
          fileUrl = uploadResponse.secure_url;
        } catch (uploadError) {
          console.error("Error uploading file to Cloudinary:", uploadError);
          return res.status(500).json({ error: "Failed to upload file. Please try again." });
        }
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
  
      const newMessage = new Message({
        senderId,
        receiverId,
        text: text || "", // Provide empty string if no text
        image: imageUrl,
        audio: audioUrl,
        file: fileUrl,
        fileName: fileName || null,
        fileSize: fileSize || null,
        fileType: fileType || null,
        link: linkUrl,
        linkPreview: linkPreview,
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
      console.error("Error in sendMessage controller:", error);
      console.error("Error stack:", error.stack);
      // Return more detailed error in development
      const errorMessage = process.env.NODE_ENV === 'development' 
        ? `Internal server error: ${error.message || 'Unknown error'}`
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
          } else {
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
              conversationDeleted: !newLastMessage // Flag if conversation is now empty
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

      // Upload new image with high quality settings
      const uploadResponse = await cloudinary.uploader.upload(image, {
        quality: 'auto:best', // Use best quality with automatic format optimization
        fetch_format: 'auto', // Automatically choose best format (WebP, AVIF, etc.)
        flags: 'immutable_cache', // Cache optimization
      });
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

      // Emit socket event to notify both users with normalized IDs
      const otherUserSocketId = getReceiverSocketId(otherUserIdStr);
      if (otherUserSocketId) {
        io.to(otherUserSocketId).emit("conversationDeleted", { 
          userId: myIdStr,
          deleteType: "forEveryone"
        });
      }
      
      const mySocketId = getReceiverSocketId(myIdStr);
      if (mySocketId) {
        io.to(mySocketId).emit("conversationDeleted", { 
          userId: otherUserIdStr,
          deleteType: "forEveryone"
        });
      }
      } else {
        // Delete for me - just notify the user's client (no database changes)
        // The frontend will handle filtering this conversation from the user's view
        const mySocketId = getReceiverSocketId(myIdStr);
        if (mySocketId) {
          io.to(mySocketId).emit("conversationDeleted", { 
            userId: otherUserIdStr,
            deleteType: "forMe"
          });
        }
        
        result.deletedCount = 0; // No messages deleted from database
      }

      res.status(200).json({ 
        message: "Conversation deleted successfully", 
        deletedCount: result.deletedCount,
        deleteType
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

      if (!type || !['media', 'files', 'links', 'voice'].includes(type)) {
        return res.status(400).json({ error: "Invalid type. Must be 'media', 'files', 'links', or 'voice'" });
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
        case 'media':
          typeQuery = { image: { $exists: true, $ne: null } };
          break;
        case 'files':
          typeQuery = { file: { $exists: true, $ne: null } };
          break;
        case 'links':
          typeQuery = { link: { $exists: true, $ne: null } };
          break;
        case 'voice':
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

      res.status(200).json(messages);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
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
      const isReceiver = message.receiverId && message.receiverId.toString() === userId.toString();
      
      if (message.groupId) {
        const Group = (await import("../model/group.model.js")).default;
        const group = await Group.findById(message.groupId);
        if (!group) {
          return res.status(404).json({ error: "Group not found" });
        }
        const isMember = group.admin.toString() === userId.toString() || 
                        group.members.some(m => m.toString() === userId.toString());
        if (!isMember) {
          return res.status(403).json({ error: "You are not a member of this group" });
        }
      } else {
        if (!isSender && !isReceiver) {
          return res.status(403).json({ error: "You don't have permission to pin this message" });
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
            { senderId: message.receiverId, receiverId: message.senderId }
          ],
          pinned: true,
          _id: { $ne: messageId }
        };
        await Message.updateMany(conversationQuery, { pinned: false, pinnedAt: null, pinnedBy: null });
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
        const receiverSocketId = getReceiverSocketId(message.receiverId.toString());
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
      const isReceiver = message.receiverId && message.receiverId.toString() === userId.toString();
      
      if (message.groupId) {
        const Group = (await import("../model/group.model.js")).default;
        const group = await Group.findById(message.groupId);
        if (!group) {
          return res.status(404).json({ error: "Group not found" });
        }
        const isMember = group.admin.toString() === userId.toString() || 
                        group.members.some(m => m.toString() === userId.toString());
        if (!isMember) {
          return res.status(403).json({ error: "You are not a member of this group" });
        }
      } else {
        if (!isSender && !isReceiver) {
          return res.status(403).json({ error: "You don't have permission to unpin this message" });
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
        const receiverSocketId = getReceiverSocketId(message.receiverId.toString());
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
      const isParticipant = message.senderId.toString() === userId.toString() ||
                           (message.receiverId && message.receiverId.toString() === userId.toString()) ||
                           (message.groupId && (await Group.exists({ _id: message.groupId, $or: [{ admin: userId }, { members: userId }] })));

      if (!isParticipant) {
        return res.status(403).json({ error: "You can only react to messages in conversations you are part of" });
      }

      // Remove existing reaction from this user if exists
      message.reactions = message.reactions.filter(
        r => r.userId.toString() !== userId.toString()
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
        const receiverSocketId = getReceiverSocketId(message.receiverId.toString());
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
        r => r.userId.toString() !== userId.toString()
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
        const receiverSocketId = getReceiverSocketId(message.receiverId.toString());
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