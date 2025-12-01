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
    // Only require text if there's no image or audio
    required: function() {
      return !this.image && !this.audio;
    }
  },
  image: {
    type: String,
  },
  audio: {
    type: String,
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
}, { timestamps: true });

const Message = mongoose.model("Message", messageSchema);
export default Message;