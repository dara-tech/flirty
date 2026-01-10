import mongoose from "mongoose";

const pushSubscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    endpoint: {
      type: String,
      required: true,
    },
    keys: {
      p256dh: {
        type: String,
        required: true,
      },
      auth: {
        type: String,
        required: true,
      },
    },
    userAgent: {
      type: String,
      default: "",
    },
    deviceInfo: {
      type: String,
      default: "",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Index for efficient queries
pushSubscriptionSchema.index({ userId: 1, isActive: 1 });
pushSubscriptionSchema.index({ endpoint: 1 }, { unique: true });

// Remove subscription by endpoint
pushSubscriptionSchema.statics.removeByEndpoint = async function (endpoint) {
  return this.findOneAndDelete({ endpoint });
};

// Get all active subscriptions for a user
pushSubscriptionSchema.statics.getActiveSubscriptions = async function (userId) {
  return this.find({ userId, isActive: true });
};

const PushSubscription = mongoose.model("PushSubscription", pushSubscriptionSchema);

export default PushSubscription;




