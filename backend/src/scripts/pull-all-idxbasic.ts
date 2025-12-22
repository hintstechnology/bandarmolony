// Temporary script to pull all historical IDXBASIC data from TICMI API
// Usage: ts-node src/scripts/pull-all-idxbasic.ts

// Load environment variables manually
import * as fs from 'fs';
import * as path from 'path';

const envPath = path.join(__dirname, '../../.env');
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

import { OptimizedAzureStorageService, OptimizedHttpClient, removeDuplicates, convertToCsv, parseCsvString } from '../services/dataUpdateService';

const INDEX_CODE = 'IDXBASIC';
const BATCH_SIZE_DAYS = 90; // Fetch 3 months at a time (API might have limits)
const AZURE_BLOB_NAME: string = `index/${INDEX_CODE}.csv`;

// Set to true to fetch all historical data regardless of existing data
// Set to false to only fetch missing data
const FORCE_FETCH_ALL = process.argv.includes('--force') || process.argv.includes('-f');

// Helper function to format date as YYYY-MM-DD
function formatDate(date: Date): string {
  const dateStr = date.toISOString().split('T')[0];
  if (!dateStr) {
    throw new Error('Failed to format date');
  }
  return dateStr;
}

// Helper function to add days to date
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// Helper function to parse date from API response
function parseDateFromRow(row: any): string | null {
  const dateStr = row.Date || row.date || row.tanggal || '';
  if (!dateStr) return null;
  
  // Try to parse different date formats
  try {
    if (dateStr.includes('/')) {
      const parts = dateStr.split('/');
      if (parts.length === 3) {
        const date = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        return isNaN(date.getTime()) ? null : formatDate(date);
      }
    } else if (dateStr.includes('-')) {
      const date = new Date(dateStr);
      return isNaN(date.getTime()) ? null : formatDate(date);
    }
  } catch (e) {
    return null;
  }
  
  return null;
}

async function fetchAllHistoricalData() {
  console.log(`🚀 Starting to pull all historical data for ${INDEX_CODE}`);
  console.log('');
  
  // Load environment variables
  const jwtToken = process.env['TICMI_JWT_TOKEN'] || '';
  const baseUrl = `${process.env['TICMI_API_BASE_URL'] || ''}/dp/ix/`;
  
  if (!jwtToken || !baseUrl || baseUrl === '/dp/ix/') {
    console.error('❌ Error: TICMI API configuration missing!');
    console.error('   Please set TICMI_JWT_TOKEN and TICMI_API_BASE_URL in .env file');
    process.exit(1);
  }
  
  // Initialize Azure Storage and HTTP Client
  const azureStorage = new OptimizedAzureStorageService();
  await azureStorage.ensureContainerExists();
  
  const httpClient = new OptimizedHttpClient(baseUrl, jwtToken);
  
  // Load existing data if any
  let existingData: any[] = [];
  let oldestExistingDate: Date | null = null;
  
  if (FORCE_FETCH_ALL) {
    console.log('🔄 FORCE mode: Will fetch all historical data regardless of existing data');
    console.log('');
  } else {
    if (await azureStorage.blobExists(AZURE_BLOB_NAME)) {
      console.log('📂 Found existing data, loading...');
      const existingCsvData = await azureStorage.downloadCsvData(AZURE_BLOB_NAME);
      existingData = await parseCsvString(existingCsvData);
      
      // Find oldest date in existing data
      for (const row of existingData) {
        const dateStr = parseDateFromRow(row);
        if (dateStr) {
          const date = new Date(dateStr);
          if (!oldestExistingDate || date < oldestExistingDate) {
            oldestExistingDate = date;
          }
        }
      }
      
      console.log(`   Found ${existingData.length} existing records`);
      if (oldestExistingDate) {
        console.log(`   Oldest existing date: ${formatDate(oldestExistingDate)}`);
      }
      console.log('');
    } else {
      console.log('📂 No existing data found, starting fresh');
      console.log('');
    }
  }
  
  // Start from today and go backward
  const today = new Date();
  let currentEndDate = new Date(today);
  let allFetchedData: any[] = [];
  let batchNumber = 0;
  let totalRecordsFetched = 0;
  let consecutiveEmptyBatches = 0;
  const MAX_CONSECUTIVE_EMPTY = 3; // Stop after 3 consecutive empty batches
  
  console.log('🔄 Starting to fetch historical data...');
  console.log('');
  
  // Continue fetching until we hit empty batches or go too far back (e.g., 20 years)
  const maxDate = new Date();
  maxDate.setFullYear(maxDate.getFullYear() - 20);
  
  while (consecutiveEmptyBatches < MAX_CONSECUTIVE_EMPTY) {
    batchNumber++;
    
    // Calculate batch date range
    const batchStartDate = addDays(currentEndDate, -BATCH_SIZE_DAYS + 1);
    
    // Stop if we've gone too far back
    if (batchStartDate < maxDate) {
      console.log(`⏹️  Reached maximum date range (20 years), stopping...`);
      break;
    }
    
    // Stop if we've reached the oldest existing date (unless force mode)
    if (!FORCE_FETCH_ALL && oldestExistingDate && batchStartDate <= oldestExistingDate) {
      console.log(`⏹️  Reached oldest existing date (${formatDate(oldestExistingDate)}), stopping...`);
      break;
    }
    
    const startDateStr = formatDate(batchStartDate);
    const endDateStr = formatDate(currentEndDate);
    
    console.log(`📦 Batch ${batchNumber}: Fetching ${startDateStr} to ${endDateStr}...`);
    
    try {
      const params = {
        indexCode: INDEX_CODE,
        startDate: startDateStr,
        endDate: endDateStr,
        granularity: "daily",
      };
      
      const response = await httpClient.get('', params);
      
      if (!response.data || response.data === null) {
        console.log(`   ⚠️  Empty response, skipping batch...`);
        consecutiveEmptyBatches++;
        currentEndDate = addDays(batchStartDate, -1);
        continue;
      }
      
      const payload = response.data;
      const data = payload?.data || payload;
      
      let batchData: any[] = [];
      if (Array.isArray(data)) {
        batchData = data;
      } else if (typeof data === 'object' && data !== null) {
        batchData = [data];
      }
      
      if (batchData.length === 0) {
        console.log(`   ⚠️  No data in response, skipping batch...`);
        consecutiveEmptyBatches++;
        currentEndDate = addDays(batchStartDate, -1);
        continue;
      }
      
      // Reset consecutive empty counter
      consecutiveEmptyBatches = 0;
      
      // Filter out data that's already in existing data (unless force mode)
      let newData = batchData;
      if (!FORCE_FETCH_ALL) {
        const existingDates = new Set(
          existingData.map(row => parseDateFromRow(row)).filter(d => d !== null)
        );
        
        newData = batchData.filter(row => {
          const dateStr = parseDateFromRow(row);
          return dateStr && !existingDates.has(dateStr);
        });
      }
      
      if (newData.length > 0) {
        allFetchedData.push(...newData);
        totalRecordsFetched += newData.length;
        if (FORCE_FETCH_ALL) {
          console.log(`   ✅ Fetched ${batchData.length} records`);
        } else {
          console.log(`   ✅ Fetched ${batchData.length} records (${newData.length} new, ${batchData.length - newData.length} duplicates)`);
        }
      } else if (!FORCE_FETCH_ALL) {
        console.log(`   ⚠️  All ${batchData.length} records already exist, skipping...`);
      }
      
      // Move to next batch (go backward)
      const oldestDateInBatch = batchData.reduce((oldest: Date | null, row: any) => {
        const dateStr = parseDateFromRow(row);
        if (dateStr) {
          const date = new Date(dateStr);
          if (!oldest || date < oldest) {
            return date;
          }
        }
        return oldest;
      }, null);
      
      if (oldestDateInBatch) {
        currentEndDate = addDays(oldestDateInBatch, -1);
      } else {
        currentEndDate = addDays(batchStartDate, -1);
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error: any) {
      console.error(`   ❌ Error fetching batch: ${error.message}`);
      
      // If it's a 404 or 400, might mean no more data or invalid date range
      if (error.response?.status === 404 || error.response?.status === 400) {
        console.log(`   ⚠️  API returned ${error.response?.status}, moving to next batch...`);
        consecutiveEmptyBatches++;
        currentEndDate = addDays(batchStartDate, -1);
        continue;
      }
      
      // For other errors, wait a bit and move to next batch
      console.log(`   ⏳ Waiting 1 second before moving to next batch...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      consecutiveEmptyBatches++;
      currentEndDate = addDays(batchStartDate, -1);
    }
  }
  
  console.log('');
  console.log(`✅ Finished fetching historical data`);
  console.log(`   Total batches processed: ${batchNumber}`);
  console.log(`   Total new records fetched: ${totalRecordsFetched}`);
  console.log('');
  
  if (allFetchedData.length === 0) {
    console.log('ℹ️  No new data to save. All data already exists or no data available.');
    return;
  }
  
  // Merge with existing data (unless force mode, then replace)
  if (FORCE_FETCH_ALL) {
    console.log('🔄 FORCE mode: Replacing existing data with fetched data...');
    existingData = []; // Clear existing data in force mode
  } else {
    console.log('🔄 Merging with existing data...');
  }
  const combinedData = [...allFetchedData, ...existingData];
  
  // Sort by date (newest first, same as scheduler)
  combinedData.sort((a, b) => {
    const dateA = parseDateFromRow(a) || '';
    const dateB = parseDateFromRow(b) || '';
    return dateB.localeCompare(dateA);
  });
  
  // Remove duplicates
  const deduplicatedData = removeDuplicates(combinedData);
  
  console.log(`   Total records after merge: ${deduplicatedData.length}`);
  console.log(`   (${existingData.length} existing + ${allFetchedData.length} new = ${combinedData.length}, ${combinedData.length - deduplicatedData.length} duplicates removed)`);
  console.log('');
  
  // Convert to CSV and upload
  console.log('💾 Uploading to Azure Storage...');
  const csvData = convertToCsv(deduplicatedData);
  await azureStorage.uploadCsvData(AZURE_BLOB_NAME, csvData);
  
  console.log('');
  console.log(`✅ Successfully saved ${deduplicatedData.length} records to ${AZURE_BLOB_NAME}`);
  console.log('');
  
  // Show date range
  const dates = deduplicatedData.map(row => parseDateFromRow(row)).filter(d => d !== null).sort();
  if (dates.length > 0) {
    console.log(`📅 Date range: ${dates[dates.length - 1]} to ${dates[0]}`);
    console.log(`📅 Total days: ${dates.length}`);
  }
}

// Run the script
fetchAllHistoricalData()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

