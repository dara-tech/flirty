import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
    },
    fullname: {
      type: String,
      required: true,
    },
    password: {
      type: String,
      required: function() {
        return !this.googleId; // Password not required if user signed up with Google
      },
      validate: {
        validator: function(value) {
          // If googleId exists, password is optional (can be empty)
          if (this.googleId) return true;
          // If no googleId, password must exist and be at least 6 characters
          return value && value.length >= 6;
        },
        message: 'Password must be at least 6 characters'
      }
    },
    googleId: {
      type: String,
      default: null,
    },
    profilePic: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

// Indexes for query performance
// email already has unique index (automatic from unique: true)
// Index for Google OAuth queries
userSchema.index({ googleId: 1 }, { sparse: true }); // sparse: only index documents with googleId

const User = mongoose.model("User", userSchema);

export default User;