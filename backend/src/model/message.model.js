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
      const hasImage = Array.isArray(this.image) ? this.image.length > 0 : this.image;
      const hasAudio = Array.isArray(this.audio) ? this.audio.length > 0 : this.audio;
      const hasVideo = Array.isArray(this.video) ? this.video.length > 0 : this.video;
      const hasFile = Array.isArray(this.file) ? this.file.length > 0 : this.file;
      return !hasImage && !hasAudio && !hasVideo && !hasFile && !this.link;
    }
  },
  image: {
    type: [String], // Support multiple images (array)
    default: undefined,
  },
  audio: {
    type: [String], // Support multiple audio files (array)
    default: undefined,
  },
  video: {
    type: [String], // Support multiple videos (array)
    default: undefined,
  },
  file: {
    type: [String], // Support multiple files (array)
    default: undefined,
  },
  fileName: {
    type: [String], // Support multiple filenames (array)
    default: undefined,
  },
  fileSize: {
    type: [Number], // Support multiple file sizes (array)
    default: undefined,
  },
  fileType: {
    type: [String], // Support multiple MIME types (array)
    default: undefined,
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
// Compound index for getLastMessages optimization (groupId + senderId/receiverId + createdAt)
messageSchema.index({ senderId: 1, groupId: 1, createdAt: -1 });
messageSchema.index({ receiverId: 1, groupId: 1, createdAt: -1 });
// Index for seenBy queries in group messages
messageSchema.index({ "seenBy.userId": 1 });
// Index for reactions queries
messageSchema.index({ "reactions.userId": 1 });

const Message = mongoose.model("Message", messageSchema);
export default Message;