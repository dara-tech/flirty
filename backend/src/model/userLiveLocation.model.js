import mongoose from "mongoose";

// ══════════════════════════════════════════════════════════════════════════════
// UserLiveLocation Model
//
// Stores the most-recent GPS position for every user currently sharing
// their location via the "location:lobby" Socket.IO room.
//
// Design decisions:
//  - One document per userId (upserted on join / update, deleted on leave).
//  - TTL index of 10 minutes so stale entries are purged automatically when
//    a client crashes without ever emitting "location:leave".
//  - Sparse 2dsphere index on { lat, lng } allows geo-queries if needed later
//    without causing errors for documents that have no position yet.
//  - updatedAt is stored as an explicit Date field (not the Mongoose
//    timestamps.updatedAt) so the TTL can be set precisely and the field is
//    always present for client-side freshness checks.
// ══════════════════════════════════════════════════════════════════════════════

const userLiveLocationSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      default: "",
      trim: true,
    },
    profilePic: {
      type: String,
      default: "",
    },
    lat: {
      type: Number,
      default: null,
      min: -90,
      max: 90,
    },
    lng: {
      type: Number,
      default: null,
      min: -180,
      max: 180,
    },
    socketId: {
      type: String,
      default: "",
    },
    // Explicit updatedAt — drives both the TTL index and client-side freshness.
    updatedAt: {
      type: Date,
      required: true,
      default: () => new Date(),
    },
  },
  {
    // Disable Mongoose auto timestamps — we manage updatedAt ourselves.
    timestamps: false,
    versionKey: false,
    collection: "user_live_locations",
  },
);

// ── TTL index ─────────────────────────────────────────────────────────────────
// MongoDB removes documents automatically 10 min after `updatedAt`.
// This is a safety-net: the application normally deletes on leave/disconnect.
userLiveLocationSchema.index(
  { updatedAt: 1 },
  { expireAfterSeconds: 600 }, // 10 minutes
);

// ── Lean serialiser ────────────────────────────────────────────────────────────
// Converts a Mongoose document to the plain object expected by Socket.IO clients.
userLiveLocationSchema.methods.toSocketPayload = function () {
  return {
    userId: this.userId,
    name: this.name,
    profilePic: this.profilePic,
    lat: this.lat,
    lng: this.lng,
    updatedAt: this.updatedAt.getTime(), // epoch-ms, matches ActiveUserLocation.fromMap
  };
};

const UserLiveLocation = mongoose.model(
  "UserLiveLocation",
  userLiveLocationSchema,
);

export default UserLiveLocation;
