import { generateToken } from "../lib/utils.js";
import { AuthService } from "../services/auth.service.js";
import { asyncHandler } from "../middleware/error.middleware.js";

// Signup controller
export const signup = asyncHandler(async (req, res) => {
  const { fullname, email, password } = req.body;

  // Check if email already exists
  if (await AuthService.emailExists(email)) {
    return res.status(400).json({ 
      success: false,
      message: "Email already exists" 
    });
  }

  // Check if fullname already exists
  if (await AuthService.fullnameExists(fullname)) {
    return res.status(400).json({ 
      success: false,
      message: "Fullname already exists. Please try another name" 
    });
  }

  // Create new user
  const newUser = await AuthService.createUser({ fullname, email, password });
  
  // Generate token (returns token string)
  const token = generateToken(newUser._id, res);

  // Safari compatibility: Also send token in response header and body
  res.setHeader('X-Auth-Token', token);

  // Return user data with token (for Safari fallback)
  res.status(201).json({
    success: true,
    data: AuthService.formatUserResponse(newUser),
    token: token // Include token in response for Safari compatibility
  });
});

// Login controller
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Find user
  const user = await AuthService.findUserByEmail(email);
  if (!user) {
    return res.status(401).json({ 
      success: false,
      message: "Invalid credentials" // Don't reveal if user exists
    });
  }

  // Check if user signed up with Google (no password)
  if (user.googleId && !user.password) {
    return res.status(400).json({ 
      success: false,
      message: "This account was created with Google. Please sign in with Google." 
    });
  }

  // Verify password
  const isMatch = await AuthService.verifyPassword(password, user.password);
  if (!isMatch) {
    return res.status(401).json({ 
      success: false,
      message: "Invalid credentials" // Don't reveal which field is wrong
    });
  }

  // Generate token (returns token string)
  const token = generateToken(user._id, res);

  // Safari compatibility: Also send token in response header and body
  // Safari may block cookies with SameSite=None, so provide token as fallback
  res.setHeader('X-Auth-Token', token);

  // Return user data with token (for Safari fallback)
  res.status(200).json({
    success: true,
    data: AuthService.formatUserResponse(user),
    token: token // Include token in response for Safari compatibility
  });
});

// Logout controller
export const logout = asyncHandler(async (req, res) => {
  const { getCookieOptions } = await import('../lib/utils.js');
  const cookieOptions = {
    ...getCookieOptions(req),
    maxAge: 0, // Expire immediately
  };
  
  res.cookie("jwt", "", cookieOptions);
  res.status(200).json({ 
    success: true,
    message: "Logged out successfully" 
  });
});

// Update profile controller
export const updateProfile = asyncHandler(async (req, res) => {
  const { profilePic, fullname } = req.body;
  const userId = req.user._id;

  // Get current user to check if fullname is actually changing
  const currentUser = await AuthService.findUserById(userId);
  if (!currentUser) {
    return res.status(404).json({ 
      success: false,
      message: "User not found" 
    });
  }

  // Check if fullname is being updated to a different value
  if (fullname && fullname.trim() !== currentUser.fullname) {
    const existingUser = await AuthService.findUserByFullname(fullname.trim());
    // If fullname exists and it's not the current user, return error
    if (existingUser && existingUser._id.toString() !== userId.toString()) {
      return res.status(400).json({ 
        success: false,
        message: "Fullname already exists. Please try another name" 
      });
    }
  }

  // Update user profile
  const updatedUser = await AuthService.updateUserProfile(userId, { profilePic, fullname: fullname?.trim() });

  if (!updatedUser) {
    return res.status(404).json({ 
      success: false,
      message: "User not found" 
    });
  }

  res.status(200).json({
    success: true,
    data: AuthService.formatUserResponse(updatedUser)
  });
});

// Check auth controller
// Get current authenticated user (RESTful: GET /auth/me)
// Uses optionalAuth - returns user if authenticated, null if not (no 401 error)
export const getMe = asyncHandler(async (req, res) => {
  if (!req.user) {
    // User not authenticated - return success with null data (not an error)
    return res.status(200).json({
      success: true,
      data: null,
      authenticated: false
    });
  }
  
  res.status(200).json({
    success: true,
    data: AuthService.formatUserResponse(req.user),
    authenticated: true
  });
});

// Change password controller
export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user._id;

  // Get user with password
  const user = await AuthService.findUserByIdWithPassword(userId);
  if (!user) {
    return res.status(404).json({ 
      success: false,
      message: "User not found" 
    });
  }

  // Check if user signed up with Google (no password)
  if (user.googleId && !user.password) {
    return res.status(400).json({ 
      success: false,
      message: "Google users cannot change password. Please set a password first." 
    });
  }

  // Verify current password
  const isMatch = await AuthService.verifyPassword(currentPassword, user.password);
  if (!isMatch) {
    return res.status(401).json({ 
      success: false,
      message: "Current password is incorrect" 
    });
  }

  // Update password
  await AuthService.updateUserPassword(userId, newPassword);

  res.status(200).json({ 
    success: true,
    message: "Password changed successfully" 
  });
});

// Google auth controller
export const googleAuth = asyncHandler(async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ 
      success: false,
      message: "Google token is required" 
    });
  }

  // Handle Google OAuth
  const user = await AuthService.handleGoogleAuth(token);

  // Generate token (returns token string)
  const authToken = generateToken(user._id, res);

  // Safari compatibility: Also send token in response header and body
  res.setHeader('X-Auth-Token', authToken);

  // Return user data with token (for Safari fallback)
  res.status(200).json({
    success: true,
    data: AuthService.formatUserResponse(user),
    token: authToken // Include token in response for Safari compatibility
  });
});
