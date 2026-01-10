import PushSubscription from "../model/pushSubscription.model.js";
import logger from "../lib/logger.js";

/**
 * Subscribe user to push notifications
 * POST /api/push/subscribe
 */
export const subscribe = async (req, res) => {
  try {
    const userId = req.user._id;
    const { endpoint, keys, userAgent, deviceInfo } = req.body;

    if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: endpoint, keys.p256dh, keys.auth",
      });
    }

    // Check if subscription already exists for this endpoint
    let subscription = await PushSubscription.findOne({ endpoint });

    if (subscription) {
      // Update existing subscription
      subscription.userId = userId;
      subscription.keys = keys;
      subscription.userAgent = userAgent || "";
      subscription.deviceInfo = deviceInfo || "";
      subscription.isActive = true;
      await subscription.save();

      logger.info(`Updated push subscription for user ${userId} on endpoint ${endpoint}`);
    } else {
      // Create new subscription
      subscription = await PushSubscription.create({
        userId,
        endpoint,
        keys,
        userAgent: userAgent || "",
        deviceInfo: deviceInfo || "",
        isActive: true,
      });

      logger.info(`Created push subscription for user ${userId} on endpoint ${endpoint}`);
    }

    return res.status(200).json({
      success: true,
      data: {
        subscription: {
          id: subscription._id,
          endpoint: subscription.endpoint,
          isActive: subscription.isActive,
        },
      },
    });
  } catch (error) {
    logger.error("Error subscribing to push notifications:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to subscribe to push notifications",
      message: error.message,
    });
  }
};

/**
 * Unsubscribe user from push notifications
 * POST /api/push/unsubscribe
 */
export const unsubscribe = async (req, res) => {
  try {
    const userId = req.user._id;
    const { endpoint } = req.body;

    if (!endpoint) {
      return res.status(400).json({
        success: false,
        error: "Missing required field: endpoint",
      });
    }

    // Find and remove subscription
    const subscription = await PushSubscription.findOne({
      userId,
      endpoint,
    });

    if (!subscription) {
      return res.status(404).json({
        success: false,
        error: "Subscription not found",
      });
    }

    await PushSubscription.findByIdAndDelete(subscription._id);

    logger.info(`Removed push subscription for user ${userId} on endpoint ${endpoint}`);

    return res.status(200).json({
      success: true,
      message: "Unsubscribed from push notifications",
    });
  } catch (error) {
    logger.error("Error unsubscribing from push notifications:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to unsubscribe from push notifications",
      message: error.message,
    });
  }
};

/**
 * Get user's push subscriptions
 * GET /api/push/subscriptions
 */
export const getSubscriptions = async (req, res) => {
  try {
    const userId = req.user._id;

    const subscriptions = await PushSubscription.find({ userId, isActive: true })
      .select("endpoint userAgent deviceInfo createdAt")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: {
        subscriptions,
        count: subscriptions.length,
      },
    });
  } catch (error) {
    logger.error("Error getting push subscriptions:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to get push subscriptions",
      message: error.message,
    });
  }
};

/**
 * Get VAPID public key for frontend
 * GET /api/push/vapid-public-key
 */
export const getVapidPublicKey = async (req, res) => {
  try {
    const publicKey = process.env.VAPID_PUBLIC_KEY;

    if (!publicKey) {
      return res.status(503).json({
        success: false,
        error: "Push notifications not configured",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        publicKey,
      },
    });
  } catch (error) {
    logger.error("Error getting VAPID public key:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to get VAPID public key",
      message: error.message,
    });
  }
};

/**
 * Test push notification (for debugging)
 * POST /api/push/test
 */
export const testPushNotification = async (req, res) => {
  try {
    const userId = req.user._id;
    const { sendPushNotification } = await import("../services/pushNotification.service.js");

    const result = await sendPushNotification(userId, {
      title: "Test Notification",
      body: "This is a test push notification. If you see this, push notifications are working!",
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      tag: "test-notification",
      data: {
        type: "test",
        timestamp: new Date().toISOString(),
      },
    });

    if (result.success) {
      logger.info(`Test push notification sent to user ${userId}`, result);
      return res.status(200).json({
        success: true,
        message: "Test notification sent",
        data: result,
      });
    } else {
      logger.warn(`Test push notification failed for user ${userId}`, result);
      return res.status(200).json({
        success: false,
        message: "Test notification not sent",
        error: result.error,
        data: result,
      });
    }
  } catch (error) {
    logger.error("Error sending test push notification:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to send test notification",
      message: error.message,
    });
  }
};



