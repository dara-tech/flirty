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
    // Primary admin (group creator) - kept for backward compatibility
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Additional admins (co-admins)
    admins: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
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
  { timestamps: true },
);

// Virtual to check if a user is an admin (primary or co-admin)
groupSchema.methods.isAdmin = function (userId) {
  const userIdStr = userId.toString();
  return (
    this.admin.toString() === userIdStr ||
    this.admins.some((adminId) => adminId.toString() === userIdStr)
  );
};

// Virtual to get all admin IDs
groupSchema.methods.getAllAdminIds = function () {
  const allAdmins = [this.admin.toString()];
  this.admins.forEach((adminId) => {
    const idStr = adminId.toString();
    if (!allAdmins.includes(idStr)) {
      allAdmins.push(idStr);
    }
  });
  return allAdmins;
};

// Indexes for query performance
// Index for membership checks (array field)
groupSchema.index({ members: 1 });
// Index for admin queries
groupSchema.index({ admin: 1 });
// Index for co-admins queries
groupSchema.index({ admins: 1 });
// Index for sorting groups by update time
groupSchema.index({ updatedAt: -1 });
// Compound index for admin + members queries
groupSchema.index({ admin: 1, members: 1 });

const Group = mongoose.model("Group", groupSchema);
export default Group;
