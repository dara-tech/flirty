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
    required: true,
  },
  text: {
    type: String,
    // Only require text if there's no image
    required: function() {
      return !this.image;
    }
  },
  image: {
    type: String,
  },
  seen: {
    type: Boolean,
    default: false,
  },
  seenAt: {
    type: Date,
  }
}, { timestamps: true });

const Message = mongoose.model("Message", messageSchema);
export default Message;