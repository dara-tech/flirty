import Group from "../model/group.model.js";
import Message from "../model/message.model.js";
import User from "../model/user.model.js";
import ContactRequest from "../model/contactRequest.model.js";
import cloudinary from "../lib/cloudinary.js";
import { io, getReceiverSocketId } from "../lib/socket.js";
import mongoose from "mongoose";

// Helper function to check if users are contacts
const areContacts = async (userId, memberIds) => {
  if (!memberIds || memberIds.length === 0) return true;

  // Convert all IDs to ObjectId for proper comparison
  const userIdObj = new mongoose.Types.ObjectId(userId);
  const memberIdsObj = memberIds.map(id => new mongoose.Types.ObjectId(id));

  // Check if all memberIds are contacts (have accepted contact requests)
  const contactRequests = await ContactRequest.find({
    $or: [
      { senderId: userIdObj, receiverId: { $in: memberIdsObj }, status: "accepted" },
      { receiverId: userIdObj, senderId: { $in: memberIdsObj }, status: "accepted" }
    ]
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
  const memberIdStrings = memberIds.map(id => id.toString());
  return memberIdStrings.every(id => contactUserIds.has(id));
};

// Create a new group
export const createGroup = async (req, res) => {
  try {
    const { name, description, groupPic, memberIds } = req.body;
    const adminId = req.user._id;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Group name is required" });
    }

    // Validate that all members are contacts
    if (memberIds && Array.isArray(memberIds) && memberIds.length > 0) {
      // Remove duplicates and filter out admin
      const uniqueMemberIds = [...new Set(memberIds)]
        .filter(id => id.toString() !== adminId.toString());
      
      if (uniqueMemberIds.length > 0) {
        const allAreContacts = await areContacts(adminId, uniqueMemberIds);
        if (!allAreContacts) {
          return res.status(400).json({ 
            error: "All group members must be in your contacts list" 
          });
        }
      }
    }

    let groupPicUrl = "";
    if (groupPic) {
      const uploadResponse = await cloudinary.uploader.upload(groupPic);
      groupPicUrl = uploadResponse.secure_url;
    }

    // Create group - admin is separate, members array should not include admin
    const members = [];
    if (memberIds && Array.isArray(memberIds)) {
      // Add other members, avoiding duplicates and excluding admin
      memberIds.forEach((id) => {
        const idStr = id.toString();
        if (idStr !== adminId.toString() && !members.some(m => m.toString() === idStr)) {
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

    // Notify all members via socket
    members.forEach((memberId) => {
      io.emit("groupCreated", { group: newGroup, memberId });
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
      $or: [
        { admin: userId },
        { members: userId },
      ],
    })
      .populate("admin", "fullname profilePic")
      .populate("members", "fullname profilePic")
      .sort({ updatedAt: -1 });

    res.status(200).json(groups);
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
      $or: [
        { admin: userId },
        { members: userId },
      ],
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
      (id) => !existingMemberIds.includes(id.toString()) && 
              id.toString() !== group.admin.toString()
    );

    if (newMemberIds.length === 0) {
      return res.status(400).json({ error: "All users are already members" });
    }

    // Check if all new members are contacts
    const allAreContacts = await areContacts(userId, newMemberIds);
    if (!allAreContacts) {
      return res.status(400).json({ 
        error: "All group members must be in your contacts list" 
      });
    }

    group.members.push(...newMemberIds);
    await group.save();
    await group.populate("admin", "fullname profilePic");
    await group.populate("members", "fullname profilePic");

    // Notify new members via socket
    newMemberIds.forEach((memberId) => {
      io.emit("addedToGroup", { group, memberId });
    });

    res.status(200).json(group);
  } catch (error) {
    console.error("Error in addMembersToGroup: ", error.message);
    res.status(500).json({ error: "Internal server error" });
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

    group.members = group.members.filter(
      (m) => m.toString() !== memberId
    );
    await group.save();
    await group.populate("admin", "fullname profilePic");
    await group.populate("members", "fullname profilePic");

    // Notify removed member via socket
    io.emit("removedFromGroup", { group, memberId });

    res.status(200).json(group);
  } catch (error) {
    console.error("Error in removeMemberFromGroup: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get group messages
export const getGroupMessages = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    // Check if user is a member of the group
    const group = await Group.findById(id);
    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    const isMember =
      group.admin.toString() === userId.toString() ||
      group.members.some((m) => m.toString() === userId.toString());

    if (!isMember) {
      return res.status(403).json({ error: "You are not a member of this group" });
    }

    const messages = await Message.find({ groupId: id })
      .populate("senderId", "fullname profilePic")
      .populate("seenBy.userId", "fullname profilePic")
      .sort({ createdAt: 1 });

    res.status(200).json(messages);
  } catch (error) {
    console.error("Error in getGroupMessages: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Send message to group
export const sendGroupMessage = async (req, res) => {
  try {
    const { text, image, audio } = req.body;
    const { id: groupId } = req.params;
    const senderId = req.user._id;

    // Validate that at least one of text, image, or audio is provided
    if (!text && !image && !audio) {
      return res.status(400).json({ error: "Message must contain either text, image, or audio" });
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
      return res.status(403).json({ error: "You are not a member of this group" });
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
      groupId,
      text: text || "",
      image: imageUrl,
      audio: audioUrl,
    });

    await newMessage.save();
    await newMessage.populate("senderId", "fullname profilePic");
    await newMessage.populate("seenBy.userId", "fullname profilePic");

    // Emit to all group members
    const allMembers = [group.admin, ...group.members];
    allMembers.forEach((memberId) => {
      io.emit("newGroupMessage", {
        message: newMessage,
        groupId,
        memberId: memberId.toString(),
      });
    });

    res.status(201).json(newMessage);
  } catch (error) {
    console.error("Error in sendGroupMessage: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get last messages for groups
export const getGroupLastMessages = async (req, res) => {
  try {
    const userId = req.user._id;

    // Get all groups user is part of
    const groups = await Group.find({
      $or: [
        { admin: userId },
        { members: userId },
      ],
    }).select("_id");

    const groupIds = groups.map((g) => g._id);

    if (groupIds.length === 0) {
      return res.status(200).json([]);
    }

    // Get last message for each group
    const lastMessages = await Message.aggregate([
      {
        $match: {
          groupId: { $in: groupIds },
        },
      },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$groupId",
          lastMessage: { $first: "$$ROOT" },
        },
      },
      { $replaceRoot: { newRoot: "$lastMessage" } },
    ]);

    // Populate senderId for each message
    const populatedMessages = await Promise.all(
      lastMessages.map(async (msg) => {
        const populated = await Message.findById(msg._id)
          .populate("senderId", "fullname profilePic")
          .populate("seenBy.userId", "fullname profilePic");
        return populated || msg;
      })
    );

    res.status(200).json(populatedMessages);
  } catch (error) {
    console.error("Error in getGroupLastMessages: ", error.message);
    res.status(500).json({ error: "Internal server error" });
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
      return res.status(403).json({ error: "Only the group owner can delete the group" });
    }

    // Get all members before deletion for socket notification
    const allMembers = [group.admin, ...group.members];
    const groupIdStr = groupId.toString();

    // Delete all messages in the group
    const messagesResult = await Message.deleteMany({ groupId: groupIdStr });
    console.log(`Deleted ${messagesResult.deletedCount} messages from group ${groupIdStr}`);

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
        console.log(`Emitted groupDeleted to member socket ${memberSocketId} for userId: ${memberIdStr}`);
      } else {
        console.log(`Member socket not found for userId: ${memberIdStr}`);
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
      return res.status(403).json({ error: "Only admin can update group info" });
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
      const uploadResponse = await cloudinary.uploader.upload(groupPic);
      group.groupPic = uploadResponse.secure_url;
    }

    await group.save();
    await group.populate("admin", "fullname profilePic");
    await group.populate("members", "fullname profilePic");

    // Notify all members via socket
    const allMembers = [group.admin, ...group.members];
    allMembers.forEach((memberId) => {
      const memberIdStr = memberId._id ? memberId._id.toString() : memberId.toString();
      io.emit("groupInfoUpdated", {
        group,
        memberId: memberIdStr,
      });
    });

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
    const isMember = isAdmin || group.members.some((m) => m.toString() === userId.toString());

    if (!isMember) {
      return res.status(403).json({ error: "You are not a member of this group" });
    }

    // Admin cannot leave - must transfer admin or delete group
    if (isAdmin) {
      return res.status(400).json({ 
        error: "Admin cannot leave group. Please transfer admin role or delete the group." 
      });
    }

    // Remove member from group
    group.members = group.members.filter((m) => m.toString() !== userId.toString());
    await group.save();
    await group.populate("admin", "fullname profilePic");
    await group.populate("members", "fullname profilePic");

    // Notify all remaining members via socket
    const allMembers = [group.admin, ...group.members];
    allMembers.forEach((memberId) => {
      const memberIdStr = memberId._id ? memberId._id.toString() : memberId.toString();
      io.emit("memberLeftGroup", {
        group,
        memberId: memberIdStr,
        leftMemberId: userId.toString(),
      });
    });

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

