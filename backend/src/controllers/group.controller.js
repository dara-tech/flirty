import Group from "../model/group.model.js";
import Message from "../model/message.model.js";
import User from "../model/user.model.js";
import ContactRequest from "../model/contactRequest.model.js";
import { io, getReceiverSocketId } from "../lib/socket.js";
import mongoose from "mongoose";
import { normalizeToArray } from "./message.controller.js";

// Helper function to check if users are contacts
const areContacts = async (userId, memberIds) => {
  if (!memberIds || memberIds.length === 0) return true;

  // Convert all IDs to ObjectId for proper comparison
  const userIdObj = new mongoose.Types.ObjectId(userId);
  const memberIdsObj = memberIds.map((id) => new mongoose.Types.ObjectId(id));

  // Check if all memberIds are contacts (have accepted contact requests)
  const contactRequests = await ContactRequest.find({
    $or: [
      {
        senderId: userIdObj,
        receiverId: { $in: memberIdsObj },
        status: "accepted",
      },
      {
        receiverId: userIdObj,
        senderId: { $in: memberIdsObj },
        status: "accepted",
      },
    ],
  });

  const contactUserIds = new Set();
  contactRequests.forEach((req) => {
    if (req.senderId.toString() === userId.toString()) {
      contactUserIds.add(req.receiverId.toString());
    } else {
      contactUserIds.add(req.senderId.toString());
    }
  });

  // Check if all memberIds are in contacts
  const memberIdStrings = memberIds.map((id) => id.toString());
  return memberIdStrings.every((id) => contactUserIds.has(id));
};

// Create a new group
export const createGroup = async (req, res) => {
  try {
    const { name, description, groupPic, memberIds } = req.body;
    const adminId = req.user._id;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Group name is required" });
    }

    // Validate that all memberIds are valid users (no contact requirement)
    if (memberIds && Array.isArray(memberIds) && memberIds.length > 0) {
      // Remove duplicates and filter out admin
      const uniqueMemberIds = [...new Set(memberIds)].filter(
        (id) => id.toString() !== adminId.toString()
      );

      if (uniqueMemberIds.length > 0) {
        // Validate that all memberIds are valid users
        const validUsers = await User.find({ _id: { $in: uniqueMemberIds } });
        if (validUsers.length !== uniqueMemberIds.length) {
          return res.status(400).json({
            error: "Some user IDs are invalid",
          });
        }
      }
    }

    let groupPicUrl = "";
    if (groupPic) {
      // Client already uploaded to OSS, just use the URL
      groupPicUrl = groupPic;
    }

    // Create group - admin is separate, members array should not include admin
    const members = [];
    if (memberIds && Array.isArray(memberIds)) {
      // Add other members, avoiding duplicates and excluding admin
      memberIds.forEach((id) => {
        const idStr = id.toString();
        if (
          idStr !== adminId.toString() &&
          !members.some((m) => m.toString() === idStr)
        ) {
          members.push(id);
        }
      });
    }

    const newGroup = new Group({
      name: name.trim(),
      description: description || "",
      groupPic: groupPicUrl,
      admin: adminId,
      members, // members array does NOT include admin
    });

    await newGroup.save();
    await newGroup.populate("admin", "fullname profilePic");
    await newGroup.populate("members", "fullname profilePic");

    // Notify all members via socket (targeted)
    // console.log("\n════════════════════════════════════════");
    // console.log("🆕 [GROUP] Group created:", newGroup.name);
    // console.log("════════════════════════════════════════");
    let notifiedCount = 0;
    members.forEach((memberId) => {
      const memberSocketId = getReceiverSocketId(memberId.toString());
      if (memberSocketId) {
        io.to(memberSocketId).emit("groupCreated", {
          group: newGroup,
          memberId,
        });
        notifiedCount++;
      }
    });
    console.log("✅ Notified", notifiedCount, "members ⚡");
    console.log("════════════════════════════════════════\n");

    res.status(201).json(newGroup);
  } catch (error) {
    console.error("Error in createGroup: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get all groups for a user
export const getMyGroups = async (req, res) => {
  try {
    const userId = req.user._id;

    const groups = await Group.find({
      $or: [{ admin: userId }, { members: userId }],
    })
      .populate("admin", "fullname profilePic")
      .populate("members", "fullname profilePic")
      .sort({ updatedAt: -1 })
      .lean(); // Use lean() for read-only queries (faster)

    res.status(200).json({
      success: true,
      message: "Groups retrieved successfully",
      data: groups,
    });
  } catch (error) {
    console.error("Error in getMyGroups: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get group details
export const getGroup = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const group = await Group.findOne({
      _id: id,
      $or: [{ admin: userId }, { members: userId }],
    })
      .populate("admin", "fullname profilePic")
      .populate("members", "fullname profilePic");

    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    res.status(200).json(group);
  } catch (error) {
    console.error("Error in getGroup: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Add members to group
export const addMembersToGroup = async (req, res) => {
  try {
    const { id } = req.params;
    const { memberIds } = req.body;
    const userId = req.user._id;

    if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
      return res.status(400).json({ error: "Member IDs are required" });
    }

    const group = await Group.findById(id);

    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    // Check if user is admin
    if (group.admin.toString() !== userId.toString()) {
      return res.status(403).json({ error: "Only admin can add members" });
    }

    // Validate that all new members are contacts
    const existingMemberIds = group.members.map((m) => m.toString());
    const newMemberIds = memberIds.filter(
      (id) =>
        !existingMemberIds.includes(id.toString()) &&
        id.toString() !== group.admin.toString()
    );

    if (newMemberIds.length === 0) {
      return res.status(400).json({ error: "All users are already members" });
    }

    // Validate that all memberIds are valid users
    const validUsers = await User.find({ _id: { $in: newMemberIds } });
    if (validUsers.length !== newMemberIds.length) {
      return res.status(400).json({
        error: "Some user IDs are invalid",
      });
    }

    group.members.push(...newMemberIds);
    await group.save();
    await group.populate("admin", "fullname profilePic");
    await group.populate("members", "fullname profilePic");

    // Notify new members via socket (targeted)
    // console.log("\n════════════════════════════════════════");
    // console.log("➕ [GROUP] Members added to:", group.name);
    // console.log("════════════════════════════════════════");
    let notifiedCount = 0;
    newMemberIds.forEach((memberId) => {
      const memberSocketId = getReceiverSocketId(memberId.toString());
      if (memberSocketId) {
        io.to(memberSocketId).emit("addedToGroup", { group, memberId });
        notifiedCount++;
      }
    });
    console.log("✅ Notified", notifiedCount, "new members ⚡");
    console.log("════════════════════════════════════════\n");

    res.status(200).json({
      success: true,
      message: "Members added successfully",
      data: group,
    });
  } catch (error) {
    console.error("Error in addMembersToGroup: ", error.message);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

// Remove member from group
export const removeMemberFromGroup = async (req, res) => {
  try {
    const { id, memberId } = req.params;
    const userId = req.user._id;

    const group = await Group.findById(id);

    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    // Check if user is admin
    if (group.admin.toString() !== userId.toString()) {
      return res.status(403).json({ error: "Only admin can remove members" });
    }

    // Cannot remove admin
    if (group.admin.toString() === memberId) {
      return res.status(400).json({ error: "Cannot remove admin from group" });
    }

    group.members = group.members.filter((m) => m.toString() !== memberId);
    await group.save();
    await group.populate("admin", "fullname profilePic");
    await group.populate("members", "fullname profilePic");

    // Notify removed member via socket (targeted)
    console.log("\n════════════════════════════════════════");
    console.log("➖ [GROUP] Member removed from:", group.name);
    console.log("════════════════════════════════════════");
    const memberSocketId = getReceiverSocketId(memberId);
    if (memberSocketId) {
      io.to(memberSocketId).emit("removedFromGroup", { group, memberId });
      console.log("✅ Notified member ⚡");
    } else {
      console.log("⚠️ Member offline");
    }
    console.log("════════════════════════════════════════\n");

    res.status(200).json(group);
  } catch (error) {
    console.error("Error in removeMemberFromGroup: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get group messages by type (media, files, links, voice)
export const getGroupMessagesByType = async (req, res) => {
  try {
    const { id: groupId } = req.params;
    const { type } = req.query; // 'media', 'files', 'links', 'voice'
    const userId = req.user._id;

    if (!type || !["media", "files", "links", "voice"].includes(type)) {
      return res.status(400).json({
        error: "Invalid type. Must be 'media', 'files', 'links', or 'voice'",
      });
    }

    // Check if user is a member of the group
    const group = await Group.findById(groupId);
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

    // Build base query for group
    const baseQuery = { groupId };

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
      .populate("seenBy.userId", "fullname profilePic")
      .populate({
        path: "replyTo",
        select: "text image audio video file senderId receiverId createdAt",
        populate: {
          path: "senderId",
          select: "fullname profilePic",
        },
      })
      .sort({ createdAt: -1 })
      .limit(100) // Limit to 100 most recent
      .lean(); // Use lean() for read-only queries (faster)

    res.status(200).json({
      success: true,
      message: "Group messages retrieved successfully",
      data: messages,
    });
  } catch (error) {
    console.error("Error in getGroupMessagesByType: ", error.message);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// Get group messages
export const getGroupMessages = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    // Pagination parameters (Telegram-style: newest first, load last N messages)
    const limit = parseInt(req.query.limit) || 50; // Default: last 50 messages
    const before = req.query.before; // Message ID to load messages before (for pagination)

    // Check if user is a member of the group
    const group = await Group.findById(id);
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

    // Build query
    const query = { groupId: id };

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
      .populate("senderId", "fullname profilePic")
      .populate("seenBy.userId", "fullname profilePic")
      .populate("reactions.userId", "fullname profilePic")
      .populate({
        path: "replyTo",
        select: "text image audio video file senderId receiverId createdAt",
        populate: {
          path: "senderId",
          select: "fullname profilePic",
        },
      })
      .sort({ createdAt: -1 }) // Newest first (Telegram-style)
      .limit(limit)
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
    console.error("Error in getGroupMessages: ", error.message);
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

// Send message to group
export const sendGroupMessage = async (req, res) => {
  try {
    // console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    // console.log("📨 [GROUP] Send group message request");
    // console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

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
      replyTo,
    } = req.body;
    const { id: groupId } = req.params;
    const senderId = req.user._id;

    // console.log("📝 Request data:");
    // console.log("   ├─ groupId:", groupId);
    // console.log("   ├─ senderId:", senderId.toString());
    // console.log(
    //   "   ├─ text:",
    //   text ? text.substring(0, 50) + (text.length > 50 ? "..." : "") : "null"
    // );
    // console.log("   ├─ hasImage:", !!image);
    // console.log("   ├─ hasVideo:", !!video);
    // console.log("   ├─ hasAudio:", !!audio);
    // console.log("   ├─ hasFile:", !!file);
    // console.log("   ├─ replyTo:", replyTo || "null");
    // console.log("   └─ forwardedFrom:", forwardedFrom ? "yes" : "no");

    // Normalize inputs to arrays (supports both single values and arrays for backward compatibility)
    const images = normalizeToArray(image);
    const audios = normalizeToArray(audio);
    const videos = normalizeToArray(video);
    const files = normalizeToArray(file);
    const fileNames = normalizeToArray(fileName);
    const fileSizes = normalizeToArray(fileSize);
    const fileTypes = normalizeToArray(fileType);

    // Validate that at least one of text, image, audio, video, or file is provided
    const hasText = text && typeof text === "string" && text.trim().length > 0;
    const hasImage = images.length > 0;
    const hasAudio = audios.length > 0;
    const hasVideo = videos.length > 0;
    const hasFile = files.length > 0;

    if (!hasText && !hasImage && !hasAudio && !hasVideo && !hasFile) {
      return res.status(400).json({
        error: "Message must contain either text, image, audio, video, or file",
      });
    }

    // Check if user is a member of the group
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    const isMember =
      group.admin.toString() === senderId.toString() ||
      group.members.some((m) => m.toString() === senderId.toString());

    if (!isMember) {
      return res
        .status(403)
        .json({ error: "You are not a member of this group" });
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
      groupId,
      text: text || "",
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
      replyTo: replyTo || undefined,
    });

    await newMessage.save();
    await newMessage.populate("senderId", "fullname profilePic");
    await newMessage.populate("seenBy.userId", "fullname profilePic");

    // Populate replyTo if present (for reply messages)
    if (newMessage.replyTo) {
      await newMessage.populate({
        path: "replyTo",
        select: "text image audio video file senderId groupId createdAt",
        populate: {
          path: "senderId",
          select: "fullname profilePic",
        },
      });
    }

    // Convert Mongoose document to plain object for socket emit
    const messageObj = newMessage.toObject ? newMessage.toObject() : newMessage;

    // Prepare list of all group members (admin + members)
    const allMembers = [group.admin, ...group.members];

    // console.log("\n📤 [SOCKET] Emitting newMessage to group members");
    // console.log("   ├─ Event: 'newMessage' (same as personal)");
    // console.log("   ├─ groupId:", groupId.toString());
    // console.log("   ├─ messageId:", messageObj._id.toString());
    // console.log("   ├─ senderId:", messageObj.senderId._id.toString());
    // console.log("   ├─ senderName:", messageObj.senderId.fullname);
    // console.log(
    //   "   ├─ text:",
    //   text ? text.substring(0, 50) + (text.length > 50 ? "..." : "") : "null"
    // );
    // console.log(
    //   "   ├─ replyTo:",
    //   messageObj.replyTo ? messageObj.replyTo._id.toString() : "null"
    // );
    // console.log("   └─ members count:", allMembers.length);

    // Emit to all group members using same event as personal messages
    allMembers.forEach((memberId) => {
      const memberSocketId = getReceiverSocketId(memberId.toString());
      if (memberSocketId) {
        io.to(memberSocketId).emit("newMessage", messageObj);
        // console.log("   ✅ Emitted to member:", memberId.toString());
      } else {
        // console.log("   ⚠️ Member offline:", memberId.toString());
      }
    });

    // console.log("\n✅ [GROUP] Message sent successfully");
    // console.log("   ├─ messageId:", messageObj._id.toString());
    // console.log(
    //   "   ├─ Emitted to:",
    //   allMembers.filter((m) => getReceiverSocketId(m.toString())).length,
    //   "online members"
    // );
    // console.log(
    //   "   └─ Offline:",
    //   allMembers.filter((m) => !getReceiverSocketId(m.toString())).length,
    //   "members"
    // );
    // console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    res.status(201).json(messageObj);
  } catch (error) {
    console.error("\n❌ [GROUP] Error in sendGroupMessage:", error.message);
    console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get last messages for groups
export const getGroupLastMessages = async (req, res) => {
  try {
    const userId = req.user._id;

    // Get all groups user is part of
    const groups = await Group.find({
      $or: [{ admin: userId }, { members: userId }],
    }).select("_id");

    const groupIds = groups.map((g) => g._id);

    if (groupIds.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No group messages found",
        data: [],
      });
    }

    // Optimized: Use a single query with $in to get all last messages at once
    // This is much faster than individual queries
    const allMessages = await Message.find({
      groupId: { $in: groupIds },
    })
      .sort({ createdAt: -1 })
      .populate("senderId", "fullname profilePic")
      .populate("seenBy.userId", "fullname profilePic")
      .populate({
        path: "replyTo",
        select: "text image audio video file senderId receiverId createdAt",
        populate: {
          path: "senderId",
          select: "fullname profilePic",
        },
      })
      .lean();

    // Group by groupId and get the most recent message for each group
    const messagesByGroup = new Map();
    for (const msg of allMessages) {
      const groupIdStr = msg.groupId?.toString() || msg.groupId;
      if (!messagesByGroup.has(groupIdStr)) {
        messagesByGroup.set(groupIdStr, msg);
      } else {
        const existing = messagesByGroup.get(groupIdStr);
        if (new Date(msg.createdAt) > new Date(existing.createdAt)) {
          messagesByGroup.set(groupIdStr, msg);
        }
      }
    }

    // Get messages in the order of groupIds
    const populatedMessages = groupIds
      .map((id) => {
        const idStr = id.toString();
        return messagesByGroup.get(idStr);
      })
      .filter((msg) => msg !== undefined);

    res.status(200).json({
      success: true,
      message: "Group last messages retrieved successfully",
      data: populatedMessages,
    });
  } catch (error) {
    console.error("Error in getGroupLastMessages: ", error.message);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// Delete group (only admin/owner can delete)
export const deleteGroup = async (req, res) => {
  try {
    const { id: groupId } = req.params;
    const userId = req.user._id;

    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    // Check if user is the admin/owner of the group
    if (group.admin.toString() !== userId.toString()) {
      return res
        .status(403)
        .json({ error: "Only the group owner can delete the group" });
    }

    // Get all members before deletion for socket notification
    const allMembers = [group.admin, ...group.members];
    const groupIdStr = groupId.toString();

    // Delete all messages in the group
    const messagesResult = await Message.deleteMany({ groupId: groupIdStr });

    // Delete the group
    await Group.findByIdAndDelete(groupId);

    // Notify all members via socket that group was deleted
    allMembers.forEach((memberId) => {
      const memberIdStr = memberId.toString();
      const memberSocketId = getReceiverSocketId(memberIdStr);
      if (memberSocketId) {
        io.to(memberSocketId).emit("groupDeleted", {
          groupId: groupIdStr,
          memberId: memberIdStr,
        });
      } else {
      }
    });

    res.status(200).json({
      message: "Group deleted successfully",
      deletedMessagesCount: messagesResult.deletedCount,
    });
  } catch (error) {
    console.error("Error in deleteGroup: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Update group info (name, description, photo) - Admin only
export const updateGroupInfo = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, groupPic } = req.body;
    const userId = req.user._id;

    const group = await Group.findById(id);

    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    // Check if user is admin
    if (group.admin.toString() !== userId.toString()) {
      return res
        .status(403)
        .json({ error: "Only admin can update group info" });
    }

    // Update name if provided
    if (name !== undefined && name.trim()) {
      group.name = name.trim();
    }

    // Update description if provided
    if (description !== undefined) {
      group.description = description || "";
    }

    // Update group picture if provided
    if (groupPic) {
      // Client already uploaded to OSS, just use the URL
      group.groupPic = groupPic;
    }

    await group.save();
    await group.populate("admin", "fullname profilePic");
    await group.populate("members", "fullname profilePic");

    // Notify all members via socket (targeted)
    // console.log("\n════════════════════════════════════════");
    // console.log("ℹ️ [GROUP] Group info updated:", group.name);
    // console.log("════════════════════════════════════════");
    const allMembers = [group.admin, ...group.members];
    let notifiedCount = 0;
    allMembers.forEach((memberId) => {
      const memberIdStr = memberId._id
        ? memberId._id.toString()
        : memberId.toString();
      const memberSocketId = getReceiverSocketId(memberIdStr);
      if (memberSocketId) {
        io.to(memberSocketId).emit("groupInfoUpdated", {
          group,
          memberId: memberIdStr,
        });
        notifiedCount++;
      }
    });
    console.log("✅ Notified", notifiedCount, "members ⚡");
    console.log("════════════════════════════════════════\n");

    res.status(200).json(group);
  } catch (error) {
    console.error("Error in updateGroupInfo: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Leave group (members can leave, admin must transfer or delete)
export const leaveGroup = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const group = await Group.findById(id);

    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    // Check if user is a member
    const isAdmin = group.admin.toString() === userId.toString();
    const isMember =
      isAdmin || group.members.some((m) => m.toString() === userId.toString());

    if (!isMember) {
      return res
        .status(403)
        .json({ error: "You are not a member of this group" });
    }

    // Admin cannot leave - must transfer admin or delete group
    if (isAdmin) {
      return res.status(400).json({
        error:
          "Admin cannot leave group. Please transfer admin role or delete the group.",
      });
    }

    // Remove member from group
    group.members = group.members.filter(
      (m) => m.toString() !== userId.toString()
    );
    await group.save();
    await group.populate("admin", "fullname profilePic");
    await group.populate("members", "fullname profilePic");

    // Notify all remaining members via socket (targeted)
    // console.log("\n════════════════════════════════════════");
    // console.log("🚻 [GROUP] Member left:", group.name);
    // console.log("════════════════════════════════════════");
    const allMembers = [group.admin, ...group.members];
    let notifiedCount = 0;
    allMembers.forEach((memberId) => {
      const memberIdStr = memberId._id
        ? memberId._id.toString()
        : memberId.toString();
      const memberSocketId = getReceiverSocketId(memberIdStr);
      if (memberSocketId) {
        io.to(memberSocketId).emit("memberLeftGroup", {
          group,
          memberId: memberIdStr,
          leftMemberId: userId.toString(),
        });
        notifiedCount++;
      }
    });
    console.log("✅ Notified", notifiedCount, "remaining members ⚡");
    console.log("════════════════════════════════════════\n");

    // Notify the user who left
    const userSocketId = getReceiverSocketId(userId.toString());
    if (userSocketId) {
      io.to(userSocketId).emit("leftGroup", {
        groupId: id,
      });
    }

    res.status(200).json({ message: "Left group successfully" });
  } catch (error) {
    console.error("Error in leaveGroup: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};
