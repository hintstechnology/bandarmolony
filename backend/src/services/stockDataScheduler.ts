// stockDataUpdateService.ts
// Stock data update service with parallel processing

import { 
  OptimizedAzureStorageService, 
  OptimizedHttpClient, 
  ParallelProcessor, 
  CacheService,
  getTodayDate,
  removeDuplicates,
  convertToCsv,
  parseCsvString,
  BATCH_SIZE_PHASE_1_2,
  MAX_CONCURRENT_REQUESTS
} from './dataUpdateService';
import { SchedulerLogService } from './schedulerLogService';
import { AzureLogger } from './azureLoggingService';

// Timezone helper function
function getJakartaTime(): string {
  const now = new Date();
  const jakartaTime = new Date(now.getTime() + (7 * 60 * 60 * 1000)); // UTC + 7
  return jakartaTime.toISOString();
}

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
      await AzureLogger.logItemProcess('stock', 'SUCCESS', emiten, 'Data loaded from cache');
      return { success: true, skipped: false };
    }
    
    // Progress logging
    if ((index + 1) % 50 === 0 || index === 0) {
      await AzureLogger.logProgress('stock', index + 1, total, `Processing ${emiten}`);
      if (logId) {
        await SchedulerLogService.updateLog(logId, {
          progress_percentage: Math.round(((index + 1) / total) * 100),
          current_processing: `Processing stock ${index + 1}/${total}`
        });
      }
    }
    
    const sector = getSectorForEmiten(emiten);
    const azureBlobName = `stock/${sector}/${emiten}.csv`;
    
    // Check if data already exists for today
    let existingData: any[] = [];
    if (await azureStorage.blobExists(azureBlobName)) {
      const existingCsvData = await azureStorage.downloadCsvData(azureBlobName);
      existingData = await parseCsvString(existingCsvData);
    }
    
    // Check if today's data already exists
    const todayDataExists = existingData.some(row => {
      const rowDate = row.date || row.tanggal || row.Date || '';
      if (!rowDate) return false;
      
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
      
      const rowDateStr = isNaN(rowDateObj.getTime()) ? '' : rowDateObj.toISOString().split('T')[0];
      return rowDateStr === todayDate;
    });
    
    if (todayDataExists) {
      await AzureLogger.logItemProcess('stock', 'SKIP', emiten, `Data already exists for today (${todayDate})`);
      return { success: true, skipped: true };
    }
    
    // Fetch data from API for today only
    const params = {
      secCode: emiten,
      startDate: todayDate,
      endDate: todayDate,
      granularity: "daily",
    };

    const response = await httpClient.get(baseUrl, params);
    
    if (!response.data || response.data === null) {
      const placeholderData = [{
        date: todayDate,
        emiten: emiten,
        sector: sector,
        status: 'EMPTY',
        note: 'Data kosong dari TICMI API'
      }];
      
      const combinedData = [...placeholderData, ...existingData];
      combinedData.sort((a, b) => {
        const dateA = a.date || a.tanggal || a.Date || '';
        const dateB = b.date || b.tanggal || b.Date || '';
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      });
      
      const deduplicatedData = removeDuplicates(combinedData);
      const csvData = convertToCsv(deduplicatedData);
      
      await azureStorage.uploadCsvData(azureBlobName, csvData);
      
      // Cache the result
      cache.set(cacheKey, { processed: true });
      
      return { success: true, skipped: false };
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
    
    const combinedData = [...normalizedData, ...existingData];
    combinedData.sort((a, b) => {
      const dateA = a.date || a.tanggal || a.Date || '';
      const dateB = b.date || b.tanggal || b.Date || '';
      return dateB.localeCompare(dateA);
    });
    
    const deduplicatedData = removeDuplicates(combinedData);
    const csvData = convertToCsv(deduplicatedData);
    
    await azureStorage.uploadCsvData(azureBlobName, csvData);
    
    // Cache the result
    cache.set(cacheKey, { processed: true });
    
    await AzureLogger.logItemProcess('stock', 'SUCCESS', emiten, 'Data updated successfully');
    return { success: true, skipped: false };

  } catch (error: any) {
    // Handle timeout errors gracefully - log but don't crash
    const errorMessage = error.message || 'Unknown error';
    const isTimeout = error.code === 'ETIMEDOUT' || 
                     error.code === 'ECONNABORTED' ||
                     errorMessage.includes('timeout');
    
    if (isTimeout) {
      await AzureLogger.logItemProcess('stock', 'ERROR', emiten, `Timeout: ${errorMessage}`);
      console.warn(`⚠️ Timeout for ${emiten}: ${errorMessage}`);
    } else {
      await AzureLogger.logItemProcess('stock', 'ERROR', emiten, errorMessage);
      console.error(`❌ Error processing ${emiten}: ${errorMessage}`);
    }
    
    // Return error result - don't throw to prevent crash
    return { success: false, skipped: false, error: errorMessage };
  }
}

// Main update function
export async function updateStockData(): Promise<void> {
  const SCHEDULER_TYPE = 'stock';
  
  // Weekend skip temporarily disabled for testing
  // const today = new Date();
  // const dayOfWeek = today.getDay();
  // 
  // if (dayOfWeek === 0 || dayOfWeek === 6) {
  //   await AzureLogger.logWeekendSkip(SCHEDULER_TYPE);
  //   return;
  // }
  
  const logEntry = await SchedulerLogService.createLog({
    feature_name: 'stock',
    trigger_type: 'scheduled',
    triggered_by: 'system',
    status: 'running',
    force_override: false,
    environment: process.env['NODE_ENV'] || 'development',
    started_at: getJakartaTime()
  });

  if (!logEntry) {
    console.error('❌ Failed to create scheduler log entry');
    return;
  }

  const logId = logEntry.id!;
  
  try {
    await AzureLogger.logSchedulerStart(SCHEDULER_TYPE, 'Optimized daily stock data update');
    
    const azureStorage = new OptimizedAzureStorageService();
    await azureStorage.ensureContainerExists();
    await AzureLogger.logInfo(SCHEDULER_TYPE, 'Azure Storage initialized');

    await buildSectorMappingFromCsv(azureStorage);
    await AzureLogger.logInfo(SCHEDULER_TYPE, 'Sector mapping built from CSV');

    // Get list of emitens from sector mapping (all emitens from all sectors)
    const emitenList = Object.values(SECTOR_MAPPING).flat();
    
    await AzureLogger.logInfo(SCHEDULER_TYPE, `Found ${emitenList.length} emitens from sector mapping`);

    const jwtToken = process.env['TICMI_JWT_TOKEN'] || '';
    const baseUrl = `${process.env['TICMI_API_BASE_URL'] || ''}/dp/eq/`;
    const httpClient = new OptimizedHttpClient(baseUrl, jwtToken);
    const cache = new CacheService();

    const todayDate = getTodayDate();

    console.log(`🚀 Starting optimized parallel processing for ${emitenList.length} emitens...`);
    const startTime = Date.now();

    // Process emitens in parallel batches
    const results = await ParallelProcessor.processInBatches(
      emitenList,
      async (emiten: string, index: number) => {
        return processEmiten(
          emiten,
          index,
          emitenList.length,
          httpClient,
          azureStorage,
          todayDate,
          baseUrl,
          cache,
          logId
        );
      },
      BATCH_SIZE_PHASE_1_2,
      MAX_CONCURRENT_REQUESTS
    );

    const endTime = Date.now();
    const processingTime = (endTime - startTime) / 1000;

    // Calculate statistics
    const successCount = results.filter(r => r.success && !r.skipped).length;
    const skipCount = results.filter(r => r.success && r.skipped).length;
    const errorCount = results.filter(r => !r.success).length;

    // Wait a moment for any pending Azure logging operations to complete
    await new Promise(resolve => setTimeout(resolve, 1000));

    await AzureLogger.logSchedulerEnd(SCHEDULER_TYPE, {
      success: successCount,
      skipped: skipCount,
      failed: errorCount,
      total: emitenList.length
    });

    if (logId) {
      await SchedulerLogService.updateLog(logId, {
        status: 'completed',
        progress_percentage: 100,
        total_files_processed: successCount,
        files_skipped: skipCount,
        files_failed: errorCount
      });
    }

    console.log(`✅ Stock data update completed in ${processingTime}s`);
    console.log(`📊 Success: ${successCount}, Skipped: ${skipCount}, Failed: ${errorCount}`);

  } catch (error: any) {
    await AzureLogger.logSchedulerError(SCHEDULER_TYPE, error.message);
    if (logId) {
      await SchedulerLogService.updateLog(logId, {
        status: 'failed',
        error_message: error.message
      });
    }
  }
}
