// Auth service layer - business logic separated from controllers
import User from "../model/user.model.js";
import bcrypt from 'bcryptjs';
import cloudinary from "../lib/cloudinary.js";
import { OAuth2Client } from 'google-auth-library';

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export class AuthService {
  // Find user by email
  static async findUserByEmail(email) {
    return await User.findOne({ email });
  }

  // Find user by ID
  static async findUserById(userId) {
    return await User.findById(userId).select("-password");
  }

  // Find user by ID with password (for password change)
  static async findUserByIdWithPassword(userId) {
    return await User.findById(userId);
  }

  // Check if email exists
  static async emailExists(email) {
    const user = await User.findOne({ email });
    return !!user;
  }

  // Check if fullname exists
  static async fullnameExists(fullname) {
    const user = await User.findOne({ fullname });
    return !!user;
  }

  // Create new user
  static async createUser(userData) {
    const { fullname, email, password } = userData;
    
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    const newUser = new User({
      fullname,
      email,
      password: hashedPassword
    });

    await newUser.save();
    return newUser;
  }

  // Verify password
  static async verifyPassword(password, hashedPassword) {
    if (!hashedPassword) return false;
    return await bcrypt.compare(password, hashedPassword);
  }

  // Hash password
  static async hashPassword(password) {
    const salt = await bcrypt.genSalt(10);
    return await bcrypt.hash(password, salt);
  }

  // Update user profile
  static async updateUserProfile(userId, updateData) {
    const updateFields = {};
    
    if (updateData.profilePic) {
      const uploadResponse = await cloudinary.uploader.upload(updateData.profilePic);
      updateFields.profilePic = uploadResponse.secure_url;
    }
    
    if (updateData.fullname) {
      updateFields.fullname = updateData.fullname;
    }

    return await User.findByIdAndUpdate(
      userId,
      updateFields,
      { new: true, runValidators: true }
    ).select("-password");
  }

  // Update user password
  static async updateUserPassword(userId, newPassword) {
    const hashedPassword = await this.hashPassword(newPassword);
    return await User.findByIdAndUpdate(
      userId,
      { password: hashedPassword },
      { new: true }
    );
  }

  // Handle Google OAuth
  static async handleGoogleAuth(token) {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, name: fullname, picture: profilePic } = payload;

    let user = await User.findOne({ email });

    if (user) {
      // User exists - update Google ID if not set
      if (!user.googleId) {
        user.googleId = googleId;
        // Always update profilePic if Google provides one (for users without profile pic)
        if (profilePic && (!user.profilePic || user.profilePic === "")) {
          user.profilePic = profilePic;
        }
        await user.save();
      } else {
        // User already has Google ID - update profilePic if Google provides a new one
        // This ensures profile pictures stay up to date
        if (profilePic) {
          user.profilePic = profilePic;
          await user.save();
        }
      }
    } else {
      // Create new user
      user = new User({
        email,
        fullname,
        profilePic: profilePic || "",
        googleId,
      });
      await user.save();
    }

    return user;
  }

  // Format user response (exclude sensitive data)
  static formatUserResponse(user) {
    return {
      _id: user._id,
      fullname: user.fullname,
      email: user.email,
      // Return null instead of empty string for profilePic to make frontend handling easier
      profilePic: user.profilePic && user.profilePic.trim() !== "" ? user.profilePic : null
    };
  }
}

