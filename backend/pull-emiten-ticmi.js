// Script to pull emiten data from TICMI API using secCode parameter
// Usage: node pull-emiten-ticmi.js [stockCode1] [stockCode2] ...
// If no stock codes provided, will use emiten list from system

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

const jwtToken = process.env.TICMI_JWT_TOKEN || '';
const baseUrl = `${process.env.TICMI_API_BASE_URL || ''}/dp/eq/`;
const API_URL = process.env.API_URL || process.env.BACKEND_URL || 'http://localhost:3000';

if (!jwtToken || !baseUrl || baseUrl === '/dp/eq/') {
  console.error('❌ Error: TICMI API configuration missing!');
  console.error('   Please set TICMI_JWT_TOKEN and TICMI_API_BASE_URL in .env file');
  process.exit(1);
}

// Cache for company names
const companyNameCache = {};

// Function to load all company names from API
async function loadAllCompanyNames() {
  try {
    const response = await axios.get(`${API_URL}/api/stock-list`, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });
    
    if (response.data && response.data.data && response.data.data.stocks) {
      const stocks = response.data.data.stocks;
      stocks.forEach(stock => {
        if (stock.code && stock.companyName) {
          companyNameCache[stock.code.toUpperCase()] = stock.companyName;
        }
      });
      console.log(`   Loaded ${Object.keys(companyNameCache).length} company names from API`);
      return true;
    }
  } catch (error) {
    console.log(`   ⚠️  Could not load company names from API (${error.message}), using stock codes only`);
  }
  return false;
}

// Function to get company name from cache
function getCompanyName(stockCode) {
  return companyNameCache[stockCode.toUpperCase()] || stockCode;
}

// Function to get all stock codes
async function getAllStockCodes() {
  const stockCodesFromArgs = process.argv.slice(2);
  
  if (stockCodesFromArgs.length > 0) {
    console.log(`📊 Using ${stockCodesFromArgs.length} stock codes from arguments`);
    return stockCodesFromArgs.map(code => code.toUpperCase());
  }
  
  // Fetch all emitens from API
  console.log('📊 Fetching all emitens from system...');
  try {
    const response = await axios.get(`${API_URL}/api/stock-list`, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 20000
    });
    
    if (response.data && response.data.success && response.data.data && response.data.data.stocks) {
      const stockCodes = response.data.data.stocks
        .map(stock => stock.code)
        .filter(code => code && code.length === 4)
        .map(code => code.toUpperCase());
      console.log(`✅ Found ${stockCodes.length} emitens from system`);
      return stockCodes;
    } else {
      console.error('❌ Invalid response format from API');
      console.log('   Response:', JSON.stringify(response.data).substring(0, 200));
      throw new Error('Invalid response format');
    }
  } catch (error) {
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      console.error(`❌ Cannot connect to API at ${API_URL}`);
      console.log('   Make sure the backend server is running');
    } else {
      console.error(`❌ Failed to fetch emiten list: ${error.message}`);
    }
    console.log('⚠️  Using default stock codes instead (limited set)');
    return [
      'BBRI', 'BBCA', 'BMRI', 'BBNI', 'BBTN', 'TLKM', 'INDF', 
      'UNVR', 'ICBP', 'ASII', 'GOTO', 'BRIS', 'BSDE', 'KLBF', 'PGAS'
    ];
  }
}

// Calculate date range (7 days ago to today)
const today = new Date();
const sevenDaysAgo = new Date(today);
sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

const endDateStr = today.toISOString().split('T')[0];
const startDateStr = sevenDaysAgo.toISOString().split('T')[0];

console.log('🧪 TICMI API Configuration:');
console.log('   Base URL:', baseUrl);
console.log('   Date range:', startDateStr, 'to', endDateStr);
console.log('   Has Token:', !!jwtToken);
console.log('');

// Store results
const results = {
  success: [],
  failed: [],
  notFound: []
};

// Function to fetch emiten data from TICMI API
async function fetchEmitenData(secCode) {
  try {
    const params = {
      secCode: secCode,
      startDate: startDateStr,
      endDate: endDateStr,
      granularity: "daily",
    };

    const response = await axios.get(baseUrl, {
      params: params,
      headers: {
        "Accept": "application/json",
        "Authorization": `Bearer ${jwtToken}`,
        "x-Auth-key": jwtToken,
      },
      timeout: 30000,
    });

    const payload = response.data;
    const data = payload?.data || payload;

    if (Array.isArray(data) && data.length > 0) {
      return {
        success: true,
        secCode: secCode,
        dataCount: data.length,
        latestDate: data[data.length - 1]?.date || data[data.length - 1]?.Date || 'N/A',
        sample: data[0]
      };
    } else if (data && typeof data === 'object') {
      return {
        success: true,
        secCode: secCode,
        dataCount: 1,
        latestDate: data.date || data.Date || 'N/A',
        sample: data
      };
    } else {
      return {
        success: false,
        secCode: secCode,
        error: 'No data returned'
      };
    }
  } catch (error) {
    if (error.response) {
      if (error.response.status === 404) {
        return {
          success: false,
          secCode: secCode,
          error: 'Not found (404)'
        };
      }
      return {
        success: false,
        secCode: secCode,
        error: `HTTP ${error.response.status}: ${error.response.statusText}`
      };
    } else if (error.request) {
      return {
        success: false,
        secCode: secCode,
        error: 'No response received'
      };
    } else {
      return {
        success: false,
        secCode: secCode,
        error: error.message
      };
    }
  }
}

// Process all stock codes
async function processAllStocks() {
  const stockCodes = await getAllStockCodes();
  
  if (stockCodes.length === 0) {
    console.error('❌ No stock codes to process');
    return;
  }
  
  console.log(`🚀 Fetching data for ${stockCodes.length} emitens from TICMI API...\n`);
  
  // First, load all company names from API
  console.log('📋 Loading company names from API...');
  await loadAllCompanyNames();
  console.log('');
  
  for (let i = 0; i < stockCodes.length; i++) {
    const secCode = stockCodes[i];
    const companyName = getCompanyName(secCode);
    process.stdout.write(`[${i + 1}/${stockCodes.length}] Fetching ${secCode} (${companyName})... `);
    
    const result = await fetchEmitenData(secCode);
    result.companyName = companyName;
    
    if (result.success) {
      console.log(`✅ Found ${result.dataCount} records (latest: ${result.latestDate})`);
      results.success.push(result);
    } else {
      if (result.error === 'Not found (404)') {
        console.log(`❌ Not found`);
        results.notFound.push(result);
      } else {
        console.log(`❌ Error: ${result.error}`);
        results.failed.push(result);
      }
    }
    
    // Small delay to avoid rate limiting
    if (i < stockCodes.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('📊 SUMMARY');
  console.log('='.repeat(80));
  console.log(`✅ Success: ${results.success.length} emitens`);
  console.log(`❌ Failed: ${results.failed.length} emitens`);
  console.log(`⚠️  Not Found: ${results.notFound.length} emitens`);
  console.log('');
  
  if (results.success.length > 0) {
    console.log('✅ EMITEN WITH DATA (Company Names):');
    console.log('-'.repeat(80));
    results.success.forEach((result, index) => {
      console.log(`${(index + 1).toString().padStart(4)}. ${result.companyName} (${result.secCode}) - ${result.dataCount} records (latest: ${result.latestDate})`);
    });
    console.log('');
    
    // Show only company names (sorted alphabetically)
    console.log('📋 COMPANY NAMES ONLY (Sorted Alphabetically):');
    console.log('-'.repeat(80));
    const sortedResults = [...results.success].sort((a, b) => 
      (a.companyName || a.secCode).localeCompare(b.companyName || b.secCode)
    );
    sortedResults.forEach((result, index) => {
      console.log(`${(index + 1).toString().padStart(4)}. ${result.companyName}`);
    });
    console.log('');
    console.log(`Total: ${sortedResults.length} companies with data from TICMI API`);
    console.log('');
  }
  
  if (results.notFound.length > 0) {
    console.log('⚠️  EMITEN NOT FOUND:');
    console.log('-'.repeat(80));
    results.notFound.forEach((result, index) => {
      console.log(`${(index + 1).toString().padStart(4)}. ${result.secCode}`);
    });
    console.log('');
  }
  
  if (results.failed.length > 0) {
    console.log('❌ EMITEN WITH ERRORS:');
    console.log('-'.repeat(80));
    results.failed.forEach((result, index) => {
      console.log(`${(index + 1).toString().padStart(4)}. ${result.secCode} - ${result.error}`);
    });
  }
}

// Run the script
(async () => {
  try {
    await processAllStocks();
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
})();

