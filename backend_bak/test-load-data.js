import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from './src/model/user.model.js';
import Message from './src/model/message.model.js';
import ContactRequest from './src/model/contactRequest.model.js';
import bcrypt from 'bcryptjs';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/chat_app';

// Connect to database
const connectDB = async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Create users
const createUsers = async (count = 100) => {
  console.log(`\n📝 Creating ${count} users...`);
  const users = [];
  const password = await bcrypt.hash('test123456', 10);
  
  for (let i = 1; i <= count; i++) {
    try {
      const user = new User({
        email: `testuser${i}@test.com`,
        fullname: `Test User ${i}`,
        password: password
      });
      await user.save();
      users.push(user);
      
      if (i % 10 === 0) {
        console.log(`   Created ${i}/${count} users...`);
      }
    } catch (error) {
      if (error.code === 11000) {
        // User already exists, try to find it
        const existingUser = await User.findOne({ email: `testuser${i}@test.com` });
        if (existingUser) {
          users.push(existingUser);
        }
      } else {
        console.error(`Error creating user ${i}:`, error.message);
      }
    }
  }
  
  console.log(`✅ Created/found ${users.length} users`);
  return users;
};

// Create contacts between users
const createContacts = async (users) => {
  console.log(`\n👥 Creating contacts between users...`);
  let contactCount = 0;
  
  // Each user contacts 5-10 other users (random)
  for (let i = 0; i < users.length; i++) {
    const sender = users[i];
    const contactsPerUser = Math.floor(Math.random() * 6) + 5; // 5-10 contacts
    
    // Get random users to contact (excluding self)
    const availableUsers = users.filter(u => u._id.toString() !== sender._id.toString());
    const shuffled = availableUsers.sort(() => Math.random() - 0.5);
    const usersToContact = shuffled.slice(0, Math.min(contactsPerUser, availableUsers.length));
    
    for (const receiver of usersToContact) {
      try {
        // Check if contact request already exists (bidirectional check)
        const existing = await ContactRequest.findOne({
          $or: [
            { senderId: sender._id, receiverId: receiver._id },
            { senderId: receiver._id, receiverId: sender._id }
          ]
        });
        
        if (!existing) {
          // Create contact request (only one direction needed)
          const contactRequest = new ContactRequest({
            senderId: sender._id,
            receiverId: receiver._id,
            status: 'accepted' // Auto-accept for testing
          });
          await contactRequest.save();
          contactCount++;
        }
      } catch (error) {
        if (error.code !== 11000) { // Ignore duplicate key errors
          console.error(`Error creating contact between ${sender.fullname} and ${receiver.fullname}:`, error.message);
        }
      }
    }
    
    if ((i + 1) % 10 === 0) {
      console.log(`   Processed ${i + 1}/${users.length} users...`);
    }
  }
  
  console.log(`✅ Created ${contactCount} contact relationships`);
};

// Create messages between users
const createMessages = async (users) => {
  console.log(`\n💬 Creating messages between users...`);
  let messageCount = 0;
  
  // Get all accepted contacts
  const contacts = await ContactRequest.find({ status: 'accepted' });
  console.log(`   Found ${contacts.length} contact relationships`);
  
  // Create messages for each contact pair
  for (const contact of contacts) {
    const sender = users.find(u => u._id.toString() === contact.senderId.toString());
    const receiver = users.find(u => u._id.toString() === contact.receiverId.toString());
    
    if (!sender || !receiver) continue;
    
    // Create 3-8 messages per conversation
    const messageCountPerConversation = Math.floor(Math.random() * 6) + 3;
    
    for (let i = 0; i < messageCountPerConversation; i++) {
      try {
        // Alternate sender/receiver for more realistic conversation
        const currentSender = i % 2 === 0 ? sender : receiver;
        const currentReceiver = i % 2 === 0 ? receiver : sender;
        
        // Create message with timestamp spread over last 30 days
        const daysAgo = Math.floor(Math.random() * 30);
        const hoursAgo = Math.floor(Math.random() * 24);
        const minutesAgo = Math.floor(Math.random() * 60);
        const createdAt = new Date();
        createdAt.setDate(createdAt.getDate() - daysAgo);
        createdAt.setHours(createdAt.getHours() - hoursAgo);
        createdAt.setMinutes(createdAt.getMinutes() - minutesAgo);
        
        const message = new Message({
          senderId: currentSender._id,
          receiverId: currentReceiver._id,
          text: `Test message ${i + 1} from ${currentSender.fullname} to ${currentReceiver.fullname}`,
          seen: Math.random() > 0.5, // Random seen status
          createdAt: createdAt
        });
        
        await message.save();
        messageCount++;
      } catch (error) {
        console.error(`Error creating message:`, error.message);
      }
    }
  }
  
  console.log(`✅ Created ${messageCount} messages`);
  return messageCount;
};

// Test the endpoints
const testEndpoints = async (testUser) => {
  console.log(`\n🧪 Testing endpoints with user: ${testUser.fullname} (${testUser.email})...`);
  
  // Generate JWT token for testing
  const jwt = await import('jsonwebtoken');
  const token = jwt.default.sign(
    { userId: testUser._id },
    process.env.JWT_SECRET || 'your-secret-key',
    { expiresIn: '7d' }
  );
  
  const baseURL = process.env.BACKEND_URL || 'http://localhost:5002';
  
  try {
    // Test getUsersForSidebar
    console.log('\n   Testing GET /api/messages/users...');
    const usersRes = await fetch(`${baseURL}/api/messages/users`, {
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    const usersData = await usersRes.json();
    console.log(`   ✅ Users endpoint: ${Array.isArray(usersData) ? usersData.length : usersData?.users?.length || 0} users returned`);
    
    // Test getLastMessages (with limit)
    console.log('\n   Testing GET /api/messages/last-messages?limit=50...');
    const lastMessagesRes = await fetch(`${baseURL}/api/messages/last-messages?limit=50`, {
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    const lastMessagesData = await lastMessagesRes.json();
    
    if (lastMessagesData.lastMessages) {
      console.log(`   ✅ Last messages endpoint: ${lastMessagesData.lastMessages.length} conversations returned`);
      console.log(`   📊 Pagination:`, JSON.stringify(lastMessagesData.pagination, null, 2));
    } else {
      console.log(`   ✅ Last messages endpoint: ${Array.isArray(lastMessagesData) ? lastMessagesData.length : 0} conversations returned (old format)`);
    }
    
    // Test with different limits
    console.log('\n   Testing GET /api/messages/last-messages?limit=10...');
    const limitedRes = await fetch(`${baseURL}/api/messages/last-messages?limit=10`, {
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    const limitedData = await limitedRes.json();
    
    if (limitedData.lastMessages) {
      console.log(`   ✅ Limited endpoint: ${limitedData.lastMessages.length} conversations returned`);
      console.log(`   📊 Pagination:`, JSON.stringify(limitedData.pagination, null, 2));
    } else {
      console.log(`   ✅ Limited endpoint: ${Array.isArray(limitedData) ? limitedData.length : 0} conversations returned (old format)`);
    }
    
  } catch (error) {
    console.error('   ❌ Error testing endpoints:', error.message);
    console.log('   ⚠️  Note: Make sure the backend server is running on', baseURL);
  }
};

// Main function
const main = async () => {
  try {
    await connectDB();
    
    console.log('\n🚀 Starting test data generation...\n');
    
    // Step 1: Create users
    const users = await createUsers(100);
    
    if (users.length === 0) {
      console.log('❌ No users created. Exiting...');
      await mongoose.connection.close();
      return;
    }
    
    // Step 2: Create contacts
    await createContacts(users);
    
    // Step 3: Create messages
    const messageCount = await createMessages(users);
    
    // Step 4: Test endpoints
    const testUser = users[0]; // Use first user for testing
    await testEndpoints(testUser);
    
    // Summary
    console.log('\n📊 Summary:');
    console.log(`   Users: ${users.length}`);
    const contactCount = await ContactRequest.countDocuments({ status: 'accepted' });
    console.log(`   Contacts: ${contactCount}`);
    const totalMessages = await Message.countDocuments();
    console.log(`   Messages: ${totalMessages}`);
    
    console.log('\n✅ Test data generation completed!');
    console.log('\n💡 To test manually:');
    console.log(`   Login with: testuser1@test.com / test123456`);
    console.log(`   Or use any testuser1-100@test.com`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n👋 Database connection closed');
    process.exit(0);
  }
};

// Run the script
main();

