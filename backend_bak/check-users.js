import mongoose from "mongoose";
import User from "./src/model/user.model.js";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || process.env.MONGO_URI || "mongodb://localhost:27017/chat_app";
    await mongoose.connect(mongoURI);
    console.log("✅ Connected to MongoDB");
    console.log(`📡 Database: ${mongoose.connection.name}`);
  } catch (error) {
    console.error("❌ MongoDB connection error:", error.message);
    process.exit(1);
  }
};

const checkUsers = async () => {
  try {
    await connectDB();
    
    // Count total users
    const totalUsers = await User.countDocuments();
    
    // Get some user details
    const users = await User.find().select("fullname email profilePic createdAt").limit(10).sort({ createdAt: -1 });
    
    console.log("\n📊 Database User Statistics:");
    console.log("=" .repeat(50));
    console.log(`Total Users: ${totalUsers}`);
    console.log("\n📝 Recent Users (last 10):");
    console.log("-".repeat(50));
    
    if (users.length === 0) {
      console.log("No users found in database");
    } else {
      users.forEach((user, index) => {
        console.log(`${index + 1}. ${user.fullname} (${user.email})`);
        console.log(`   Created: ${user.createdAt.toLocaleDateString()}`);
      });
    }
    
    if (totalUsers > 10) {
      console.log(`\n... and ${totalUsers - 10} more users`);
    }
    
    console.log("\n" + "=".repeat(50));
    
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await mongoose.connection.close();
    console.log("\n👋 Database connection closed");
    process.exit(0);
  }
};

// Run the script
checkUsers();

