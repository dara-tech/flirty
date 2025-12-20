import Call from "../model/call.model.js";
import User from "../model/user.model.js";
import { paginatedResponse } from "../lib/apiResponse.js";
import logger from "../lib/logger.js";
import mongoose from "mongoose";

// Get call history for the logged-in user
export const getCallHistory = async (req, res) => {
  try {
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    // Convert userId to ObjectId for proper querying
    const userIdObjectId = new mongoose.Types.ObjectId(userId);

    // Get all calls where user is either caller or receiver
    const calls = await Call.find({
      $or: [
        { callerId: userIdObjectId },
        { receiverId: userIdObjectId }
      ]
    })
      .populate("callerId", "fullname profilePic")
      .populate("receiverId", "fullname profilePic")
      .populate("groupId", "name groupPic")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Call.countDocuments({
      $or: [
        { callerId: userIdObjectId },
        { receiverId: userIdObjectId }
      ]
    });

    // Transform calls to match frontend format
    // If no calls, return empty array
    let transformedCalls = [];
    
    if (calls && calls.length > 0) {
      transformedCalls = calls
        .filter(call => {
          // Filter out calls with missing user data
          if (!call || !call.callerId || !call.receiverId) {
            return false;
          }
          // Ensure both users have _id
          const callerId = call.callerId._id || call.callerId;
          const receiverId = call.receiverId._id || call.receiverId;
          return callerId && receiverId;
        })
        .map(call => {
          try {
            const callerId = call.callerId._id || call.callerId;
            const receiverId = call.receiverId._id || call.receiverId;
            const callerIdStr = callerId.toString();
            const receiverIdStr = receiverId.toString();
            const userIdStr = userId.toString();
            
            const isCaller = callerIdStr === userIdStr;
            const otherUser = isCaller ? call.receiverId : call.callerId;
            
            // Skip if otherUser is missing
            if (!otherUser) {
              return null;
            }
            
            const otherUserId = otherUser._id || otherUser;
            if (!otherUserId) {
              return null;
            }
            
            return {
              id: call._id.toString(),
              contact: {
                _id: otherUserId.toString(),
                fullname: otherUser.fullname || "Unknown",
                profilePic: otherUser.profilePic || null,
              },
              type: isCaller ? "outgoing" : "incoming",
              status: call.status || "missed",
              duration: call.duration || 0,
              timestamp: call.createdAt || call.startedAt || new Date(),
              count: 1, // TODO: Group consecutive calls with same contact
            };
          } catch (err) {
            logger.error("Error transforming call", { error: err.message, call });
            return null;
          }
        })
        .filter(call => call !== null); // Remove any null entries
    }

    paginatedResponse(
      res,
      transformedCalls,
      {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total,
      },
      'Call history retrieved successfully'
    );
  } catch (error) {
    logger.error("Error in getCallHistory", {
      requestId: req?.requestId,
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ 
      success: false,
      error: "Internal server error" 
    });
  }
};

// Delete call(s)
export const deleteCalls = async (req, res) => {
  try {
    const userId = req.user._id;
    const { callIds } = req.body; // Array of call IDs to delete

    if (!callIds || !Array.isArray(callIds) || callIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: "callIds array is required"
      });
    }

    // Verify that all calls belong to the user (as caller or receiver)
    const calls = await Call.find({
      _id: { $in: callIds },
      $or: [
        { callerId: userId },
        { receiverId: userId }
      ]
    });

    if (calls.length !== callIds.length) {
      return res.status(403).json({
        success: false,
        error: "Some calls not found or you don't have permission to delete them"
      });
    }

    // Delete the calls
    await Call.deleteMany({
      _id: { $in: callIds }
    });

    res.status(200).json({
      success: true,
      message: `${callIds.length} call${callIds.length > 1 ? 's' : ''} deleted successfully`,
      data: { deletedCount: callIds.length }
    });
  } catch (error) {
    logger.error("Error in deleteCalls", {
      requestId: req?.requestId,
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
};

// Get call statistics for the logged-in user
export const getCallStats = async (req, res) => {
  try {
    const userId = req.user._id;
    const userIdObjectId = new mongoose.Types.ObjectId(userId);

    // Get all calls where user is either caller or receiver
    const allCalls = await Call.find({
      $or: [
        { callerId: userIdObjectId },
        { receiverId: userIdObjectId }
      ]
    }).lean();

    // Calculate statistics
    const totalCalls = allCalls.length;
    
    // Count by status
    const answered = allCalls.filter(call => call.status === "answered").length;
    const missed = allCalls.filter(call => call.status === "missed").length;
    const rejected = allCalls.filter(call => call.status === "rejected").length;
    const cancelled = allCalls.filter(call => call.status === "cancelled").length;
    
    // Count by type
    const voiceCalls = allCalls.filter(call => call.callType === "voice").length;
    const videoCalls = allCalls.filter(call => call.callType === "video").length;
    
    // Count by direction
    const outgoing = allCalls.filter(call => 
      call.callerId.toString() === userId.toString()
    ).length;
    const incoming = allCalls.filter(call => 
      call.receiverId.toString() === userId.toString()
    ).length;
    
    // Calculate total duration (only for answered calls)
    const totalDuration = allCalls
      .filter(call => call.status === "answered" && call.duration)
      .reduce((sum, call) => sum + (call.duration || 0), 0);
    
    // Get recent calls (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentCalls = allCalls.filter(call => 
      new Date(call.createdAt) >= sevenDaysAgo
    ).length;

    res.status(200).json({
      success: true,
      message: "Call statistics retrieved successfully",
      data: {
        total: totalCalls,
        byStatus: {
          answered,
          missed,
          rejected,
          cancelled,
        },
        byType: {
          voice: voiceCalls,
          video: videoCalls,
        },
        byDirection: {
          outgoing,
          incoming,
        },
        totalDuration, // Total duration in seconds
        recentCalls, // Calls in last 7 days
      },
    });
  } catch (error) {
    logger.error("Error in getCallStats", {
      requestId: req?.requestId,
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// Create a call record (called from socket when call ends)
export const createCallRecord = async (callData) => {
  try {
    const call = new Call({
      callerId: callData.callerId,
      receiverId: callData.receiverId,
      groupId: callData.groupId || null,
      callType: callData.callType,
      status: callData.status, // "answered", "missed", "rejected", "cancelled"
      duration: callData.duration || 0,
      startedAt: callData.startedAt || new Date(),
      endedAt: callData.endedAt || new Date(),
    });

    await call.save();
    return call;
  } catch (error) {
    logger.error("Error in createCallRecord", {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
};

