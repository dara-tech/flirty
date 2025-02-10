import { generateToken } from "../lib/until.js";  // Changed from "until.js" to "utils.js" for consistency and clarity
import User from "../model/user.model.js";
import bcrypt from 'bcryptjs'; // Importing bcrypt for password hashing and comparison
import cloudinary from "../lib/cloudinary.js"; // Importing cloudinary for image uploads

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
        const isMatch = await bcrypt.compare(password, user.password); // Comparing provided password with stored hash
        if (!isMatch) {
            return res.status(401).send("Invalid credentials"); // Invalid credentials
        }
        generateToken(user._id, res); // Generating and sending token for authentication

        res.status(200).send("User logged in successfully"); // User logged in successfully
    } catch (error) {
        res.status(500).send("Error logging in user"); // Handling any errors during login
    }
}

export const logout = (req, res) => {
    try {
      res.cookie("jwt", "", { maxAge: 0 }); // Clearing the jwt cookie to log out
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