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
    // Only require text if there's no image, audio, file, or link
    required: function() {
      return !this.image && !this.audio && !this.file && !this.link;
    }
  },
  image: {
    type: String,
  },
  audio: {
    type: String,
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
}, { timestamps: true });

const Message = mongoose.model("Message", messageSchema);
export default Message;