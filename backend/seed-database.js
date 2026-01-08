import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import User from "./src/model/user.model.js";
import Group from "./src/model/group.model.js";

// Load environment variables
dotenv.config();

// Common Khmer/Asian names for realistic data
const firstNames = [
  "Sok",
  "Ka",
  "Chan",
  "Dara",
  "Ponleu",
  "Sovann",
  "Sreymom",
  "Raksmey",
  "Kosal",
  "Piseth",
  "Samnang",
  "Vibol",
  "Vanna",
  "Bopha",
  "Kunthea",
  "Socheata",
  "Rithy",
  "Sopheak",
  "Nary",
  "Pheakdey",
  "Chenda",
  "Molika",
  "Sarom",
  "Makara",
  "Thida",
  "Srey",
  "Leakhena",
  "Rattana",
  "Chanthy",
  "Sopheap",
  "Channtha",
  "Socheat",
  "Veasna",
  "Thy",
  "Pich",
  "Bora",
  "Sreyleak",
  "Vannak",
  "Lyda",
  "Sokha",
  "Mony",
  "Sreypov",
  "Sambath",
  "Pisey",
  "Vutha",
  "Reaksmey",
  "Sothea",
  "Borey",
  "Sreypeou",
  "Sophea",
  "Kimhong",
  "Sokheng",
  "Sreypich",
  "Narith",
  "Channak",
  "Panha",
  "Sophors",
  "Sreypich",
  "Seyha",
  "Kimheang",
  "Sreypeach",
  "Davith",
  "Chanrith",
  "Seila",
  "Kimly",
  "Sreypeov",
  "Rina",
  "Sotheavy",
  "Sreypich",
  "Vuthy",
  "Kolab",
  "Pichkamsan",
];

// Group categories and names
const groupCategories = {
  food: [
    "Food Lovers",
    "Street Food Club",
    "BBQ Masters",
    "Dessert Heaven",
    "Vegan Squad",
    "Foodie Paradise",
    "Noodle Fans",
    "Spicy Food Gang",
    "Breakfast Club",
    "Coffee Addicts",
  ],
  delivery: [
    "Quick Delivery",
    "Express Service",
    "Fast Riders",
    "Delivery Heroes",
    "Rush Hour",
    "Speed Team",
    "On-Time Squad",
    "Parcel Masters",
    "Courier Club",
    "Delivery Pro",
  ],
  tech: [
    "Tech Geeks",
    "Code Warriors",
    "Dev Community",
    "AI Enthusiasts",
    "Mobile Devs",
    "Web Masters",
    "Tech Innovators",
    "Startup Hub",
    "Programmers United",
    "Tech Talks",
  ],
  sports: [
    "Football Fans",
    "Basketball Squad",
    "Running Club",
    "Gym Buddies",
    "Sports Lovers",
    "Fitness Freaks",
    "Cycling Team",
    "Volleyball Stars",
    "Tennis Club",
    "Badminton Pro",
  ],
  music: [
    "Music Lovers",
    "Rock Fans",
    "Pop Culture",
    "Jazz Club",
    "EDM Squad",
    "Classical Vibes",
    "Hip Hop Heads",
    "K-Pop Fans",
    "Indie Music",
    "Concert Goers",
  ],
  travel: [
    "Travel Bugs",
    "Adventure Seekers",
    "Beach Lovers",
    "Mountain Hikers",
    "City Explorers",
    "Backpackers",
    "Road Trippers",
    "World Travelers",
    "Nature Lovers",
    "Camping Squad",
  ],
  gaming: [
    "Gamers Unite",
    "Mobile Legends",
    "PUBG Squad",
    "Free Fire Gang",
    "Valorant Team",
    "LOL Players",
    "Gaming Masters",
    "Pro Gamers",
    "Esports Club",
    "Casual Gamers",
  ],
  business: [
    "Entrepreneurs",
    "Business Hub",
    "Startup Network",
    "Marketing Pros",
    "Sales Team",
    "Investment Club",
    "Finance Geeks",
    "E-commerce",
    "Business Growth",
    "Networking Hub",
  ],
  education: [
    "Study Group",
    "English Learners",
    "Math Club",
    "Science Geeks",
    "Book Club",
    "Knowledge Seekers",
    "Exam Prep",
    "College Students",
    "Online Courses",
    "Tutoring Group",
  ],
  lifestyle: [
    "Fashion Squad",
    "Beauty Tips",
    "Health Talk",
    "Yoga Club",
    "Meditation",
    "Wellness Group",
    "Self Care",
    "Life Hacks",
    "Home Decor",
    "Pet Lovers",
  ],
};

// Flatten all group names
const allGroupNames = Object.values(groupCategories).flat();

// Generate Khmer-style email usernames
function generateUsername(index) {
  if (index < firstNames.length) {
    return firstNames[index].toLowerCase();
  }

  const nameIndex = index % firstNames.length;
  const suffix = Math.floor(index / firstNames.length);
  return `${firstNames[nameIndex].toLowerCase()}${suffix}`;
}

// Connect to MongoDB
async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Connected to MongoDB");
  } catch (error) {
    console.error("❌ MongoDB connection error:", error.message);
    process.exit(1);
  }
}

// Create users
async function createUsers() {
  console.log("\n📝 Creating 500 users...");

  const password = "Tsd123!@#";
  const hashedPassword = await bcrypt.hash(password, 10);

  const users = [];

  for (let i = 0; i < 500; i++) {
    const username = generateUsername(i);
    const email = `${username}@gmail.com`;
    const fullname =
      firstNames[i % firstNames.length] +
      " " +
      (Math.floor(i / firstNames.length) > 0
        ? Math.floor(i / firstNames.length)
        : "");

    users.push({
      email: email,
      fullname: fullname.trim(),
      password: hashedPassword,
      profilePic: `https://avatar.iran.liara.run/public/${i % 100}`,
    });

    if ((i + 1) % 50 === 0) {
      console.log(`   Created ${i + 1}/500 users...`);
    }
  }

  try {
    // Use insertMany with ordered: false to continue on duplicate errors
    const result = await User.insertMany(users, { ordered: false });
    console.log(`✅ Successfully created ${result.length} users`);
    return result;
  } catch (error) {
    if (error.code === 11000) {
      // Some duplicates, but continue
      console.log(`⚠️  Some users already exist, continuing...`);
      // Get all users from database
      const allUsers = await User.find({});
      return allUsers;
    }
    throw error;
  }
}

// Create groups
async function createGroups(users) {
  console.log("\n📝 Creating 100 groups...");

  if (users.length === 0) {
    throw new Error("No users available to create groups");
  }

  // Use first user as admin for all groups
  const adminUser = users[0];

  // Get all user IDs for members
  const allUserIds = users.map((user) => user._id);

  const groups = [];

  for (let i = 0; i < 100; i++) {
    const groupName =
      allGroupNames[i % allGroupNames.length] +
      (Math.floor(i / allGroupNames.length) > 0
        ? ` ${Math.floor(i / allGroupNames.length)}`
        : "");

    groups.push({
      name: groupName,
      description: `Welcome to ${groupName}! A community for everyone.`,
      groupPic: `https://avatar.iran.liara.run/public/${(i % 50) + 50}`,
      admin: adminUser._id,
      members: allUserIds, // Add all users to each group
      settings: {
        onlyAdminsCanPost: false,
      },
    });

    if ((i + 1) % 20 === 0) {
      console.log(`   Created ${i + 1}/100 groups...`);
    }
  }

  try {
    const result = await Group.insertMany(groups, { ordered: false });
    console.log(
      `✅ Successfully created ${result.length} groups with all ${users.length} members in each`
    );
    return result;
  } catch (error) {
    if (error.code === 11000) {
      console.log(`⚠️  Some groups already exist, continuing...`);
      const allGroups = await Group.find({});
      return allGroups;
    }
    throw error;
  }
}

// Main seed function
async function seedDatabase() {
  try {
    console.log("🌱 Starting database seeding...");
    console.log("📊 Target: 500 users + 100 groups");
    console.log("🔐 Password for all users: Tsd123!@#");
    console.log("=".repeat(50));

    await connectDB();

    // Create users
    const users = await createUsers();
    console.log(`✅ Total users in database: ${users.length}`);

    // Create groups with all users as members
    const groups = await createGroups(users);
    console.log(`✅ Total groups in database: ${groups.length}`);

    console.log("\n" + "=".repeat(50));
    console.log("🎉 Database seeding completed successfully!");
    console.log("=".repeat(50));
    console.log("\n📋 Summary:");
    console.log(`   👥 Users created: ${users.length}`);
    console.log(`   👥 Groups created: ${groups.length}`);
    console.log(`   🔑 Login credentials:`);
    console.log(`      Email: ka@gmail.com (or any user)`);
    console.log(`      Password: Tsd123!@#`);
    console.log("\n💡 Sample user emails:");
    for (let i = 0; i < Math.min(10, users.length); i++) {
      console.log(`   - ${users[i].email}`);
    }
  } catch (error) {
    console.error("\n❌ Seeding failed:", error.message);
    console.error(error);
  } finally {
    await mongoose.disconnect();
    console.log("\n👋 Disconnected from MongoDB");
    process.exit(0);
  }
}

// Run the seed
seedDatabase();
