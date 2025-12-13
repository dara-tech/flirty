#!/usr/bin/env node

/**
 * Connection Checker Script
 * Checks if mobile app can connect to backend
 */

const axios = require('axios');
const { io } = require('socket.io-client');

const LOCAL_IP = process.env.EXPO_PUBLIC_LOCAL_IP || '192.168.0.116';
const PROD_URL = 'https://flirty-aspk.onrender.com';

async function checkConnection(url, label) {
  console.log(`\n🔍 Checking ${label}...`);
  console.log(`   URL: ${url}`);
  
  try {
    // Check HTTP API
    const apiUrl = url.includes('localhost') || url.includes('192.168') 
      ? `${url}/api/health`
      : `${url}/api/health`;
    
    const response = await axios.get(apiUrl, { timeout: 5000 });
    console.log(`   ✅ HTTP API: OK (${response.status})`);
    
    // Check Socket.IO
    return new Promise((resolve) => {
      const socket = io(url, {
        transports: ['websocket'],
        timeout: 5000,
      });
      
      socket.on('connect', () => {
        console.log(`   ✅ Socket.IO: Connected (ID: ${socket.id})`);
        socket.disconnect();
        resolve(true);
      });
      
      socket.on('connect_error', (error) => {
        console.log(`   ❌ Socket.IO: Failed - ${error.message}`);
        resolve(false);
      });
      
      setTimeout(() => {
        console.log(`   ⏱️  Socket.IO: Timeout`);
        socket.disconnect();
        resolve(false);
      }, 5000);
    });
  } catch (error) {
    console.log(`   ❌ HTTP API: Failed - ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('🌐 Mobile App Connection Checker\n');
  console.log('='.repeat(50));
  
  // Check local backend
  const localUrl = `http://${LOCAL_IP}:5002`;
  const localOk = await checkConnection(localUrl, 'Local Backend');
  
  // Check production backend
  const prodOk = await checkConnection(PROD_URL, 'Production Backend');
  
  console.log('\n' + '='.repeat(50));
  console.log('\n📊 Summary:');
  console.log(`   Local Backend (${LOCAL_IP}): ${localOk ? '✅ OK' : '❌ FAILED'}`);
  console.log(`   Production Backend: ${prodOk ? '✅ OK' : '❌ FAILED'}`);
  
  if (!localOk && !prodOk) {
    console.log('\n⚠️  Warning: Cannot connect to any backend!');
    console.log('   - Check if backend is running');
    console.log('   - Check your network connection');
    console.log('   - Verify IP address in .env file');
  } else if (localOk && !prodOk) {
    console.log('\n✅ Use local backend for development');
  } else if (!localOk && prodOk) {
    console.log('\n✅ Use production backend');
    console.log('   Update mobile/.env:');
    console.log('   EXPO_PUBLIC_API_URL=https://flirty-aspk.onrender.com');
  } else {
    console.log('\n✅ Both backends are accessible');
  }
}

main().catch(console.error);
