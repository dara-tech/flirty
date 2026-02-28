import User from "../model/user.model.js";

/**
 * Register push notification token
 * @route POST /api/push/register
 */
export const registerPushToken = async (req, res) => {
  try {
    const { token, platform, userAgent, deviceInfo, voipToken } = req.body; // ✅ Added voipToken
    const userId = req.user._id;
    // Validation
    if (!token) {
      return res.status(400).json({
        success: false,
        error: "FCM token is required",
      });
    }

    if (!platform || !["ios", "android"].includes(platform)) {
      return res.status(400).json({
        success: false,
        error: "Valid platform (ios/android) is required",
      });
    }

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      console.log("❌ [Push] User not found:", userId);
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Initialize pushTokens array if it doesn't exist
    if (!user.pushTokens) {
      user.pushTokens = [];
    }

    // Check if token already exists
    const existingTokenIndex = user.pushTokens.findIndex(
      (t) => t.token === token,
    );

    if (existingTokenIndex !== -1) {
      // Update existing token
      user.pushTokens[existingTokenIndex] = {
        token,
        platform,
        voipToken: voipToken || user.pushTokens[existingTokenIndex].voipToken, // ✅ Store VoIP token
        userAgent: userAgent || "Unknown",
        deviceInfo: deviceInfo || {},
        lastUsed: new Date(),
        createdAt: user.pushTokens[existingTokenIndex].createdAt,
      };
    } else {
      // Add new token
      user.pushTokens.push({
        token,
        platform,
        voipToken: voipToken || null, // ✅ Store VoIP token
        userAgent: userAgent || "Unknown",
        deviceInfo: deviceInfo || {},
        lastUsed: new Date(),
        createdAt: new Date(),
      });
    }

    await user.save();
    res.status(200).json({
      success: true,
      message: "Push token registered successfully",
      tokenCount: user.pushTokens.length,
    });
  } catch (error) {
    console.error("❌ [Push] Registration error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to register push token",
      details: error.message,
    });
  }
};

/**
 * Unregister push notification token
 * @route POST /api/push/unregister
 */
export const unregisterPushToken = async (req, res) => {
  try {
    const { token } = req.body;
    const userId = req.user._id;
    if (!token) {
      return res.status(400).json({
        success: false,
        error: "FCM token is required",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Remove token
    if (user.pushTokens) {
      const beforeCount = user.pushTokens.length;
      user.pushTokens = user.pushTokens.filter((t) => t.token !== token);
      const afterCount = user.pushTokens.length;

      await user.save();

      // console.log("✅ [Push] Token unregistered");
      // console.log("   └─ Removed:", beforeCount - afterCount);

      res.status(200).json({
        success: true,
        message: "Push token unregistered successfully",
        tokenCount: afterCount,
      });
    } else {
      res.status(200).json({
        success: true,
        message: "No tokens to unregister",
        tokenCount: 0,
      });
    }
  } catch (error) {
    console.error("❌ [Push] Unregister error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to unregister push token",
      details: error.message,
    });
  }
};

/**
 * Get all registered push tokens for user
 * @route GET /api/push/tokens
 */
export const getUserPushTokens = async (req, res) => {
  try {
    const userId = req.user._id;

    const user = await User.findById(userId).select("pushTokens");
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      tokens: user.pushTokens || [],
      count: user.pushTokens?.length || 0,
    });
  } catch (error) {
    console.error("❌ [Push] Get tokens error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get push tokens",
      details: error.message,
    });
  }
};
