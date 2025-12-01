import { generateToken } from "../lib/until.js";  // Changed from "until.js" to "utils.js" for consistency and clarity
import User from "../model/user.model.js";
import bcrypt from 'bcryptjs'; // Importing bcrypt for password hashing and comparison
import cloudinary from "../lib/cloudinary.js"; // Importing cloudinary for image uploads
import { OAuth2Client } from 'google-auth-library';

const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID || "283732145047-tu9sdui7iasnf8ul0a0vr4lq3fj190d5.apps.googleusercontent.com"
);

export const signup = async (req, res) => {
    const { fullname, email, password } = req.body; // Extracting user details from request body
    try {
        if (!fullname || !email || !password) {
            return res.status(400).json({ message: "All fields are required" }); // Ensuring all required fields are provided
        }

        if (password.length < 6) {
            return res.status(400).json({ message: "Password must be at least 6 characters" }); // Enforcing minimum password length
        }

        const existingUserByEmail = await User.findOne({ email }); // Checking if email already exists
        if (existingUserByEmail) return res.status(400).json({ message: "Email already exists" });
        const existingUserByFullname = await User.findOne({ fullname }); // Checking if fullname already exists
        if (existingUserByFullname) return res.status(400).json({ message: "Try another name already exists" });

        const salt = await bcrypt.genSalt(10); // Generating salt for password hashing
        const hashedPassword = await bcrypt.hash(password, salt); // Hashing password with salt
        const newUser = new User({
            fullname,
            email,
            password: hashedPassword // Storing hashed password
        });

        await newUser.save(); // Saving new user to the database
        generateToken(newUser._id, res); // Generating and sending token for authentication

        res.status(201).json({
            _id: newUser._id,
            fullname: newUser.fullname,
            email: newUser.email,
            profilePic: newUser.profilePic // Sending user details including profile picture
        });
    } catch (error) {
        res.status(500).send("Error signing up user"); // Handling any errors during signup
    }
}


export const login = async (req, res) => {
    try {
        const { email, password } = req.body; // Extracting email and password from request body
        const user = await User.findOne({ email }); // Finding user by email
        if (!user) {
            return res.status(404).send("User not found"); // User not found
        }
        
        // Check if user signed up with Google (no password)
        if (user.googleId && !user.password) {
            return res.status(400).json({ message: "This account was created with Google. Please sign in with Google." });
        }
        
        if (!user.password) {
            return res.status(401).send("Invalid credentials"); // No password set
        }
        
        const isMatch = await bcrypt.compare(password, user.password); // Comparing provided password with stored hash
        if (!isMatch) {
            return res.status(401).send("Invalid credentials"); // Invalid credentials
        }
        generateToken(user._id, res); // Generating and sending token for authentication

        // Return user data (same format as signup)
        res.status(200).json({
            _id: user._id,
            fullname: user.fullname,
            email: user.email,
            profilePic: user.profilePic
        });
    } catch (error) {
        res.status(500).send("Error logging in user"); // Handling any errors during login
    }
}

export const logout = (req, res) => {
  try {
    // Use same cookie options as login to ensure cookie is cleared properly
    const isDevelopment = process.env.NODE_ENV !== 'production';
    const cookieOptions = {
      maxAge: 0, // Expire immediately
      httpOnly: true,
      path: '/',
      sameSite: isDevelopment ? 'lax' : 'none',
      secure: !isDevelopment, // true in production
    };
    
    res.cookie("jwt", "", cookieOptions); // Clearing the jwt cookie to log out
    res.status(200).json({ message: "Logged out successfully" }); // Logging out successfully
  } catch (error) {
    console.log("Error in logout controller", error.message); // Logging error message
    res.status(500).json({ message: "Internal Server Error" }); // Handling any errors during logout
  }
};

export const updateProfile = async (req, res) => {
    try {
      const { profilePic, fullname } = req.body; // Extracting profile picture and fullname from request body
      const userId = req.user._id; // Extracting user ID from request

      if (!profilePic && !fullname) {
        return res.status(400).json({ message: "Profile pic or fullname is required" }); // Ensuring profile picture or fullname is provided
      }

      let updateFields = {};
      if (profilePic) {
        const uploadResponse = await cloudinary.uploader.upload(profilePic); // Uploading profile picture to cloudinary
        updateFields.profilePic = uploadResponse.secure_url; // Updating user profile picture
      }
      if (fullname) {
        updateFields.fullname = fullname; // Updating user fullname
      }

      const updatedUser = await User.findByIdAndUpdate(
        userId,
        updateFields,
        { new: true }
      );

      res.status(200).json(updatedUser); // Sending updated user details
    } catch (error) {
      console.log("error in update profile:", error); // Logging error message
      res.status(500).json({ message: "Internal server error" }); // Handling any errors during profile update
    }
  };
  
  export const checkAuth = (req, res) => {
    try {
      res.status(200).json(req.user); // Sending authenticated user details
    } catch (error) {
      console.log("Error in checkAuth controller", error.message); // Logging error message
      res.status(500).json({ message: "Internal Server Error" }); // Handling any errors during authentication check
    }
  };

export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body; // Extracting current and new password from request body
    const userId = req.user._id; // Extracting user ID from request

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current password and new password are required" }); // Ensuring both passwords are provided
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters" }); // Enforcing minimum password length
    }

    const user = await User.findById(userId); // Finding user by ID
    if (!user) {
      return res.status(404).json({ message: "User not found" }); // User not found
    }

    // Check if user signed up with Google (no password)
    if (user.googleId && !user.password) {
      return res.status(400).json({ message: "Google users cannot change password. Please set a password first." });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password); // Comparing current password with stored hash
    if (!isMatch) {
      return res.status(401).json({ message: "Current password is incorrect" }); // Invalid current password
    }

    const salt = await bcrypt.genSalt(10); // Generating salt for password hashing
    const hashedPassword = await bcrypt.hash(newPassword, salt); // Hashing new password with salt

    await User.findByIdAndUpdate(userId, { password: hashedPassword }); // Updating user password

    res.status(200).json({ message: "Password changed successfully" }); // Password changed successfully
  } catch (error) {
    console.log("error in change password:", error); // Logging error message
    res.status(500).json({ message: "Internal server error" }); // Handling any errors during password change
  }
};

export const googleAuth = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ message: "Google token is required" });
    }

    // Verify the Google token
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID || "283732145047-tu9sdui7iasnf8ul0a0vr4lq3fj190d5.apps.googleusercontent.com",
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, name: fullname, picture: profilePic } = payload;

    // Check if user already exists
    let user = await User.findOne({ email });

    if (user) {
      // User exists - update Google ID if not set
      if (!user.googleId) {
        user.googleId = googleId;
        if (!user.profilePic && profilePic) {
          user.profilePic = profilePic;
        }
        await user.save();
      }
    } else {
      // Create new user (don't set password for Google users - it's optional)
      user = new User({
        email,
        fullname,
        profilePic: profilePic || "",
        googleId,
      });
      await user.save();
    }

    // Generate token and send response
    generateToken(user._id, res);

    res.status(200).json({
      _id: user._id,
      fullname: user.fullname,
      email: user.email,
      profilePic: user.profilePic,
    });
  } catch (error) {
    console.log("Error in googleAuth controller:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};