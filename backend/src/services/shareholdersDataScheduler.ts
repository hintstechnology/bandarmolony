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
  BATCH_SIZE_PHASE_1_SHAREHOLDERS,
  MAX_CONCURRENT_REQUESTS_PHASE_1_SHAREHOLDERS,
  getEmitenListFromCsv
} from './dataUpdateService';
import { SchedulerLogService } from './schedulerLogService';

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
  cache: CacheService,
  logId: string | null
): Promise<{ success: boolean; skipped: boolean; error?: string }> {
  try {
    // Check cache first
    const cacheKey = `shareholders_${emiten}_${todayDate}`;
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      return { success: true, skipped: false };
    }

    // Progress logging
    if ((index + 1) % 50 === 0 || index === 0) {
      const percentage = Math.round(((index + 1) / total) * 100);
      console.log(`📊 Shareholders progress - ${index + 1}/${total} (${percentage}%) - Processing ${emiten}`);
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
      return { success: true, skipped: true };
    }

    // Fetch data from API - sesuai file asli (hanya secCode)
    const params = {
      secCode: emiten,
    };

    let response;
    try {
      // Gunakan baseURL yang sudah diset di OptimizedHttpClient.
      // Di sini cukup kirim path kosong, supaya URL final:
      //   <TICMI_API_BASE_URL>/ki/sh/?secCode=BBCA
      response = await httpClient.get('', params);
    } catch (apiError: any) {
      if (apiError.response) {
        const status = apiError.response.status;
        const bodySnippet = (() => {
          try {
            return JSON.stringify(apiError.response.data).substring(0, 500);
          } catch {
            return String(apiError.response.data || '');
          }
        })();

        // Detail logging khusus 401 (auth / quota / policy)
        if (status === 401) {
          console.error(`❌ Shareholders 401 ERROR - ${emiten} - body: ${bodySnippet}`);
          return { success: false, skipped: false, error: `401 Unauthorized from TICMI` };
        }

        // Handle 400 Bad Request - emiten may not exist or be invalid in TICMI API
        if (status === 400) {
          console.warn(`⚠️ Emiten ${emiten} returned 400 Bad Request - may not be available in TICMI API. Body: ${bodySnippet}`);

          // Save placeholder data to indicate emiten is not available
          const placeholderData = [{
            EmitenCode: emiten,
            DataDate: todayDate,
            JumlahPemegangSaham: '',
            LastUpdate: todayDate,
            PemegangSaham_Pengendali: '',
            PemegangSaham_Nama: '',
            PemegangSaham_Kategori: 'NOT_AVAILABLE',
            PemegangSaham_Persentase: '',
            PemegangSaham_JmlSaham: ''
          }];

          const combinedData = [...placeholderData, ...existingData];
          // Sort descending: newest first (consistent with main data processing)
          combinedData.sort((a, b) => {
            const dateA = a.DataDate || a.date || a.Date || '';
            const dateB = b.DataDate || b.date || b.Date || '';
            const timeA = new Date(dateA).getTime();
            const timeB = new Date(dateB).getTime();
            return timeB - timeA; // Descending: newest first
          });

          const deduplicatedData = removeDuplicates(combinedData);
          const csvData = convertToCsv(deduplicatedData);

          await azureStorage.uploadCsvData(azureBlobName, csvData);

          // Cache the result
          cache.set(cacheKey, { processed: true });

          return { success: true, skipped: true };
        }
      }

      // Re-throw other errors (akan ditangkap di catch luar)
      throw apiError;
    }

    // Jika respons kosong - sesuai file asli
    if (!response.data) {
      return { success: true, skipped: true };
    }

    const payload = response.data;

    // Pastikan payload memiliki struktur yang benar
    if (!payload || typeof payload !== 'object') {
      return { success: true, skipped: true };
    }

    // Ambil data dari payload.data (sesuai struktur TICMI API)
    const data = payload.data;

    // Normalisasi JSON menjadi array sesuai dengan file asli
    let normalizedData: any[] = [];
    if (Array.isArray(data) && data.length > 0) {
      normalizedData = normalizeShareholdersData(data);
    } else if (typeof data === 'object' && data !== null) {
      normalizedData = normalizeShareholdersData([data]);
    } else {
      return { success: true, skipped: true };
    }

    // Cek apakah ada data yang berhasil dinormalisasi
    if (normalizedData.length === 0) {
      return { success: true, skipped: true };
    }

    // Gabungkan data baru dengan data existing
    const combinedData = [...normalizedData, ...existingData];

    // Sort descending: newest first (consistent with holding data processing)
    combinedData.sort((a, b) => {
      const dateA = a.DataDate || a.date || a.Date || '';
      const dateB = b.DataDate || b.date || b.Date || '';
      // Use Date comparison for consistency (same as holding data)
      const timeA = new Date(dateA).getTime();
      const timeB = new Date(dateB).getTime();
      return timeB - timeA; // Descending: newest first
    });

    // Hapus duplikat berdasarkan kombinasi unik - sesuai file asli
    const deduplicatedData = removeDuplicates(combinedData);
    const csvData = convertToCsv(deduplicatedData);

    await azureStorage.uploadCsvData(azureBlobName, csvData);

    // Cache the result
    cache.set(cacheKey, { processed: true });

    return { success: true, skipped: false };

  } catch (error: any) {
    console.error(`❌ Shareholders ERROR - ${emiten} - ${error.message}`);
    return { success: false, skipped: false, error: error.message };
  }
}

// Main update function
export async function updateShareholdersData(logId?: string | null, triggeredBy?: string): Promise<void> {
  // Weekend skip temporarily disabled for testing
  // const today = new Date();
  // const dayOfWeek = today.getDay();
  // 
  // if (dayOfWeek === 0 || dayOfWeek === 6) {
  //   return;
  // }

  // Only create log entry if logId is not provided (called from scheduler, not manual trigger)
  let finalLogId = logId;
  if (!finalLogId) {
    const logEntry = await SchedulerLogService.createLog({
      feature_name: 'shareholders',
      trigger_type: triggeredBy && !triggeredBy.startsWith('Phase') && !triggeredBy.startsWith('phase') ? 'manual' : 'scheduled',
      triggered_by: triggeredBy || 'Phase 1b Input Monthly',
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
    console.log('🚀 Shareholders scheduler started - Optimized daily shareholders data update');

    const azureStorage = new OptimizedAzureStorageService();
    await azureStorage.ensureContainerExists();

    // Get list of emitens from CSV input
    // Get list of emitens from CSV input using shared helper
    const emitenList = await getEmitenListFromCsv(azureStorage);

    console.log(`ℹ️ Found ${emitenList.length} emitens to update`);

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
          cache,
          finalLogId
        );
      },
      BATCH_SIZE_PHASE_1_SHAREHOLDERS,
      MAX_CONCURRENT_REQUESTS_PHASE_1_SHAREHOLDERS
    );

    const endTime = Date.now();
    const processingTime = (endTime - startTime) / 1000;

    // Calculate statistics
    const successCount = results.filter(r => r.success && !r.skipped).length;
    const skipCount = results.filter(r => r.success && r.skipped).length;
    const errorCount = results.filter(r => !r.success).length;

    console.log(`✅ Shareholders scheduler completed - Success: ${successCount}, Skipped: ${skipCount}, Failed: ${errorCount}, Total: ${emitenList.length}`);

    if (finalLogId) {
      await SchedulerLogService.markCompleted(finalLogId, {
        total_files_processed: emitenList.length,
        files_created: successCount,
        files_skipped: skipCount,
        files_failed: errorCount
      });
    }

    console.log(`✅ Shareholders data update completed in ${processingTime}s`);
    console.log(`📊 Success: ${successCount}, Skipped: ${skipCount}, Failed: ${errorCount}`);

  } catch (error: any) {
    console.error(`❌ Shareholders scheduler error: ${error.message}`);
    if (finalLogId) {
      await SchedulerLogService.markFailed(finalLogId, error.message, error);
    }
  }
}
