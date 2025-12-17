import mongoose from "mongoose";

const groupSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    groupPic: {
      type: String,
      default: "",
    },
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    settings: {
      onlyAdminsCanPost: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

// Indexes for query performance
// Index for membership checks (array field)
groupSchema.index({ members: 1 });
// Index for admin queries
groupSchema.index({ admin: 1 });
// Index for sorting groups by update time
groupSchema.index({ updatedAt: -1 });
// Compound index for admin + members queries
groupSchema.index({ admin: 1, members: 1 });

const Group = mongoose.model("Group", groupSchema);
export default Group;

