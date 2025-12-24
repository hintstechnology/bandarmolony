// emiten_list.ts
// Service untuk update list emiten dari TICMI API ke Azure Storage

import axios from 'axios';
import { uploadText } from '../../utils/azureBlob';
import { SchedulerLogService } from '../../services/schedulerLogService';

const TICMI_EMITEN_LIST_URL = 'https://storage.googleapis.com/ticmidata-public/secCode/listSecCode.json';
const AZURE_BLOB_PATH = 'csv_input/emiten_list.csv';
const REQUEST_TIMEOUT = 30000; // 30 seconds

/**
 * Update emiten list dari TICMI API ke Azure Storage
 * Format output: CSV tanpa header, hanya values (satu emiten per baris)
 * 
 * @param logId Optional log ID untuk tracking (jika dipanggil dari scheduler)
 * @param triggeredBy Optional trigger source untuk logging
 */
export async function updateEmitenList(logId?: string | null, triggeredBy?: string): Promise<void> {
  // Only create log entry if logId is not provided (called from scheduler, not manual trigger)
  let finalLogId = logId;
  if (!finalLogId) {
    const logEntry = await SchedulerLogService.createLog({
      feature_name: 'emiten_list',
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
    console.log('🚀 Emiten List scheduler started - Fetching emiten list from TICMI API');
    
    if (finalLogId) {
      await SchedulerLogService.updateLog(finalLogId, {
        progress_percentage: 0,
        current_processing: 'Fetching emiten list from TICMI API...'
      });
    }

    // Fetch JSON dari TICMI API
    console.log(`📡 Fetching emiten list from: ${TICMI_EMITEN_LIST_URL}`);
    const response = await axios.get(TICMI_EMITEN_LIST_URL, {
      timeout: REQUEST_TIMEOUT,
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.data || !Array.isArray(response.data)) {
      throw new Error('Invalid response format: expected array');
    }

    const data: Array<{ secCode: string }> = response.data;
    console.log(`✅ Fetched ${data.length} emitens from TICMI API`);

    if (finalLogId) {
      await SchedulerLogService.updateLog(finalLogId, {
        progress_percentage: 50,
        current_processing: `Processing ${data.length} emitens...`
      });
    }

    // Extract secCode values dan convert ke CSV format (tanpa header, hanya values)
    // Format: satu emiten per baris
    const csvLines = data
      .map(item => {
        const secCode = item.secCode || '';
        return secCode.trim();
      })
      .filter(secCode => secCode.length > 0); // Filter empty values

    // Join dengan newline untuk membuat CSV
    const csvContent = csvLines.join('\n');

    console.log(`📝 Generated CSV with ${csvLines.length} emitens (no headers, values only)`);

    if (finalLogId) {
      await SchedulerLogService.updateLog(finalLogId, {
        progress_percentage: 75,
        current_processing: `Uploading to Azure Storage...`
      });
    }

    // Upload ke Azure Storage
    console.log(`📤 Uploading emiten_list.csv to Azure Storage: ${AZURE_BLOB_PATH}`);
    await uploadText(AZURE_BLOB_PATH, csvContent, 'text/csv');
    
    console.log(`✅ Successfully uploaded emiten_list.csv to Azure Storage`);
    console.log(`📊 Total emitens: ${csvLines.length}`);

    if (finalLogId) {
      await SchedulerLogService.updateLog(finalLogId, {
        progress_percentage: 100,
        current_processing: `Completed: ${csvLines.length} emitens uploaded`
      });

      await SchedulerLogService.markCompleted(finalLogId, {
        total_files_processed: 1,
        files_created: 1,
        files_skipped: 0,
        files_failed: 0
      });
    }

    console.log('✅ Emiten List update completed successfully');

  } catch (error: any) {
    const errorMessage = error?.message || 'Unknown error';
    console.error(`❌ Emiten List scheduler error: ${errorMessage}`);
    
    if (finalLogId) {
      await SchedulerLogService.updateLog(finalLogId, {
        progress_percentage: 0,
        current_processing: `Error: ${errorMessage}`
      });
      await SchedulerLogService.markFailed(finalLogId, errorMessage, error);
    }
    
    throw error;
  }
}

