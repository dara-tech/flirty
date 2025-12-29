import mongoose from "mongoose";

const folderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    icon: {
      type: String,
      default: "FaFolder", // Default folder icon (React icon name)
      maxlength: 20,
    },
    color: {
      type: String,
      default: "#3b82f6", // Default blue color
      match: /^#[0-9A-Fa-f]{6}$/, // Hex color format
    },
    conversations: [
      {
        type: {
          type: String,
          enum: ["user", "group"],
          required: true,
        },
        id: {
          type: mongoose.Schema.Types.ObjectId,
          required: true,
        },
        addedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    order: {
      type: Number,
      default: 0, // Order for sorting folders
    },
    isExpanded: {
      type: Boolean,
      default: true, // Folders are expanded by default
    },
  },
  { timestamps: true }
);

// Indexes for query performance
folderSchema.index({ userId: 1, order: 1 });
folderSchema.index({ userId: 1, createdAt: -1 });

// Compound index for finding conversations in folders
folderSchema.index({ "conversations.type": 1, "conversations.id": 1 });

const Folder = mongoose.model("Folder", folderSchema);

export default Folder;

