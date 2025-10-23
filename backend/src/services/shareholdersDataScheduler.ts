// shareholdersDataUpdateService.ts
// Shareholders data update service with parallel processing

import { 
  OptimizedAzureStorageService, 
  OptimizedHttpClient, 
  ParallelProcessor, 
  CacheService,
  getTodayDate,
  removeDuplicates,
  convertToCsv,
  parseCsvString,
  BATCH_SIZE,
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

// -------------------------------------------------
// Fungsi untuk menormalisasi data shareholders sesuai file asli
// 
// Input: Array dari TICMI API response.data
// Output: Array flattened dengan struktur:
// - EmitenCode: Kode emiten (BBCA, BBRI, dll)
// - DataDate: Tanggal data (YYYY-MM-DD)
// - JumlahPemegangSaham: Total jumlah pemegang saham
// - LastUpdate: Tanggal update terakhir
// - PemegangSaham_Pengendali: Status pengendali (true/false)
// - PemegangSaham_Nama: Nama pemegang saham
// - PemegangSaham_Kategori: Kategori pemegang (Lebih dari 5%, Direksi, dll)
// - PemegangSaham_Persentase: Persentase kepemilikan
// - PemegangSaham_JmlSaham: Jumlah saham yang dimiliki
// 
// Setiap DataDate akan menghasilkan multiple rows sesuai jumlah PemegangSaham
// -------------------------------------------------
function normalizeShareholdersData(data: any[]): any[] {
  const normalizedData: any[] = [];
  
  for (const item of data) {
    // Pastikan item memiliki struktur yang benar
    if (!item || typeof item !== 'object') {
      continue;
    }
    
    // Flatten PemegangSaham array untuk setiap DataDate
    if (Array.isArray(item.PemegangSaham) && item.PemegangSaham.length > 0) {
      for (const pemegang of item.PemegangSaham) {
        // Pastikan pemegang memiliki struktur yang benar
        if (!pemegang || typeof pemegang !== 'object') {
          continue;
        }
        
        const row: any = {
          EmitenCode: item.EmitenCode || '',
          DataDate: item.DataDate || '',
          JumlahPemegangSaham: item.JumlahPemegangSaham || '',
          LastUpdate: item.LastUpdate || '',
          PemegangSaham_Pengendali: pemegang.Pengendali || '',
          PemegangSaham_Nama: pemegang.Nama || '',
          PemegangSaham_Kategori: pemegang.Kategori || '',
          PemegangSaham_Persentase: pemegang.Persentase || '',
          PemegangSaham_JmlSaham: pemegang.JmlSaham || ''
        };
        normalizedData.push(row);
      }
    } else {
      // If PemegangSaham is not an array or empty, create a single row with null values
      const row: any = {
        EmitenCode: item.EmitenCode || '',
        DataDate: item.DataDate || '',
        JumlahPemegangSaham: item.JumlahPemegangSaham || '',
        LastUpdate: item.LastUpdate || '',
        PemegangSaham_Pengendali: '',
        PemegangSaham_Nama: '',
        PemegangSaham_Kategori: '',
        PemegangSaham_Persentase: '',
        PemegangSaham_JmlSaham: ''
      };
      normalizedData.push(row);
    }
  }
  
  return normalizedData;
}

// Process single emiten for shareholders data
async function processShareholdersEmiten(
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
    const cacheKey = `shareholders_${emiten}_${todayDate}`;
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      await AzureLogger.logItemProcess('shareholders', 'SUCCESS', emiten, 'Data loaded from cache');
      return { success: true, skipped: false };
    }
    
    // Progress logging
    if ((index + 1) % 50 === 0 || index === 0) {
      await AzureLogger.logProgress('shareholders', index + 1, total, `Processing ${emiten}`);
      if (logId) {
        await SchedulerLogService.updateLog(logId, {
          progress_percentage: Math.round(((index + 1) / total) * 100),
          current_processing: `Processing shareholders ${index + 1}/${total}`
        });
      }
    }
    
    const azureBlobName = `shareholders/${emiten}.csv`;
    
    // Check if data already exists for today - sesuai file asli
    let existingData: any[] = [];
    if (await azureStorage.blobExists(azureBlobName)) {
      const existingCsvData = await azureStorage.downloadCsvData(azureBlobName);
      existingData = await parseCsvString(existingCsvData);
    }
    
    // Cek apakah data untuk tanggal hari ini sudah ada - sesuai file asli
    const todayDataExists = existingData.some(row => 
      row.DataDate === todayDate || row.date === todayDate || row.Date === todayDate
    );
    
    if (todayDataExists) {
      await AzureLogger.logItemProcess('shareholders', 'SKIP', emiten, `Data untuk ${emiten} tanggal ${todayDate} sudah ada`);
      return { success: true, skipped: true };
    }
    
    // Fetch data from API - sesuai file asli (hanya secCode)
    const params = {
      secCode: emiten,
    };

    const response = await httpClient.get(baseUrl, params);
    
    // Jika respons kosong - sesuai file asli
    if (!response.data) {
      await AzureLogger.logItemProcess('shareholders', 'SKIP', emiten, 'Kosong');
      return { success: true, skipped: true };
    }

    const payload = response.data;
    
    // Pastikan payload memiliki struktur yang benar
    if (!payload || typeof payload !== 'object') {
      await AzureLogger.logItemProcess('shareholders', 'SKIP', emiten, 'Invalid payload structure');
      return { success: true, skipped: true };
    }
    
    // Ambil data dari payload.data (sesuai struktur TICMI API)
    const data = payload.data;
    
    // Normalisasi JSON menjadi array sesuai dengan file asli
    let normalizedData: any[] = [];
    if (Array.isArray(data) && data.length > 0) {
      normalizedData = normalizeShareholdersData(data);
      await AzureLogger.logItemProcess('shareholders', 'SUCCESS', emiten, `Processing ${normalizedData.length} shareholder records`);
    } else if (typeof data === 'object' && data !== null) {
      normalizedData = normalizeShareholdersData([data]);
      await AzureLogger.logItemProcess('shareholders', 'SUCCESS', emiten, 'Processing single shareholder record');
    } else {
      await AzureLogger.logItemProcess('shareholders', 'SKIP', emiten, 'No valid data found');
      return { success: true, skipped: true };
    }
    
    // Cek apakah ada data yang berhasil dinormalisasi
    if (normalizedData.length === 0) {
      await AzureLogger.logItemProcess('shareholders', 'SKIP', emiten, 'No normalized data');
      return { success: true, skipped: true };
    }
    
    // Gabungkan data baru dengan data existing
    const combinedData = [...normalizedData, ...existingData];
    
    // Urutkan berdasarkan tanggal (terbaru di atas) - sesuai file asli
    combinedData.sort((a, b) => {
      const dateA = a.DataDate || a.date || a.Date || '';
      const dateB = b.DataDate || b.date || b.Date || '';
      return dateB.localeCompare(dateA); // Descending (terbaru di atas)
    });
    
    // Hapus duplikat berdasarkan kombinasi unik - sesuai file asli
    const deduplicatedData = removeDuplicates(combinedData);
    const csvData = convertToCsv(deduplicatedData);
    
    await azureStorage.uploadCsvData(azureBlobName, csvData);
    
    // Cache the result
    cache.set(cacheKey, { processed: true });
    
    await AzureLogger.logItemProcess('shareholders', 'SUCCESS', emiten, 'Data updated successfully');
    return { success: true, skipped: false };

  } catch (error: any) {
    await AzureLogger.logItemProcess('shareholders', 'ERROR', emiten, error.message);
    return { success: false, skipped: false, error: error.message };
  }
}

// Main update function
export async function updateShareholdersData(): Promise<void> {
  const SCHEDULER_TYPE = 'shareholders';
  
  // Weekend skip temporarily disabled for testing
  // const today = new Date();
  // const dayOfWeek = today.getDay();
  // 
  // if (dayOfWeek === 0 || dayOfWeek === 6) {
  //   await AzureLogger.logWeekendSkip(SCHEDULER_TYPE);
  //   return;
  // }
  
  const logEntry = await SchedulerLogService.createLog({
    feature_name: 'shareholders',
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
    await AzureLogger.logSchedulerStart(SCHEDULER_TYPE, 'Optimized daily shareholders data update');
    
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
    const baseUrl = `${process.env['TICMI_API_BASE_URL'] || ''}/ki/sh/`;
    const httpClient = new OptimizedHttpClient(baseUrl, jwtToken);
    const cache = new CacheService();

    const todayDate = getTodayDate();

    console.log(`🚀 Starting optimized parallel processing for ${emitenList.length} emitens...`);
    const startTime = Date.now();

    // Process emitens in parallel batches
    const results = await ParallelProcessor.processInBatches(
      emitenList,
      async (emiten: string, index: number) => {
        return processShareholdersEmiten(
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
      BATCH_SIZE,
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

    console.log(`✅ Shareholders data update completed in ${processingTime}s`);
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
