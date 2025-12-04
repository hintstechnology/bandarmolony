// stockDataUpdateService.ts
// Stock data update service with parallel processing

import { 
  OptimizedAzureStorageService, 
  OptimizedHttpClient, 
  ParallelProcessor, 
  CacheService,
  getTodayDate,
  parseCsvString,
  BATCH_SIZE_PHASE_1_STOCK,
  MAX_CONCURRENT_REQUESTS
} from './dataUpdateService';
import { SchedulerLogService } from './schedulerLogService';

// Sector mapping cache - loaded from csv_input/sector_mapping.csv
const SECTOR_MAPPING: { [key: string]: string[] } = {};

function getSectorForEmiten(emiten: string): string {
  // Check if emiten already exists in mapping
  for (const [sector, emitens] of Object.entries(SECTOR_MAPPING)) {
    if (emitens.includes(emiten)) {
      return sector;
    }
  }
  
  // If not found, use default fallback
  return 'Financials'; // Default fallback
}

async function buildSectorMappingFromCsv(azureStorage: OptimizedAzureStorageService): Promise<void> {
  console.log('🔍 Building sector mapping from csv_input/sector_mapping.csv...');
  
  try {
    // Load sector mapping from CSV
    const sectorMappingCsvData = await azureStorage.downloadCsvData('csv_input/sector_mapping.csv');
    const sectorMappingLines = sectorMappingCsvData.split('\n')
      .map(line => line.trim())
      .filter(line => line && line.length > 0);
    
    // Clear existing mapping
    Object.keys(SECTOR_MAPPING).forEach(sector => {
      SECTOR_MAPPING[sector] = [];
    });
    
    // Parse CSV data (skip header)
    for (let i = 1; i < sectorMappingLines.length; i++) {
      const line = sectorMappingLines[i];
      if (!line) continue;
      
      const values = line.split(',');
      if (values.length >= 2) {
        const sector = values[0]?.trim() || '';
        const emiten = values[1]?.trim() || '';
        
        if (sector && emiten) {
          if (!SECTOR_MAPPING[sector]) {
            SECTOR_MAPPING[sector] = [];
          }
          SECTOR_MAPPING[sector].push(emiten);
        }
      }
    }
    
    console.log('📊 Sector mapping built successfully from CSV');
    console.log(`📊 Found ${Object.keys(SECTOR_MAPPING).length} sectors with total ${Object.values(SECTOR_MAPPING).flat().length} emitens`);
    
    // Log sector breakdown
    Object.entries(SECTOR_MAPPING).forEach(([sector, emitens]) => {
      console.log(`📊 ${sector}: ${emitens.length} emitens`);
    });
    
  } catch (error) {
    console.warn('⚠️ Could not build sector mapping from CSV:', error);
    console.log('⚠️ Using default sector mapping');
    
    // Initialize with default sectors
    const defaultSectors = [
      'Basic Materials',
      'Consumer Cyclicals', 
      'Consumer Non-Cyclicals',
      'Energy',
      'Financials',
      'Healthcare',
      'Industrials',
      'Infrastructures',
      'Properties & Real Estate',
      'Technology',
      'Transportation & Logistic'
    ];
    
    defaultSectors.forEach(sector => {
      SECTOR_MAPPING[sector] = [];
    });
  }
}

// Process single emiten with optimized error handling
async function processEmiten(
  emiten: string,
  index: number,
  total: number,
  httpClient: OptimizedHttpClient,
  azureStorage: OptimizedAzureStorageService,
  todayDate: string,
  baseUrl: string,
  cache: CacheService,
  logId: string | null
): Promise<{ success: boolean; skipped: boolean; error?: string }> {
  try {
    // Check cache first
    const cacheKey = `stock_${emiten}_${todayDate}`;
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      return { success: true, skipped: false };
    }
    
    // Progress logging
    if ((index + 1) % 50 === 0 || index === 0) {
      const percentage = Math.round(((index + 1) / total) * 100);
      console.log(`📊 Stock progress - ${index + 1}/${total} (${percentage}%) - Processing ${emiten}`);
      if (logId) {
        await SchedulerLogService.updateLog(logId, {
          progress_percentage: Math.round(((index + 1) / total) * 100),
          current_processing: `Processing stock ${index + 1}/${total}`
        });
      }
    }
    
    const sector = getSectorForEmiten(emiten);
    const azureBlobName = `stock/${sector}/${emiten}.csv`;
    
    // Calculate 7 days ago date
    const sevenDaysAgo = new Date(todayDate);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoDate = sevenDaysAgo.toISOString().split('T')[0] || '';
    
    // Validate dates
    if (!sevenDaysAgoDate || !todayDate) {
      console.error(`❌ Stock ERROR - ${emiten} - Invalid date calculation`);
      return { success: false, skipped: false, error: 'Invalid date calculation' };
    }
    
    // Check if data already exists
    let existingData: any[] = [];
    if (await azureStorage.blobExists(azureBlobName)) {
      const existingCsvData = await azureStorage.downloadCsvData(azureBlobName);
      existingData = await parseCsvString(existingCsvData);
    }
    
    // Generate all dates in the past 7 days range
    const requiredDates: string[] = [];
    for (let d = new Date(sevenDaysAgoDate); d <= new Date(todayDate); d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      if (dateStr) {
        requiredDates.push(dateStr);
      }
    }
    
    // Check which dates are missing
    const existingDates = new Set(
      existingData.map(row => {
        const rowDate = row.date || row.tanggal || row.Date || '';
        if (!rowDate) return '';
        
        // Try different date formats
        let rowDateObj: Date;
        if (rowDate.includes('/')) {
          const parts = rowDate.split('/');
          if (parts.length === 3) {
            rowDateObj = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
          } else {
            rowDateObj = new Date(rowDate);
          }
        } else if (rowDate.includes('-')) {
          rowDateObj = new Date(rowDate);
        } else {
          rowDateObj = new Date(rowDate);
        }
        
        return isNaN(rowDateObj.getTime()) ? '' : rowDateObj.toISOString().split('T')[0];
      }).filter(d => d)
    );
    
    const missingDates = requiredDates.filter(date => !existingDates.has(date));
    
    // If all dates exist, skip
    if (missingDates.length === 0) {
      return { success: true, skipped: true };
    }
    
    // Fetch data from API for the date range (7 days)
    const params = {
      secCode: emiten,
      startDate: sevenDaysAgoDate,
      endDate: todayDate,
      granularity: "daily",
    };

    const response = await httpClient.get(baseUrl, params);
    
    if (!response.data || response.data === null) {
      // Jika API return null/empty, jangan ubah data existing sama sekali
      // Return error atau skip, jangan upload placeholder yang bisa mempengaruhi existing data
      console.error(`❌ Stock ERROR - ${emiten} - TICMI API returned null/empty data. Existing data preserved, no changes made.`);
      cache.set(cacheKey, { processed: true });
      return { success: false, skipped: false, error: 'TICMI API returned null/empty data' };
    }

    const payload = response.data;
    const data = payload.data || payload;

    let normalizedData: any[] = [];
    if (Array.isArray(data)) {
      normalizedData = data;
    } else if (typeof data === 'object' && data !== null) {
      normalizedData = [data];
    } else {
      return { success: true, skipped: true };
    }
    
    // Filter: Hanya ambil data untuk tanggal yang belum ada (missing dates)
    const missingDatesSet = new Set(missingDates);
    const newDataOnly = normalizedData.filter(row => {
      const rowDate = row.date || row.tanggal || row.Date || '';
      if (!rowDate) return false;
      
      // Normalize date format to YYYY-MM-DD for comparison
      let rowDateNormalized: string = '';
      if (rowDate.includes('/')) {
        const parts = rowDate.split('/');
        if (parts.length === 3) {
          const dateObj = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
          if (!isNaN(dateObj.getTime())) {
            const isoString = dateObj.toISOString();
            rowDateNormalized = isoString ? isoString.split('T')[0] || '' : '';
          }
        } else {
          const dateObj = new Date(rowDate);
          if (!isNaN(dateObj.getTime())) {
            const isoString = dateObj.toISOString();
            rowDateNormalized = isoString ? isoString.split('T')[0] || '' : '';
          }
        }
      } else if (rowDate.includes('-')) {
        const dateObj = new Date(rowDate);
        if (!isNaN(dateObj.getTime())) {
          const isoString = dateObj.toISOString();
          rowDateNormalized = isoString ? isoString.split('T')[0] || '' : '';
        }
      } else {
        const dateObj = new Date(rowDate);
        if (!isNaN(dateObj.getTime())) {
          const isoString = dateObj.toISOString();
          rowDateNormalized = isoString ? isoString.split('T')[0] || '' : '';
        }
      }
      
      // Hanya include jika tanggal ini ada di missing dates
      return rowDateNormalized && missingDatesSet.has(rowDateNormalized);
    });
    
    // Jika tidak ada data baru setelah filter, skip update (preserve existing)
    if (newDataOnly.length === 0) {
      cache.set(cacheKey, { processed: true });
      return { success: true, skipped: true };
    }
    
    // IMPORTANT: Jangan ubah existing data sama sekali, hanya append data baru untuk tanggal yang belum ada
    // Data existing sudah di-check di awal (existingDates), jadi newDataOnly hanya berisi tanggal yang benar-benar belum ada
    
    // Baca existing CSV sebagai string untuk append (preserve format as-is, jangan parse/modify)
    let existingCsvContent = '';
    if (await azureStorage.blobExists(azureBlobName)) {
      existingCsvContent = await azureStorage.downloadCsvData(azureBlobName);
      // Pastikan ada newline di akhir jika belum ada
      if (existingCsvContent && !existingCsvContent.endsWith('\n')) {
        existingCsvContent += '\n';
      }
    } else {
      // Jika file belum ada, buat header dulu
      const firstRow = newDataOnly[0];
      if (firstRow) {
        const headers = Object.keys(firstRow);
        existingCsvContent = headers.join(',') + '\n';
      }
    }
    
    // Convert new data to CSV rows (tanpa header, karena header sudah ada di existing)
    const newCsvRows: string[] = [];
    for (const row of newDataOnly) {
      // Gunakan header dari existing CSV atau dari row pertama
      let headers: string[] = [];
      if (existingCsvContent) {
        const lines = existingCsvContent.split('\n');
        const firstLine = lines[0];
        if (firstLine) {
          headers = firstLine.split(',').map(h => h.trim());
        } else {
          headers = Object.keys(row);
        }
      } else {
        headers = Object.keys(row);
      }
      
      const values = headers.map(header => {
        // Cari value dari row dengan berbagai kemungkinan field name
        const value = row[header] || row[header.toLowerCase()] || row[header.toUpperCase()] || '';
        return typeof value === 'string' && value.includes(',') ? `"${value}"` : (value || '');
      });
      newCsvRows.push(values.join(','));
    }
    
    // Append new data ke existing CSV (tanpa parse/modify existing)
    const combinedCsv = existingCsvContent + newCsvRows.join('\n');
    
    // Upload langsung tanpa parse/sort/deduplicate untuk preserve existing data as-is
    // Deduplicate sudah di-handle di awal dengan existingDates check
    await azureStorage.uploadCsvData(azureBlobName, combinedCsv);
    
    // Cache the result
    cache.set(cacheKey, { processed: true });
    
    return { success: true, skipped: false };

  } catch (error: any) {
    // Handle timeout errors gracefully - log but don't crash
    const errorMessage = error.message || 'Unknown error';
    const isTimeout = error.code === 'ETIMEDOUT' || 
                     error.code === 'ECONNABORTED' ||
                     errorMessage.includes('timeout');
    
    if (isTimeout) {
      console.warn(`⚠️ Stock ERROR - ${emiten} - Timeout: ${errorMessage}`);
    } else {
      console.error(`❌ Stock ERROR - ${emiten} - ${errorMessage}`);
    }
    
    // Return error result - don't throw to prevent crash
    return { success: false, skipped: false, error: errorMessage };
  }
}

// Main update function
export async function updateStockData(logId?: string | null, triggeredBy?: string): Promise<void> {
  // Skip if weekend
  const today = new Date();
  const dayOfWeek = today.getDay();
  
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    console.log('📅 Weekend detected - skipping Stock Data update (no market data available)');
    return;
  }
  
  // Only create log entry if logId is not provided (called from scheduler, not manual trigger)
  let finalLogId = logId;
  if (!finalLogId) {
    const logEntry = await SchedulerLogService.createLog({
      feature_name: 'stock',
      trigger_type: triggeredBy && !triggeredBy.startsWith('Phase') && !triggeredBy.startsWith('phase') ? 'manual' : 'scheduled',
      triggered_by: triggeredBy || 'Phase 1a Input Daily',
      status: 'running',
      environment: process.env['NODE_ENV'] || 'development'
    });

    if (!logEntry) {
      console.error('❌ Failed to create scheduler log entry');
      return;
    }

    finalLogId = logEntry.id!;
  }
  
  try {
    console.log('🚀 Stock scheduler started - Optimized daily stock data update');
    
    const azureStorage = new OptimizedAzureStorageService();
    await azureStorage.ensureContainerExists();

    await buildSectorMappingFromCsv(azureStorage);
    console.log('ℹ️ Sector mapping built from CSV');

    // Get list of emitens from sector mapping (all emitens from all sectors)
    const emitenList = Object.values(SECTOR_MAPPING).flat();
    
    console.log(`ℹ️ Found ${emitenList.length} emitens from sector mapping`);

    const jwtToken = process.env['TICMI_JWT_TOKEN'] || '';
    const baseUrl = `${process.env['TICMI_API_BASE_URL'] || ''}/dp/eq/`;
    const httpClient = new OptimizedHttpClient(baseUrl, jwtToken);
    const cache = new CacheService();

    const todayDate = getTodayDate();

    console.log(`🚀 Starting optimized parallel processing for ${emitenList.length} emitens...`);
    const startTime = Date.now();

    // Process emitens in parallel batches with memory management
    const results: Array<{ success: boolean; skipped: boolean; error?: string }> = [];
    const BATCH_SIZE = BATCH_SIZE_PHASE_1_STOCK; // 400 stocks per batch
    
    for (let i = 0; i < emitenList.length; i += BATCH_SIZE) {
      const batch = emitenList.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(emitenList.length / BATCH_SIZE);
      
      console.log(`📦 Processing batch ${batchNumber}/${totalBatches} (${batch.length} stocks)...`);
      
      // Memory check before batch
      if (global.gc) {
        const memBefore = process.memoryUsage();
        const heapUsedMB = memBefore.heapUsed / 1024 / 1024;
        if (heapUsedMB > 10240) { // 10GB threshold
          console.log(`⚠️ High memory usage detected: ${heapUsedMB.toFixed(2)}MB, forcing GC...`);
          global.gc();
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      // Process batch
      const batchResults = await ParallelProcessor.processInBatches(
        batch,
        async (emiten: string, batchIndex: number) => {
          return processEmiten(
            emiten,
            i + batchIndex,
            emitenList.length,
            httpClient,
            azureStorage,
            todayDate,
            baseUrl,
            cache,
            finalLogId
          );
        },
        BATCH_SIZE,
        MAX_CONCURRENT_REQUESTS
      );
      
      results.push(...batchResults);
      
      // Memory cleanup after batch
      if (global.gc) {
        global.gc();
        const memAfter = process.memoryUsage();
        const heapUsedMB = memAfter.heapUsed / 1024 / 1024;
        console.log(`📊 Batch ${batchNumber} complete - Memory: ${heapUsedMB.toFixed(2)}MB`);
      }
      
      // Small delay between batches for event loop breathing room
      if (i + BATCH_SIZE < emitenList.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    const endTime = Date.now();
    const processingTime = (endTime - startTime) / 1000;

    // Calculate statistics
    const successCount = results.filter(r => r.success && !r.skipped).length;
    const skipCount = results.filter(r => r.success && r.skipped).length;
    const errorCount = results.filter(r => !r.success).length;

    console.log(`✅ Stock scheduler completed - Success: ${successCount}, Skipped: ${skipCount}, Failed: ${errorCount}, Total: ${emitenList.length}`);

    if (finalLogId) {
      await SchedulerLogService.markCompleted(finalLogId, {
        total_files_processed: emitenList.length,
        files_created: successCount,
        files_skipped: skipCount,
        files_failed: errorCount
      });
    }

    console.log(`✅ Stock data update completed in ${processingTime}s`);
    console.log(`📊 Success: ${successCount}, Skipped: ${skipCount}, Failed: ${errorCount}`);

  } catch (error: any) {
    console.error(`❌ Stock scheduler error: ${error.message}`);
    if (finalLogId) {
      await SchedulerLogService.markFailed(finalLogId, error.message, error);
    }
  }
}
