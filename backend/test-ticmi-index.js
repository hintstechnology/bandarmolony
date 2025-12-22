// Test script for TICMI API index endpoint
// Usage: node test-ticmi-index.js [indexCode] [startDate] [endDate]

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Load .env file manually if dotenv is not available
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const trimmedLine = line.trim();
      if (trimmedLine && !trimmedLine.startsWith('#')) {
        const [key, ...valueParts] = trimmedLine.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').replace(/^["']|["']$/g, '');
          if (!process.env[key.trim()]) {
            process.env[key.trim()] = value.trim();
          }
        }
      }
    });
  }
}

// Try to load dotenv, fallback to manual parsing
try {
  require('dotenv').config();
} catch (e) {
  // If dotenv is not installed, manually parse .env file
  loadEnv();
}

const indexCode = process.argv[2] || 'IDXBASIC';
const startDate = process.argv[3] || null;
const endDate = process.argv[4] || null;

// Calculate date range (7 days ago to today if not provided)
const today = new Date();
const sevenDaysAgo = new Date(today);
sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

const endDateStr = endDate || today.toISOString().split('T')[0];
const startDateStr = startDate || sevenDaysAgo.toISOString().split('T')[0];

const jwtToken = process.env.TICMI_JWT_TOKEN || '';
const baseUrl = `${process.env.TICMI_API_BASE_URL || ''}/dp/ix/`;

console.log('🧪 Testing TICMI API for index:', indexCode);
console.log('🧪 Base URL:', baseUrl);
console.log('🧪 Date range:', startDateStr, 'to', endDateStr);
console.log('🧪 Has Token:', !!jwtToken);
console.log('');

if (!jwtToken || !baseUrl || baseUrl === '/dp/ix/') {
  console.error('❌ Error: TICMI API configuration missing!');
  console.error('   Please set TICMI_JWT_TOKEN and TICMI_API_BASE_URL in .env file');
  process.exit(1);
}

const params = {
  indexCode: indexCode,
  startDate: startDateStr,
  endDate: endDateStr,
  granularity: "daily",
};

console.log('📤 Request params:', params);
console.log('');

axios.get(baseUrl, {
  params: params,
  headers: {
    "Accept": "application/json",
    "Authorization": `Bearer ${jwtToken}`,
    "x-Auth-key": jwtToken,
  },
  timeout: 30000,
})
  .then(response => {
    console.log('✅ Response Status:', response.status);
    console.log('✅ Response Headers:', JSON.stringify(response.headers, null, 2));
    console.log('');
    
    const payload = response.data;
    const data = payload?.data || payload;
    
    console.log('📦 Response Data Type:', Array.isArray(data) ? 'array' : typeof data);
    console.log('📦 Data Length:', Array.isArray(data) ? data.length : (data ? 1 : 0));
    console.log('');
    
    if (Array.isArray(data)) {
      if (data.length > 0) {
        console.log('✅ SUCCESS: Data found!');
        console.log('📊 First 3 records:');
        console.log(JSON.stringify(data.slice(0, 3), null, 2));
        console.log('');
        if (data.length > 3) {
          console.log(`... and ${data.length - 3} more records`);
        }
      } else {
        console.log('⚠️  WARNING: Empty array returned');
      }
    } else if (data && typeof data === 'object') {
      console.log('✅ SUCCESS: Data found!');
      console.log('📊 Data:', JSON.stringify(data, null, 2));
    } else {
      console.log('⚠️  WARNING: Unexpected data format');
      console.log('📊 Full response:', JSON.stringify(payload, null, 2));
    }
  })
  .catch(error => {
    console.error('❌ Error:', error.message);
    console.error('');
    
    if (error.response) {
      console.error('📋 Response Status:', error.response.status);
      console.error('📋 Response Status Text:', error.response.statusText);
      console.error('📋 Response Data:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.error('📋 Request made but no response received');
      console.error('📋 Request config:', JSON.stringify({
        url: error.config?.url,
        method: error.config?.method,
        params: error.config?.params,
      }, null, 2));
    } else {
      console.error('📋 Error details:', error);
    }
    
    process.exit(1);
  });

