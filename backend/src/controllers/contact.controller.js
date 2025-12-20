import ContactRequest from "../model/contactRequest.model.js";
import User from "../model/user.model.js";
import { io, getReceiverSocketId } from "../lib/socket.js";

// Send contact request
export const sendContactRequest = async (req, res) => {
  try {
    const { email } = req.body;
    const senderId = req.user._id;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    // Find receiver by email
    const receiver = await User.findOne({ email });
    if (!receiver) {
      return res.status(404).json({ message: "User not found" });
    }

    if (receiver._id.toString() === senderId.toString()) {
      return res.status(400).json({ message: "Cannot send request to yourself" });
    }

    // Check if request already exists
    const existingRequest = await ContactRequest.findOne({
      $or: [
        { senderId, receiverId: receiver._id },
        { senderId: receiver._id, receiverId: senderId },
      ],
    });

    if (existingRequest) {
      if (existingRequest.status === "pending") {
        // Check if it's the same request or reverse
        if (existingRequest.senderId.toString() === senderId.toString()) {
          return res.status(400).json({ message: "Request already sent" });
        } else {
          return res.status(400).json({ message: "This user has already sent you a request. Please check your requests." });
        }
      }
      if (existingRequest.status === "accepted") {
        return res.status(400).json({ message: "Already contacts" });
      }
      // If rejected, delete the old request (regardless of direction) to allow a new request
      if (existingRequest.status === "rejected") {
        await ContactRequest.findByIdAndDelete(existingRequest._id);
        // Continue to create a new request below
      }
    }

    // Create new request - handle duplicate key error
    let request;
    try {
      request = new ContactRequest({
        senderId,
        receiverId: receiver._id,
        status: "pending",
      });

      await request.save();
    } catch (error) {
      // Handle duplicate key error (MongoDB unique index violation)
      if (error.code === 11000 || error.codeName === 'DuplicateKey') {
        // Re-check the existing request to get the current status
        const duplicateRequest = await ContactRequest.findOne({
          $or: [
            { senderId, receiverId: receiver._id },
            { senderId: receiver._id, receiverId: senderId },
          ],
        });
        
        if (duplicateRequest) {
          if (duplicateRequest.status === "pending") {
            if (duplicateRequest.senderId.toString() === senderId.toString()) {
              return res.status(400).json({ message: "Request already sent" });
            } else {
              return res.status(400).json({ message: "This user has already sent you a request. Please check your requests." });
            }
          }
          if (duplicateRequest.status === "accepted") {
            return res.status(400).json({ message: "Already contacts" });
          }
          // If rejected, delete and try again
          if (duplicateRequest.status === "rejected") {
            await ContactRequest.findByIdAndDelete(duplicateRequest._id);
            // Retry creating the request
            request = new ContactRequest({
              senderId,
              receiverId: receiver._id,
              status: "pending",
            });
            await request.save();
            
            // Populate sender info for socket event
            await request.populate("senderId", "fullname email profilePic");
            
            // Emit socket event to receiver
            const receiverSocketId = getReceiverSocketId(receiver._id.toString());
            if (receiverSocketId) {
              io.to(receiverSocketId).emit("newContactRequest", {
                requestId: request._id,
                senderId: {
                  _id: req.user._id,
                  fullname: req.user.fullname,
                  email: req.user.email,
                  profilePic: req.user.profilePic,
                },
                createdAt: request.createdAt,
              });
            }
            
            return res.status(201).json({ message: "Contact request sent", request });
          }
        }
        return res.status(400).json({ message: "Request already exists" });
      }
      // Re-throw other errors
      throw error;
    }

    // Populate sender info for socket event
    await request.populate("senderId", "fullname email profilePic");
    
    // Emit socket event to receiver
    const receiverSocketId = getReceiverSocketId(receiver._id.toString());
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("newContactRequest", {
        requestId: request._id,
        senderId: {
          _id: req.user._id,
          fullname: req.user.fullname,
          email: req.user.email,
          profilePic: req.user.profilePic,
        },
        createdAt: request.createdAt,
      });
    }

    res.status(201).json({ message: "Contact request sent", request });
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get pending requests (received)
export const getPendingRequests = async (req, res) => {
  try {
    const userId = req.user._id;

    const requests = await ContactRequest.find({
      receiverId: userId,
      status: "pending",
    })
      .populate("senderId", "fullname email profilePic")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      message: 'Pending requests retrieved successfully',
      data: requests
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Accept contact request
export const acceptContactRequest = async (req, res) => {
  try {
    const { requestId } = req.body;
    const userId = req.user._id;

    if (!requestId) {
      return res.status(400).json({ message: "Request ID is required" });
    }

    const request = await ContactRequest.findById(requestId);

    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }

    if (request.receiverId.toString() !== userId.toString()) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    if (request.status !== "pending") {
      return res.status(400).json({ message: "Request already processed" });
    }

    request.status = "accepted";
    await request.save();
    
    // Populate sender and receiver info
    await request.populate("senderId", "fullname email profilePic");
    await request.populate("receiverId", "fullname email profilePic");
    
    // Add each other to contacts list
    await User.findByIdAndUpdate(userId, { $addToSet: { contacts: request.senderId } });
    await User.findByIdAndUpdate(request.senderId, { $addToSet: { contacts: userId } });
    
    // Emit socket events to both users
    const senderSocketId = getReceiverSocketId(request.senderId.toString());
    const receiverSocketId = getReceiverSocketId(userId.toString());
    
    if (senderSocketId) {
      io.to(senderSocketId).emit("contactRequestAccepted", {
        requestId: request._id,
        contact: {
          _id: req.user._id,
          fullname: req.user.fullname,
          email: req.user.email,
          profilePic: req.user.profilePic,
        },
      });
    }
    
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("contactRequestAccepted", {
        requestId: request._id,
        contact: {
          _id: request.senderId._id,
          fullname: request.senderId.fullname,
          email: request.senderId.email,
          profilePic: request.senderId.profilePic,
        },
      });
    }

    res.status(200).json({ message: "Contact request accepted", request });
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
};

// Reject contact request
export const rejectContactRequest = async (req, res) => {
  try {
    const { requestId } = req.body;
    const userId = req.user._id;

    if (!requestId) {
      return res.status(400).json({ message: "Request ID is required" });
    }

    const request = await ContactRequest.findById(requestId);

    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }

    if (request.receiverId.toString() !== userId.toString()) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    if (request.status !== "pending") {
      return res.status(400).json({ message: "Request already processed" });
    }

    request.status = "rejected";
    await request.save();
    
    // Populate sender info
    await request.populate("senderId", "fullname email profilePic");
    
    // Emit socket event to sender
    const senderSocketId = getReceiverSocketId(request.senderId.toString());
    if (senderSocketId) {
      io.to(senderSocketId).emit("contactRequestRejected", {
        requestId: request._id,
        receiverId: userId.toString(),
      });
    }
    
    // Also notify receiver that the request was rejected
    const receiverSocketId = getReceiverSocketId(userId.toString());
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("contactRequestRejected", {
        requestId: request._id,
        receiverId: userId.toString(),
      });
    }

    res.status(200).json({ message: "Contact request rejected" });
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get contacts (accepted requests)
export const getContacts = async (req, res) => {
  try {
    const userId = req.user._id;

    // Get all accepted requests where user is sender or receiver
    const contacts = await ContactRequest.find({
      $or: [{ senderId: userId }, { receiverId: userId }],
      status: "accepted",
    })
      .populate("senderId", "fullname email profilePic")
      .populate("receiverId", "fullname email profilePic")
      .sort({ updatedAt: -1 });

    // Extract the other user from each contact
    const contactUsers = contacts.map((contact) => {
      const isSender = contact.senderId._id.toString() === userId.toString();
      return isSender ? contact.receiverId : contact.senderId;
    });

    // Use standardized response
    res.status(200).json({
      success: true,
      message: 'Contacts retrieved successfully',
      data: contactUsers
    });
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get contact status with a user
export const getContactStatus = async (req, res) => {
  try {
    const { userId: otherUserId } = req.params;
    const currentUserId = req.user._id;

    const request = await ContactRequest.findOne({
      $or: [
        { senderId: currentUserId, receiverId: otherUserId },
        { senderId: otherUserId, receiverId: currentUserId },
      ],
    });

    if (!request) {
      return res.status(200).json({ status: "none" });
    }

    res.status(200).json({ status: request.status, requestId: request._id });
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
};

