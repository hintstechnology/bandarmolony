// Script to pull latest emiten data and display company names only
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Load .env file manually if exists
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
          process.env[key.trim()] = value.trim();
        }
      }
    });
  }
}

loadEnv();

const API_URL = process.env.API_URL || process.env.BACKEND_URL || 'http://localhost:3000';

async function getEmitenList() {
  try {
    console.log('📊 Fetching latest emiten data...\n');
    
    const response = await axios.get(`${API_URL}/api/stock-list`, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (response.data.success && response.data.data && response.data.data.stocks) {
      const stocks = response.data.data.stocks;
      const total = response.data.data.total || stocks.length;
      
      console.log(`✅ Found ${total} emitens:\n`);
      console.log('='.repeat(80));
      console.log('EMITEN LIST - COMPANY NAMES ONLY');
      console.log('='.repeat(80));
      console.log();
      
      // Display only company names, sorted alphabetically
      const companyNames = stocks
        .map(stock => stock.companyName || stock.code || 'N/A')
        .filter(name => name !== 'N/A' && name.trim() !== '')
        .sort();
      
      companyNames.forEach((name, index) => {
        console.log(`${(index + 1).toString().padStart(4)}. ${name}`);
      });
      
      console.log();
      console.log('='.repeat(80));
      console.log(`Total: ${companyNames.length} companies`);
      console.log('='.repeat(80));
      
      // Also show with codes for reference
      console.log('\n📋 With Stock Codes:\n');
      stocks
        .sort((a, b) => (a.companyName || a.code || '').localeCompare(b.companyName || b.code || ''))
        .forEach((stock, index) => {
          const name = stock.companyName || stock.code || 'N/A';
          const code = stock.code || 'N/A';
          console.log(`${(index + 1).toString().padStart(4)}. ${name} (${code})`);
        });
      
    } else {
      console.error('❌ Failed to get emiten list:', response.data.error || 'Unknown error');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Error fetching emiten list:');
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Error: ${error.response.data?.error || error.response.statusText}`);
    } else if (error.request) {
      console.error('   No response received. Is the server running?');
      console.error(`   URL: ${API_URL}/api/stock-list`);
    } else {
      console.error(`   ${error.message}`);
    }
    process.exit(1);
  }
}

// Run the script
getEmitenList();

