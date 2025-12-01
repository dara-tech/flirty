import mongoose from "mongoose";

const contactRequestSchema = new mongoose.Schema(
  {
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
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
    },
  },
  { timestamps: true }
);

// Ensure one request per sender-receiver pair
contactRequestSchema.index({ senderId: 1, receiverId: 1 }, { unique: true });

const ContactRequest = mongoose.model("ContactRequest", contactRequestSchema);

export default ContactRequest;

