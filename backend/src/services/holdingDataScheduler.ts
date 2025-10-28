// holdingDataUpdateService.ts
// Holding data update service with parallel processing

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

// Process single emiten for holding data
async function processHoldingEmiten(
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
    const cacheKey = `holding_${emiten}_${todayDate}`;
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      await AzureLogger.logItemProcess('holding', 'SUCCESS', emiten, 'Data loaded from cache');
      return { success: true, skipped: false };
    }
    
    // Progress logging
    if ((index + 1) % 50 === 0 || index === 0) {
      await AzureLogger.logProgress('holding', index + 1, total, `Processing ${emiten}`);
      if (logId) {
        await SchedulerLogService.updateLog(logId, {
          progress_percentage: Math.round(((index + 1) / total) * 100),
          current_processing: `Processing holding ${index + 1}/${total}`
        });
      }
    }
    
    const azureBlobName = `holding/${emiten}.csv`;
    
    // Check if data already exists for today
    let existingData: any[] = [];
    if (await azureStorage.blobExists(azureBlobName)) {
      const existingCsvData = await azureStorage.downloadCsvData(azureBlobName);
      existingData = await parseCsvString(existingCsvData);
    }
    
    // Check if any data exists for the past week
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoDate = weekAgo.toISOString().split('T')[0];
    
    if (!weekAgoDate) {
      await AzureLogger.logItemProcess('holding', 'ERROR', emiten, 'Failed to calculate week ago date');
      return { success: false, skipped: false, error: 'Failed to calculate week ago date' };
    }
    
    // Check if ALL days in the past week have data
    const weekAgoDateObj = new Date(weekAgoDate);
    const todayDateObj = new Date(todayDate);
    
    // Generate all dates in the range
    const requiredDates: string[] = [];
    for (let d = new Date(weekAgoDateObj); d <= todayDateObj; d.setDate(d.getDate() + 1)) {
      const isoString = d.toISOString();
      if (isoString) {
        const datePart = isoString.split('T')[0];
        if (datePart) {
          requiredDates.push(datePart);
        }
      }
    }
    
    // Check if we have data for all required dates
    const existingDates = new Set(
      existingData
        .map(row => {
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
        })
        .filter(date => date)
    );
    
    // Check if all required dates exist
    const weekDataExists = requiredDates.every(date => existingDates.has(date));
    
    if (weekDataExists) {
      await AzureLogger.logItemProcess('holding', 'SKIP', emiten, 'Data already exists for the past week');
      return { success: true, skipped: true };
    }
    
    // Fetch data from API for the past week
    const params = {
      secCode: emiten,
      startDate: weekAgoDate,
      endDate: todayDate,
      granularity: "daily",
    };

    const response = await httpClient.get(baseUrl, params);
    
    if (!response.data || response.data === null) {
      const placeholderData = [{
        date: todayDate,
        emiten: emiten,
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
    
    await AzureLogger.logItemProcess('holding', 'SUCCESS', emiten, 'Data updated successfully');
    return { success: true, skipped: false };

  } catch (error: any) {
    await AzureLogger.logItemProcess('holding', 'ERROR', emiten, error.message);
    return { success: false, skipped: false, error: error.message };
  }
}

// Main update function
export async function updateHoldingData(): Promise<void> {
  const SCHEDULER_TYPE = 'holding';
  
  // Weekend skip temporarily disabled for testing
  // const today = new Date();
  // const dayOfWeek = today.getDay();
  // 
  // if (dayOfWeek === 0 || dayOfWeek === 6) {
  //   await AzureLogger.logWeekendSkip(SCHEDULER_TYPE);
  //   return;
  // }
  
  const logEntry = await SchedulerLogService.createLog({
    feature_name: 'holding',
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
    await AzureLogger.logSchedulerStart(SCHEDULER_TYPE, 'Optimized daily holding data update');
    
    const azureStorage = new OptimizedAzureStorageService();
    await azureStorage.ensureContainerExists();
    await AzureLogger.logInfo(SCHEDULER_TYPE, 'Azure Storage initialized');

    // Get list of emitens from CSV input
    const emitensCsvData = await azureStorage.downloadCsvData('csv_input/emiten_list.csv');
    const emitenList = emitensCsvData.split('\n')
      .map(line => line.trim())
      .filter(line => line && line.length > 0);

    await AzureLogger.logInfo(SCHEDULER_TYPE, `Found ${emitenList.length} emitens to update`);

    const jwtToken = process.env['TICMI_JWT_TOKEN'] || '';
    const baseUrl = `${process.env['TICMI_API_BASE_URL'] || ''}/cp/hc/`;
    const httpClient = new OptimizedHttpClient(baseUrl, jwtToken);
    const cache = new CacheService();

    const todayDate = getTodayDate();

    console.log(`🚀 Starting optimized parallel processing for ${emitenList.length} emitens...`);
    const startTime = Date.now();

    // Process emitens in parallel batches
    const results = await ParallelProcessor.processInBatches(
      emitenList,
      async (emiten: string, index: number) => {
        return processHoldingEmiten(
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

    console.log(`✅ Holding data update completed in ${processingTime}s`);
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
