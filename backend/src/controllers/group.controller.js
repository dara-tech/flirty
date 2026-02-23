import Group from "../model/group.model.js";
import Message from "../model/message.model.js";
import User from "../model/user.model.js";
import ContactRequest from "../model/contactRequest.model.js";
import { io, getReceiverSocketId, emitToUser } from "../lib/socket.js";
import mongoose from "mongoose";
import { normalizeToArray } from "./message.controller.js";
import { sendMobileGroupMessageNotification } from "../services/mobilePushNotification.service.js";
import { sendGroupMessageNotification } from "../services/pushNotification.service.js";
import logger from "../lib/logger.js";

// Helper function to check if user is admin (primary or co-admin)
const isGroupAdmin = (group, userId) => {
  const userIdStr = userId.toString();
  return (
    group.admin.toString() === userIdStr ||
    (group.admins &&
      group.admins.some((adminId) => adminId.toString() === userIdStr))
  );
};

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
    const { name, description, groupPic, memberIds, adminIds } = req.body;
    const creatorId = req.user._id;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Group name is required" });
    }

    // Collect all user IDs to validate (members + co-admins)
    const allUserIds = new Set();

    // Add member IDs
    if (memberIds && Array.isArray(memberIds)) {
      memberIds.forEach((id) => {
        if (id.toString() !== creatorId.toString()) {
          allUserIds.add(id.toString());
        }
      });
    }

    // Add co-admin IDs (excluding creator)
    if (adminIds && Array.isArray(adminIds)) {
      adminIds.forEach((id) => {
        if (id.toString() !== creatorId.toString()) {
          allUserIds.add(id.toString());
        }
      });
    }

    // Validate all user IDs
    if (allUserIds.size > 0) {
      const validUsers = await User.find({ _id: { $in: [...allUserIds] } });
      if (validUsers.length !== allUserIds.size) {
        return res.status(400).json({
          error: "Some user IDs are invalid",
        });
      }
    }

    let groupPicUrl = "";
    if (groupPic) {
      // Client already uploaded to OSS, just use the URL
      groupPicUrl = groupPic;
    }

    // Process co-admins (excluding creator)
    const coAdmins = [];
    if (adminIds && Array.isArray(adminIds)) {
      adminIds.forEach((id) => {
        const idStr = id.toString();
        if (
          idStr !== creatorId.toString() &&
          !coAdmins.some((a) => a.toString() === idStr)
        ) {
          coAdmins.push(id);
        }
      });
    }

    // Process members (excluding creator and co-admins)
    const members = [];
    if (memberIds && Array.isArray(memberIds)) {
      memberIds.forEach((id) => {
        const idStr = id.toString();
        if (
          idStr !== creatorId.toString() &&
          !coAdmins.some((a) => a.toString() === idStr) &&
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
      admin: creatorId,
      admins: coAdmins,
      members, // members array does NOT include admin or co-admins
    });

    await newGroup.save();
    await newGroup.populate("admin", "fullname profilePic");
    await newGroup.populate("admins", "fullname profilePic");
    await newGroup.populate("members", "fullname profilePic");

    // Notify all participants via socket (multi-device)
    const allParticipants = [...coAdmins, ...members];
    allParticipants.forEach((participantId) => {
      emitToUser(participantId.toString(), "groupCreated", {
        group: newGroup,
        groupId: newGroup._id.toString(),
      });
    });

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
      $or: [{ admin: userId }, { admins: userId }, { members: userId }],
    })
      .populate("admin", "fullname profilePic")
      .populate("admins", "fullname profilePic")
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
      $or: [{ admin: userId }, { admins: userId }, { members: userId }],
    })
      .populate("admin", "fullname profilePic")
      .populate("admins", "fullname profilePic")
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

    // Check if user is admin (primary or co-admin)
    if (!isGroupAdmin(group, userId)) {
      return res.status(403).json({ error: "Only admins can add members" });
    }

    // Get all existing participant IDs (admin + co-admins + members)
    const existingParticipantIds = [
      group.admin.toString(),
      ...(group.admins || []).map((a) => a.toString()),
      ...group.members.map((m) => m.toString()),
    ];

    const newMemberIds = memberIds.filter(
      (id) => !existingParticipantIds.includes(id.toString()),
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
    await group.populate("admins", "fullname profilePic");
    await group.populate("members", "fullname profilePic");

    // ✅ FIX: Notify NEW members they were added (multi-device)
    newMemberIds.forEach((memberId) => {
      emitToUser(memberId.toString(), "addedToGroup", { group, memberId });
    });

    // ✅ FIX: Notify ALL existing participants (admin + co-admins + old members)
    // so their cached member list refreshes in real-time
    const allParticipants = [
      group.admin,
      ...(group.admins || []),
      ...group.members,
    ];
    const newMemberIdStrings = new Set(newMemberIds.map((id) => id.toString()));

    allParticipants.forEach((participant) => {
      const participantId = participant._id
        ? participant._id.toString()
        : participant.toString();
      // Skip new members (they already got "addedToGroup")
      if (newMemberIdStrings.has(participantId)) return;
      emitToUser(participantId, "groupMembersUpdated", {
        groupId: id,
        addedMemberIds: newMemberIds.map((m) => m.toString()),
      });
    });

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

    // Check if user is admin (primary or co-admin)
    if (!isGroupAdmin(group, userId)) {
      return res.status(403).json({ error: "Only admins can remove members" });
    }

    // Cannot remove primary admin
    if (group.admin.toString() === memberId) {
      return res
        .status(400)
        .json({ error: "Cannot remove primary admin from group" });
    }

    // Check if removing a co-admin (only primary admin can remove co-admins)
    const isTargetCoAdmin =
      group.admins && group.admins.some((a) => a.toString() === memberId);
    if (isTargetCoAdmin && group.admin.toString() !== userId.toString()) {
      return res
        .status(403)
        .json({ error: "Only primary admin can remove co-admins" });
    }

    // Remove from admins array if co-admin
    if (isTargetCoAdmin) {
      group.admins = group.admins.filter((a) => a.toString() !== memberId);
    }

    // Remove from members array
    group.members = group.members.filter((m) => m.toString() !== memberId);

    await group.save();
    await group.populate("admin", "fullname profilePic");
    await group.populate("admins", "fullname profilePic");
    await group.populate("members", "fullname profilePic");

    // ✅ FIX: Use emitToUser for multi-device support
    const groupObj = group.toObject ? group.toObject() : group;

    // Notify the removed member
    emitToUser(memberId, "removedFromGroup", {
      group: groupObj,
      groupId: id,
      memberId,
    });

    // ✅ FIX: Also notify remaining members so they see the updated member list
    const remainingParticipants = [
      group.admin,
      ...(group.admins || []),
      ...group.members,
    ];
    const removePayload = {
      group: groupObj,
      groupId: id,
      removedMemberId: memberId,
    };
    remainingParticipants.forEach((participantId) => {
      const participantIdStr = participantId._id
        ? participantId._id.toString()
        : participantId.toString();
      emitToUser(participantIdStr, "memberRemovedFromGroup", removePayload);
    });

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
      isGroupAdmin(group, userId) ||
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
      .populate("listenedBy.userId", "fullname profilePic") // Populate voice listened users
      .populate("reactions.userId", "fullname profilePic") // Populate reaction users
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
      isGroupAdmin(group, userId) ||
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
      .populate("listenedBy.userId", "fullname profilePic") // Populate voice listened users
      .populate("reactions.userId", "fullname profilePic")
      .populate({
        path: "replyTo",
        select:
          "text image audio video file sticker senderId receiverId createdAt",
        populate: {
          path: "senderId",
          select: "fullname profilePic",
        },
      })
      .sort({ createdAt: -1 }) // Newest first (Telegram-style)
      .limit(limit)
      .lean(); // Use lean() for read-only queries (faster)

    // Check if there are more messages
    const hasMore = messages.length === limit;

    // Return messages in descending order (newest first)
    // Frontend ListView with reverse: true will display newest at bottom (Telegram-style)
    res.status(200).json({
      messages: messages,
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
      audioDuration, // Duration in seconds for voice messages
      audioWaveform, // Waveform data for voice message visualization
      video,
      file,
      fileName,
      fileSize,
      fileType,
      sticker,
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
    const audioDurations = normalizeToArray(audioDuration)
      .map((d) => {
        // Ensure duration is a valid number (in seconds)
        const parsed = parseFloat(d);
        return isNaN(parsed) ? null : Math.round(parsed);
      })
      .filter((d) => d !== null);
    // Normalize waveform data (array of arrays for multiple audio files)
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

    // Check if user is a member of the group
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    const isMember =
      isGroupAdmin(group, senderId) ||
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
      replyTo: replyTo || undefined,
    });

    await newMessage.save();
    await newMessage.populate("senderId", "fullname profilePic");
    await newMessage.populate("seenBy.userId", "fullname profilePic");

    // Populate replyTo if present (for reply messages)
    if (newMessage.replyTo) {
      await newMessage.populate({
        path: "replyTo",
        select:
          "text image audio video file sticker senderId groupId createdAt",
        populate: {
          path: "senderId",
          select: "fullname profilePic",
        },
      });
    }

    // Convert Mongoose document to plain object for socket emit
    const messageObj = newMessage.toObject ? newMessage.toObject() : newMessage;

    // Prepare list of all group members (admin + co-admins + members)
    // 🔥 FIX: Include co-admins (admins array) in group message broadcast
    const allMembers = [group.admin, ...(group.admins || []), ...group.members];

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

    // ✅ FIX: Emit to sender FIRST so they see their own message
    // MULTI-DEVICE: Use emitToUser to emit to ALL sender's devices
    const senderDeviceCount = emitToUser(
      senderId.toString(),
      "newMessage",
      messageObj,
    );
    if (senderDeviceCount === 0) {
      console.log(
        "   ⚠️ [GROUP] Sender socket NOT FOUND:",
        senderId.toString(),
      );
    }

    // Emit to all OTHER group members using same event as personal messages
    // Also send push notifications to offline members
    allMembers.forEach(async (memberId) => {
      const memberIdStr = memberId.toString();
      // Skip sender (already emitted above, don't send push notification to yourself)
      if (memberIdStr === senderId.toString()) {
        return;
      }

      // MULTI-DEVICE: Use emitToUser to emit to ALL member's devices
      const memberDeviceCount = emitToUser(
        memberIdStr,
        "newMessage",
        messageObj,
      );
      // if (memberDeviceCount > 0) {
      //   console.log("   ✅ Emitted to member:", memberIdStr, "(", memberDeviceCount, "devices)");
      // }

      // Always attempt to send push notification (even if user is online)
      // The frontend will suppress duplicate notifications if user is viewing the chat
      // This ensures notifications work when app is closed or in background
      try {
        // Try mobile push first (FCM/APNs for iOS/Android apps)
        const mobilePushResult = await sendMobileGroupMessageNotification(
          memberIdStr,
          messageObj,
          group,
        );

        if (mobilePushResult.success) {
          // logger.info("✅ [Push] Mobile group notification sent", {
          //   requestId: req.requestId,
          //   memberId: memberIdStr,
          //   groupId: groupId,
          //   messageId: messageObj._id,
          //   sent: mobilePushResult.sent,
          //   failed: mobilePushResult.failed,
          //   total: mobilePushResult.total,
          //   userOnline: !!memberSocketId,
          // });
        } else {
          // logger.debug(
          //   `⚠️ [Push] Mobile group push failed: ${mobilePushResult.error}, trying web push`,
          //   {
          //     requestId: req.requestId,
          //     memberId: memberIdStr,
          //     groupId: groupId,
          //   },
          // );

          // Fallback to web push (for web browsers)
          const pushResult = await sendGroupMessageNotification(
            memberIdStr,
            messageObj,
            group,
          );
        }
      } catch (pushError) {
        logger.error("❌ [Push] Failed to send group push notification:", {
          error: pushError.message,
          stack: pushError.stack,
          memberId: memberIdStr,
          groupId: groupId,
          messageId: messageObj._id,
          type: pushError.constructor.name,
        });
        // Don't fail the request if push notification fails
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

    // Get all groups user is part of (including co-admins)
    // 🔥 FIX: Include 'admins' array to check if user is a co-admin
    const groups = await Group.find({
      $or: [{ admin: userId }, { admins: userId }, { members: userId }],
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
      .populate("listenedBy.userId", "fullname profilePic")
      .populate("reactions.userId", "fullname profilePic") // Populate reaction users
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

    // Check if user is the primary admin/owner of the group (only primary admin can delete)
    if (group.admin.toString() !== userId.toString()) {
      return res
        .status(403)
        .json({ error: "Only the group owner can delete the group" });
    }

    // Get all participants before deletion for socket notification
    const allParticipants = [
      group.admin,
      ...(group.admins || []),
      ...group.members,
    ];
    const groupIdStr = groupId.toString();

    // Delete all messages in the group
    const messagesResult = await Message.deleteMany({ groupId: groupIdStr });

    // Delete the group
    await Group.findByIdAndDelete(groupId);

    // ✅ FIX: Use emitToUser for multi-device support
    // Notify all participants (except the deleter) that group was deleted
    allParticipants.forEach((participantId) => {
      const participantIdStr = participantId.toString();
      // Skip the owner — they already handled removal locally
      if (participantIdStr === userId.toString()) return;
      emitToUser(participantIdStr, "groupDeleted", {
        groupId: groupIdStr,
      });
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

    // Check if user is admin (primary or co-admin)
    if (!isGroupAdmin(group, userId)) {
      return res
        .status(403)
        .json({ error: "Only admins can update group info" });
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
    await group.populate("admins", "fullname profilePic"); // Include co-admins
    await group.populate("members", "fullname profilePic");

    // ✅ FIX: Use emitToUser for multi-device support
    // Notify all participants that group info was updated (name, photo, etc.)
    const allMembers = [group.admin, ...(group.admins || []), ...group.members];
    allMembers.forEach((memberId) => {
      const memberIdStr = memberId._id
        ? memberId._id.toString()
        : memberId.toString();
      emitToUser(memberIdStr, "groupInfoUpdated", {
        groupId: id,
        name: group.name,
        groupPic: group.groupPic,
      });
    });

    res.status(200).json(group);
  } catch (error) {
    console.error("Error in updateGroupInfo: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Leave group (members can leave, primary admin must transfer or delete)
export const leaveGroup = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const group = await Group.findById(id);

    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    // Check if user is primary admin, co-admin, or member
    const isPrimaryAdmin = group.admin.toString() === userId.toString();
    const isCoAdmin =
      group.admins &&
      group.admins.some((a) => a.toString() === userId.toString());
    const isRegularMember = group.members.some(
      (m) => m.toString() === userId.toString(),
    );

    if (!isPrimaryAdmin && !isCoAdmin && !isRegularMember) {
      return res
        .status(403)
        .json({ error: "You are not a member of this group" });
    }

    // Primary admin cannot leave - must transfer admin or delete group
    if (isPrimaryAdmin) {
      return res.status(400).json({
        error:
          "Admin cannot leave group. Please transfer admin role or delete the group.",
      });
    }

    // If co-admin is leaving, remove from admins array
    if (isCoAdmin) {
      group.admins = group.admins.filter(
        (a) => a.toString() !== userId.toString(),
      );
    }

    // Remove from members array (in case they're in both)
    group.members = group.members.filter(
      (m) => m.toString() !== userId.toString(),
    );
    await group.save();
    await group.populate("admin", "fullname profilePic");
    await group.populate("admins", "fullname profilePic");
    await group.populate("members", "fullname profilePic");

    // ✅ FIX: Use emitToUser for multi-device support
    // Notify all remaining participants that a member left
    const groupObj = group.toObject ? group.toObject() : group;
    const allParticipants = [
      group.admin,
      ...(group.admins || []),
      ...group.members,
    ];
    const leavePayload = {
      group: groupObj,
      groupId: id,
      leftMemberId: userId.toString(),
    };
    allParticipants.forEach((participantId) => {
      const participantIdStr = participantId._id
        ? participantId._id.toString()
        : participantId.toString();
      emitToUser(participantIdStr, "memberLeftGroup", leavePayload);
    });

    // Notify the user who left
    emitToUser(userId.toString(), "leftGroup", { groupId: id });

    res.status(200).json({ message: "Left group successfully" });
  } catch (error) {
    console.error("Error in leaveGroup: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Transfer admin role to another member
export const transferAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { newAdminId } = req.body;
    const currentUserId = req.user._id;

    if (!newAdminId) {
      return res.status(400).json({ error: "New admin ID is required" });
    }

    const group = await Group.findById(id);

    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    // Only current admin can transfer admin role
    if (group.admin.toString() !== currentUserId.toString()) {
      return res
        .status(403)
        .json({ error: "Only the group admin can transfer admin role" });
    }

    // New admin must be a co-admin or member of the group
    const isCoAdmin =
      group.admins &&
      group.admins.some((a) => a.toString() === newAdminId.toString());
    const isMember = group.members.some(
      (m) => m.toString() === newAdminId.toString(),
    );

    if (!isCoAdmin && !isMember) {
      return res
        .status(400)
        .json({ error: "New admin must be a member of the group" });
    }

    // Validate new admin user exists
    const newAdmin = await User.findById(newAdminId);
    if (!newAdmin) {
      return res.status(404).json({ error: "User not found" });
    }

    // Transfer primary admin role:
    // 1. Remove new admin from admins/members
    // 2. Add old admin to members
    // 3. Set new admin as primary admin
    const oldAdminId = group.admin;

    // Remove from co-admins if they were one
    if (isCoAdmin) {
      group.admins = group.admins.filter(
        (a) => a.toString() !== newAdminId.toString(),
      );
    }
    // Remove from members if they were one
    group.members = group.members.filter(
      (m) => m.toString() !== newAdminId.toString(),
    );
    // Add old admin to members (not as co-admin, just regular member)
    group.members.push(oldAdminId);
    group.admin = newAdminId;

    await group.save();
    await group.populate("admin", "fullname profilePic");
    await group.populate("admins", "fullname profilePic");
    await group.populate("members", "fullname profilePic");

    // Notify all participants via socket (multi-device)
    const allParticipants = [
      group.admin,
      ...(group.admins || []),
      ...group.members,
    ];
    allParticipants.forEach((participant) => {
      const participantIdStr = participant._id
        ? participant._id.toString()
        : participant.toString();
      emitToUser(participantIdStr, "groupAdminChanged", {
        groupId: id,
        oldAdminId: oldAdminId.toString(),
        newAdminId: newAdminId.toString(),
      });
    });

    res.status(200).json({
      success: true,
      message: "Admin role transferred successfully",
      data: group,
    });
  } catch (error) {
    console.error("Error in transferAdmin: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Search groups by name
export const searchGroups = async (req, res) => {
  try {
    const { query, limit = 20 } = req.query;
    const userId = req.user._id;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Search query is required",
      });
    }

    // Get all groups where user is a member
    const groups = await Group.find({
      members: userId,
    })
      .populate("members", "fullname email profilePic")
      .populate("admin", "fullname email profilePic")
      .sort({ updatedAt: -1 });

    // Performance: Case-insensitive substring matching
    // UX: Search both name and description for better discoverability
    const searchQuery = query.toLowerCase().trim();
    const filteredGroups = groups.filter((group) => {
      const groupName = (group.name || "").toLowerCase();
      const description = (group.description || "").toLowerCase();
      return (
        groupName.includes(searchQuery) || description.includes(searchQuery)
      );
    });

    // Production log: Only log search stats
    // console.log( // [DEBUG - Removed for production]
    // `🔍 Group search: "${query}" → ${filteredGroups.length}/${groups.length} results`
    // );

    // Apply limit
    const limitedResults = filteredGroups.slice(0, parseInt(limit));

    res.status(200).json({
      success: true,
      message: "Groups search completed successfully",
      data: limitedResults,
      pagination: {
        total: filteredGroups.length,
        returned: limitedResults.length,
        limit: parseInt(limit),
      },
    });
  } catch (error) {
    console.error("Search groups error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Promote member to co-admin
export const promoteToAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { memberId } = req.body;
    const currentUserId = req.user._id;

    if (!memberId) {
      return res.status(400).json({ error: "Member ID is required" });
    }

    const group = await Group.findById(id);

    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    // Only admins can promote members
    if (!isGroupAdmin(group, currentUserId)) {
      return res.status(403).json({ error: "Only admins can promote members" });
    }

    // Check if user is already admin
    if (group.admin.toString() === memberId.toString()) {
      return res.status(400).json({ error: "User is already primary admin" });
    }

    const isAlreadyCoAdmin =
      group.admins &&
      group.admins.some((a) => a.toString() === memberId.toString());
    if (isAlreadyCoAdmin) {
      return res.status(400).json({ error: "User is already a co-admin" });
    }

    // Check if user is a member
    const isMember = group.members.some(
      (m) => m.toString() === memberId.toString(),
    );
    if (!isMember) {
      return res
        .status(400)
        .json({ error: "User is not a member of this group" });
    }

    // Validate user exists
    const user = await User.findById(memberId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Promote: Remove from members, add to admins
    group.members = group.members.filter(
      (m) => m.toString() !== memberId.toString(),
    );
    if (!group.admins) {
      group.admins = [];
    }
    group.admins.push(memberId);

    await group.save();
    await group.populate("admin", "fullname profilePic");
    await group.populate("admins", "fullname profilePic");
    await group.populate("members", "fullname profilePic");

    // Notify all participants via socket (multi-device)
    const allParticipants = [
      group.admin,
      ...(group.admins || []),
      ...group.members,
    ];
    allParticipants.forEach((participant) => {
      const participantIdStr = participant._id
        ? participant._id.toString()
        : participant.toString();
      emitToUser(participantIdStr, "memberPromotedToAdmin", {
        groupId: id,
        promotedMemberId: memberId.toString(),
      });
    });

    res.status(200).json({
      success: true,
      message: "Member promoted to admin successfully",
      data: group,
    });
  } catch (error) {
    console.error("Error in promoteToAdmin: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Demote co-admin to regular member
export const demoteFromAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { adminId } = req.body;
    const currentUserId = req.user._id;

    if (!adminId) {
      return res.status(400).json({ error: "Admin ID is required" });
    }

    const group = await Group.findById(id);

    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    // Only primary admin can demote co-admins
    if (group.admin.toString() !== currentUserId.toString()) {
      return res
        .status(403)
        .json({ error: "Only primary admin can demote co-admins" });
    }

    // Cannot demote primary admin
    if (group.admin.toString() === adminId.toString()) {
      return res.status(400).json({ error: "Cannot demote primary admin" });
    }

    // Check if user is a co-admin
    const isCoAdmin =
      group.admins &&
      group.admins.some((a) => a.toString() === adminId.toString());
    if (!isCoAdmin) {
      return res.status(400).json({ error: "User is not a co-admin" });
    }

    // Demote: Remove from admins, add to members
    group.admins = group.admins.filter(
      (a) => a.toString() !== adminId.toString(),
    );
    group.members.push(adminId);

    await group.save();
    await group.populate("admin", "fullname profilePic");
    await group.populate("admins", "fullname profilePic");
    await group.populate("members", "fullname profilePic");

    // Notify all participants via socket (multi-device)
    const allParticipants = [
      group.admin,
      ...(group.admins || []),
      ...group.members,
    ];
    allParticipants.forEach((participant) => {
      const participantIdStr = participant._id
        ? participant._id.toString()
        : participant.toString();
      emitToUser(participantIdStr, "adminDemoted", {
        groupId: id,
        demotedAdminId: adminId.toString(),
      });
    });

    res.status(200).json({
      success: true,
      message: "Admin demoted to member successfully",
      data: group,
    });
  } catch (error) {
    console.error("Error in demoteFromAdmin: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// BATCH UPDATE MEMBERS - Single endpoint for all member changes
// ═══════════════════════════════════════════════════════════════════════════
/**
 * PUT /api/groups/:id/batch-update-members
 *
 * Performs all member changes in a single atomic operation:
 * - Add new members
 * - Remove members
 * - Promote members to admin
 * - Demote admins to members
 *
 * This is more efficient than making multiple API calls and avoids race conditions.
 *
 * @body {string[]} membersToAdd - User IDs to add as regular members
 * @body {string[]} membersToRemove - User IDs to remove from group
 * @body {string[]} membersToPromote - User IDs to promote to co-admin
 * @body {string[]} adminsToDemote - Co-admin user IDs to demote to member
 */
export const batchUpdateMembers = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      membersToAdd = [],
      membersToRemove = [],
      membersToPromote = [],
      adminsToDemote = [],
    } = req.body;
    const currentUserId = req.user._id;

    // Validate input
    if (
      !Array.isArray(membersToAdd) ||
      !Array.isArray(membersToRemove) ||
      !Array.isArray(membersToPromote) ||
      !Array.isArray(adminsToDemote)
    ) {
      return res
        .status(400)
        .json({ error: "Invalid input: all fields must be arrays" });
    }

    // Skip if no changes
    const hasChanges =
      membersToAdd.length > 0 ||
      membersToRemove.length > 0 ||
      membersToPromote.length > 0 ||
      adminsToDemote.length > 0;
    if (!hasChanges) {
      return res.status(200).json({
        success: true,
        message: "No changes to apply",
        data: null,
      });
    }

    const group = await Group.findById(id);
    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    // Only admins can update members
    if (!isGroupAdmin(group, currentUserId)) {
      return res
        .status(403)
        .json({ error: "Only admins can update group members" });
    }

    const primaryAdminId = group.admin.toString();
    const changes = {
      added: [],
      removed: [],
      promoted: [],
      demoted: [],
      errors: [],
    };

    // Get all existing participant IDs for validation
    const existingMemberIds = new Set(group.members.map((m) => m.toString()));
    const existingAdminIds = new Set(
      (group.admins || []).map((a) => a.toString()),
    );

    // ============================================
    // STEP 1: ADD NEW MEMBERS
    // ============================================
    if (membersToAdd.length > 0) {
      const allExistingIds = new Set([
        primaryAdminId,
        ...existingAdminIds,
        ...existingMemberIds,
      ]);

      const validNewMembers = membersToAdd.filter(
        (id) => !allExistingIds.has(id.toString()),
      );

      if (validNewMembers.length > 0) {
        // Validate users exist
        const validUsers = await User.find({ _id: { $in: validNewMembers } });
        const validUserIds = validUsers.map((u) => u._id.toString());

        for (const userId of validUserIds) {
          if (!group.members.some((m) => m.toString() === userId)) {
            group.members.push(userId);
            changes.added.push(userId);
            existingMemberIds.add(userId); // Update local set for subsequent operations
          }
        }
      }
    }

    // ============================================
    // STEP 2: PROMOTE MEMBERS TO ADMIN
    // ============================================
    for (const memberId of membersToPromote) {
      const memberIdStr = memberId.toString();

      // Skip if already admin or primary admin
      if (memberIdStr === primaryAdminId || existingAdminIds.has(memberIdStr)) {
        continue;
      }

      // Must be a member to promote (includes newly added)
      const isMember =
        existingMemberIds.has(memberIdStr) ||
        group.members.some((m) => m.toString() === memberIdStr);
      if (!isMember) {
        changes.errors.push({
          userId: memberIdStr,
          error: "User is not a member",
        });
        continue;
      }

      // Remove from members, add to admins
      group.members = group.members.filter((m) => m.toString() !== memberIdStr);
      if (!group.admins) group.admins = [];
      if (!group.admins.some((a) => a.toString() === memberIdStr)) {
        group.admins.push(memberId);
        changes.promoted.push(memberIdStr);
        existingMemberIds.delete(memberIdStr);
        existingAdminIds.add(memberIdStr);
      }
    }

    // ============================================
    // STEP 3: DEMOTE ADMINS TO MEMBERS
    // ============================================
    for (const adminId of adminsToDemote) {
      const adminIdStr = adminId.toString();

      // Cannot demote primary admin
      if (adminIdStr === primaryAdminId) {
        changes.errors.push({
          userId: adminIdStr,
          error: "Cannot demote primary admin",
        });
        continue;
      }

      // Must be a co-admin to demote
      const isCoAdmin =
        existingAdminIds.has(adminIdStr) ||
        (group.admins && group.admins.some((a) => a.toString() === adminIdStr));
      if (!isCoAdmin) {
        continue;
      }

      // Remove from admins, add to members
      group.admins = (group.admins || []).filter(
        (a) => a.toString() !== adminIdStr,
      );
      if (!group.members.some((m) => m.toString() === adminIdStr)) {
        group.members.push(adminId);
        changes.demoted.push(adminIdStr);
        existingAdminIds.delete(adminIdStr);
        existingMemberIds.add(adminIdStr);
      }
    }

    // ============================================
    // STEP 4: REMOVE MEMBERS
    // ============================================
    for (const memberId of membersToRemove) {
      const memberIdStr = memberId.toString();

      // Cannot remove primary admin
      if (memberIdStr === primaryAdminId) {
        changes.errors.push({
          userId: memberIdStr,
          error: "Cannot remove primary admin",
        });
        continue;
      }

      // Remove from both members and admins arrays
      const wasAdmin =
        group.admins && group.admins.some((a) => a.toString() === memberIdStr);
      const wasMember = group.members.some((m) => m.toString() === memberIdStr);

      if (wasAdmin || wasMember) {
        group.members = group.members.filter(
          (m) => m.toString() !== memberIdStr,
        );
        group.admins = (group.admins || []).filter(
          (a) => a.toString() !== memberIdStr,
        );
        changes.removed.push(memberIdStr);
      }
    }

    // Save all changes in single database write
    await group.save();
    await group.populate("admin", "fullname profilePic");
    await group.populate("admins", "fullname profilePic");
    await group.populate("members", "fullname profilePic");

    // Notify all participants via socket (single notification)
    const allParticipants = [
      group.admin,
      ...(group.admins || []),
      ...group.members,
    ];

    // ✅ FIX: Use emitToUser for multi-device support
    // Notify all current participants about member changes
    const addedSet = new Set(changes.added);
    allParticipants.forEach((participant) => {
      const participantIdStr = participant._id
        ? participant._id.toString()
        : participant.toString();
      emitToUser(participantIdStr, "groupMembersUpdated", {
        groupId: id,
        changes,
      });
    });

    // Notify newly added members with addedToGroup so the group appears
    // in their groups list immediately (consistent with addMembersToGroup)
    changes.added.forEach((addedId) => {
      emitToUser(addedId, "addedToGroup", { group, memberId: addedId });
    });

    // Also notify removed members (they're no longer in allParticipants)
    changes.removed.forEach((removedId) => {
      emitToUser(removedId, "removedFromGroup", {
        groupId: id,
        memberId: removedId,
      });
    });

    res.status(200).json({
      success: true,
      message: "Members updated successfully",
      data: group,
      changes,
    });
  } catch (error) {
    console.error("Error in batchUpdateMembers: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};
