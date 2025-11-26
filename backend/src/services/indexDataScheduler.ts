// indexDataUpdateService.ts
// Index data update service with parallel processing

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

// Process single index with optimized error handling
async function processIndex(
  indexCode: string,
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
    const cacheKey = `index_${indexCode}_${todayDate}`;
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      return { success: true, skipped: false };
    }
    
    // Progress logging
    if ((index + 1) % 50 === 0 || index === 0) {
      const percentage = Math.round(((index + 1) / total) * 100);
      console.log(`📊 Index progress - ${index + 1}/${total} (${percentage}%) - Processing ${indexCode}`);
      if (logId) {
        await SchedulerLogService.updateLog(logId, {
          progress_percentage: Math.round(((index + 1) / total) * 100),
          current_processing: `Processing index ${index + 1}/${total}`
        });
      }
    }
    
    const azureBlobName = `index/${indexCode}.csv`;
    
    // Calculate 7 days ago date
    const sevenDaysAgo = new Date(todayDate);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoDate = sevenDaysAgo.toISOString().split('T')[0] || '';
    
    // Validate dates
    if (!sevenDaysAgoDate || !todayDate) {
      console.error(`❌ Index ERROR - ${indexCode} - Invalid date calculation`);
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
      indexCode: indexCode,
      startDate: sevenDaysAgoDate,
      endDate: todayDate,
      granularity: "daily",
    };

    const response = await httpClient.get(baseUrl, params);
    
    if (!response.data || response.data === null) {
      const placeholderData = [{
        date: todayDate,
        indexCode: indexCode,
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
    
    return { success: true, skipped: false };

  } catch (error: any) {
    console.error(`❌ Index ERROR - ${indexCode} - ${error.message}`);
    return { success: false, skipped: false, error: error.message };
  }
}

// Main update function
export async function updateIndexData(logId?: string | null, triggeredBy?: string): Promise<void> {
  // Skip if weekend
  const today = new Date();
  const dayOfWeek = today.getDay();
  
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    console.log('📅 Weekend detected - skipping Index Data update (no market data available)');
    return;
  }
  
  // Only create log entry if logId is not provided (called from scheduler, not manual trigger)
  let finalLogId = logId;
  if (!finalLogId) {
    const logEntry = await SchedulerLogService.createLog({
      feature_name: 'index',
      trigger_type: triggeredBy ? 'manual' : 'scheduled',
      triggered_by: triggeredBy || 'system',
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
    console.log('🚀 Index scheduler started - Optimized daily index data update');
    
    const azureStorage = new OptimizedAzureStorageService();
    await azureStorage.ensureContainerExists();
    console.log('ℹ️ Azure Storage initialized');

    // Get list of indexes from CSV input
    const indexesCsvData = await azureStorage.downloadCsvData('csv_input/index_list.csv');
    const indexList = indexesCsvData.split('\n')
      .map(line => line.trim().replace(/"/g, ''))
      .filter(line => line && line.length > 0);

    console.log(`ℹ️ Found ${indexList.length} indexes to update`);

    const jwtToken = process.env['TICMI_JWT_TOKEN'] || '';
    const baseUrl = `${process.env['TICMI_API_BASE_URL'] || ''}/dp/ix/`;
    const httpClient = new OptimizedHttpClient(baseUrl, jwtToken);
    const cache = new CacheService();

    const todayDate = getTodayDate();

    console.log(`🚀 Starting optimized parallel processing for ${indexList.length} indexes...`);
    const startTime = Date.now();

    // Process indexes in parallel batches
    const results = await ParallelProcessor.processInBatches(
      indexList,
      async (indexCode: string, index: number) => {
        return processIndex(
          indexCode,
          index,
          indexList.length,
          httpClient,
          azureStorage,
          todayDate,
          baseUrl,
          cache,
          finalLogId
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

    console.log(`✅ Index scheduler completed - Success: ${successCount}, Skipped: ${skipCount}, Failed: ${errorCount}, Total: ${indexList.length}`);

    if (finalLogId) {
      await SchedulerLogService.markCompleted(finalLogId, {
        total_files_processed: indexList.length,
        files_created: successCount,
        files_skipped: skipCount,
        files_failed: errorCount
      });
    }

    console.log(`✅ Index data update completed in ${processingTime}s`);
    console.log(`📊 Success: ${successCount}, Skipped: ${skipCount}, Failed: ${errorCount}`);

  } catch (error: any) {
    console.error(`❌ Index scheduler error: ${error.message}`);
    if (finalLogId) {
      await SchedulerLogService.markFailed(finalLogId, error.message, error);
    }
  }
}
