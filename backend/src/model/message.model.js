// message.model.js
import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  receiverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    // Required only if not a group message
    required: function() {
      return !this.groupId;
    }
  },
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Group",
    // Required only if not a direct message
    required: function() {
      return !this.receiverId;
    }
  },
  text: {
    type: String,
    // Only require text if there's no image, audio, video, file, or link
    required: function() {
      return !this.image && !this.audio && !this.video && !this.file && !this.link;
    }
  },
  image: {
    type: String,
  },
  audio: {
    type: String,
  },
  video: {
    type: String, // URL to the video
  },
  file: {
    type: String, // URL to the file
  },
  fileName: {
    type: String, // Original filename
  },
  fileSize: {
    type: Number, // File size in bytes
  },
  fileType: {
    type: String, // MIME type
  },
  link: {
    type: String, // URL
  },
  linkPreview: {
    type: {
      url: String,
      title: String,
      description: String,
      image: String,
    },
  },
  seen: {
    type: Boolean,
    default: false,
  },
  seenAt: {
    type: Date,
  },
  seenBy: [
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      seenAt: {
        type: Date,
        default: Date.now,
      },
    },
  ],
  edited: {
    type: Boolean,
    default: false,
  },
  editedAt: {
    type: Date,
  },
  pinned: {
    type: Boolean,
    default: false,
  },
  pinnedAt: {
    type: Date,
  },
  pinnedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  reactions: [
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
      emoji: {
        type: String,
        required: true,
      },
      createdAt: {
        type: Date,
        default: Date.now,
      },
    },
  ],
  // Forward tracking
  forwardedFrom: {
    type: {
      messageId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Message",
      },
      senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      senderName: String,
      chatType: {
        type: String,
        enum: ["user", "group"],
      },
      chatId: mongoose.Schema.Types.ObjectId,
      chatName: String,
      forwardedAt: {
        type: Date,
        default: Date.now,
      },
    },
  },
  // Listen tracking for voice messages
  listenedBy: [
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      listenedAt: {
        type: Date,
        default: Date.now,
      },
    },
  ],
  // Saved messages tracking
  savedBy: [
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      savedAt: {
        type: Date,
        default: Date.now,
      },
    },
  ],
}, { timestamps: true });

// Indexes for query performance
// Index for direct messages between two users (sorted by time)
messageSchema.index({ senderId: 1, receiverId: 1, createdAt: -1 });
// Index for group messages (sorted by time)
messageSchema.index({ groupId: 1, createdAt: -1 });
// Indexes for conversation list queries (used in $or queries with createdAt sort)
messageSchema.index({ senderId: 1, createdAt: -1 });
messageSchema.index({ receiverId: 1, createdAt: -1 });
// Index for seenBy queries in group messages
messageSchema.index({ "seenBy.userId": 1 });
// Index for reactions queries
messageSchema.index({ "reactions.userId": 1 });

const Message = mongoose.model("Message", messageSchema);
export default Message;