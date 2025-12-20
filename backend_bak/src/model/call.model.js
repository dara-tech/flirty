import mongoose from "mongoose";

const callSchema = new mongoose.Schema(
  {
    callerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      default: null, // null for 1-on-1 calls
    },
    callType: {
      type: String,
      enum: ["voice", "video"],
      required: true,
    },
    status: {
      type: String,
      enum: ["answered", "missed", "rejected", "cancelled"],
      required: true,
    },
    duration: {
      type: Number, // Duration in seconds
      default: 0,
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    endedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

// Indexes for query performance
callSchema.index({ callerId: 1, createdAt: -1 });
callSchema.index({ receiverId: 1, createdAt: -1 });
callSchema.index({ groupId: 1, createdAt: -1 });

const Call = mongoose.model("Call", callSchema);

export default Call;

