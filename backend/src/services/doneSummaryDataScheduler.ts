// doneSummaryDataUpdateService.ts
// Service for daily done summary data updates from Google Cloud Storage to Azure

import { Storage } from '@google-cloud/storage';
import { BlobServiceClient, StorageSharedKeyCredential } from '@azure/storage-blob';
import { SchedulerLogService } from './schedulerLogService';
import { AzureLogger } from './azureLoggingService';

// Timezone helper function
function getJakartaTime(): string {
  const now = new Date();
  const jakartaTime = new Date(now.getTime() + (7 * 60 * 60 * 1000)); // UTC + 7
  return jakartaTime.toISOString();
}

// Google Cloud Storage Service
class GoogleCloudStorageService {
  private storage: Storage;
  private bucket: any;
  
  constructor(credentials: any) {
    try {
      this.storage = new Storage({
        credentials: credentials,
        projectId: 'ticmidatadev'
      });
      this.bucket = this.storage.bucket('ticmidata-ferry');
      console.log('✅ Google Cloud Storage client initialized');
    } catch (error) {
      console.error('❌ Error initializing GCS client:', error);
      throw new Error(`Failed to initialize Google Cloud Storage: ${error}`);
    }
  }
  
  async listFiles(prefix: string): Promise<string[]> {
    try {
      const [files] = await this.bucket.getFiles({ prefix });
      return files.map((file: any) => file.name);
    } catch (error) {
      console.error('Error listing GCS files:', error);
      return [];
    }
  }
  
  async downloadFile(fileName: string): Promise<Buffer> {
    try {
      const file = this.bucket.file(fileName);
      const [data] = await file.download();
      return data;
    } catch (error) {
      throw new Error(`Failed to download file ${fileName}: ${error}`);
    }
  }
  
  async downloadFileAsString(fileName: string): Promise<string> {
    try {
      const file = this.bucket.file(fileName);
      const [data] = await file.download();
      return data.toString();
    } catch (error) {
      throw new Error(`Failed to download file ${fileName}: ${error}`);
    }
  }
}

// Azure Storage Service
class AzureStorageService {
  private containerClient: any;
  
  constructor() {
    const connectionString = process.env['AZURE_STORAGE_CONNECTION_STRING'];
    const containerName = process.env['AZURE_STORAGE_CONTAINER_NAME'] || 'stock-trading-data';
    
    if (!connectionString) {
      throw new Error('AZURE_STORAGE_CONNECTION_STRING is required');
    }
    
    const connectionStringParts = connectionString.split(';');
    const accountNamePart = connectionStringParts.find(part => part.startsWith('AccountName='));
    const accountKeyPart = connectionStringParts.find(part => part.startsWith('AccountKey='));
    const endpointSuffixPart = connectionStringParts.find(part => part.startsWith('EndpointSuffix='));
    
    if (!accountNamePart || !accountKeyPart || !endpointSuffixPart) {
      throw new Error('Invalid connection string format - missing required parts');
    }
    
    const accountName = accountNamePart.split('=')[1];
    const accountKey = accountKeyPart.split('=')[1];
    const endpointSuffix = endpointSuffixPart.split('=')[1];
    
    if (!accountName || !accountKey || !endpointSuffix) {
      throw new Error('Invalid connection string format - empty values');
    }
    
    const accountUrl = `https://${accountName}.blob.${endpointSuffix}`;
    const credential = new StorageSharedKeyCredential(accountName, accountKey);
    
    this.containerClient = new BlobServiceClient(accountUrl, credential)
      .getContainerClient(containerName);
  }
  
  async ensureContainerExists(): Promise<void> {
    await this.containerClient.createIfNotExists();
  }
  
  async uploadFile(blobName: string, fileData: Buffer, contentType: string = 'text/csv'): Promise<void> {
    const blobClient = this.containerClient.getBlockBlobClient(blobName);
    await blobClient.upload(fileData, fileData.length, {
      blobHTTPHeaders: { blobContentType: contentType }
    });
  }
  
  async uploadString(blobName: string, data: string, contentType: string = 'text/csv'): Promise<void> {
    const blobClient = this.containerClient.getBlockBlobClient(blobName);
    await blobClient.upload(data, Buffer.byteLength(data), {
      blobHTTPHeaders: { blobContentType: contentType }
    });
  }
  
  async blobExists(blobName: string): Promise<boolean> {
    const blobClient = this.containerClient.getBlockBlobClient(blobName);
    return await blobClient.exists();
  }
}

// Helper functions
async function streamToBuffer(readableStream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    readableStream.on('data', (data: Buffer) => chunks.push(data));
    readableStream.on('end', () => resolve(Buffer.concat(chunks)));
    readableStream.on('error', reject);
  });
}

// Main update function
export async function updateDoneSummaryData(): Promise<void> {
  const SCHEDULER_TYPE = 'done-summary';
  
  // Weekend skip temporarily disabled for testing
  // const today = new Date();
  // const dayOfWeek = today.getDay();
  // 
  // if (dayOfWeek === 0 || dayOfWeek === 6) {
  //   await AzureLogger.logWeekendSkip(SCHEDULER_TYPE);
  //   return;
  // }
  
  const logEntry = await SchedulerLogService.createLog({
    feature_name: 'done-summary',
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
    await AzureLogger.logSchedulerStart(SCHEDULER_TYPE, 'Daily done summary data update');
    
    const azureStorage = new AzureStorageService();
    await azureStorage.ensureContainerExists();
    await AzureLogger.logInfo(SCHEDULER_TYPE, 'Azure Storage initialized');

    // Download GCS credentials from Azure
    const credentialsBlobName = 'csv_input/cred-bucket-ferry.json';
    const credentialsBlobClient = azureStorage['containerClient'].getBlockBlobClient(credentialsBlobName);
    
    let gcsCredentials;
    try {
      const credentialsDownloadResponse = await credentialsBlobClient.download();
      const credentialsBuffer = await streamToBuffer(credentialsDownloadResponse.readableStreamBody!);
      const credentialsJson = credentialsBuffer.toString();
      gcsCredentials = JSON.parse(credentialsJson);
    } catch (error: any) {
      if (error.statusCode === 404) {
        await AzureLogger.logSchedulerError(SCHEDULER_TYPE, `GCS credentials not found at ${credentialsBlobName}. Please upload cred-bucket-ferry.json to csv_input/ directory in Azure.`);
        return;
      }
      throw error;
    }
    
    const gcsStorage = new GoogleCloudStorageService(gcsCredentials);
    await AzureLogger.logInfo(SCHEDULER_TYPE, 'GCS Storage initialized with credentials from Azure');

    // Generate date range for the past week (weekdays only)
    const today = new Date();
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    
    const requiredDates: string[] = [];
    for (let d = new Date(weekAgo); d <= today; d.setDate(d.getDate() + 1)) {
      const isoString = d.toISOString();
      if (isoString) {
        const datePart = isoString.split('T')[0];
        if (datePart) {
          const dateStr = datePart.replace(/-/g, '');
          requiredDates.push(dateStr);
        }
      }
    }

    await AzureLogger.logInfo(SCHEDULER_TYPE, `Checking done summary for ${requiredDates.length} dates: ${requiredDates.join(', ')}`);

    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    for (let i = 0; i < requiredDates.length; i++) {
      const dateStr = requiredDates[i];
      if (!dateStr) continue;
      
      try {
        if ((i + 1) % 5 === 0 || i === 0) {
          await AzureLogger.logProgress(SCHEDULER_TYPE, i + 1, requiredDates.length, `Processing date ${dateStr}`);
          if (logId) {
            await SchedulerLogService.updateLog(logId, {
              progress_percentage: Math.round(((i + 1) / requiredDates.length) * 100),
              current_processing: `Processing done summary ${i + 1}/${requiredDates.length}`
            });
          }
        }
        
        // Check if done summary for this date already exists in Azure
        const azureBlobName = `done-summary/${dateStr}/DT${dateStr}.csv`;
        
        if (await azureStorage.blobExists(azureBlobName)) {
          await AzureLogger.logItemProcess(SCHEDULER_TYPE, 'SKIP', dateStr, 'Done summary already exists in Azure');
          skipCount++;
          continue;
        }
        
        // Try to download from Google Cloud Storage
        const gcsFileName = `${dateStr}/DT${dateStr}.csv`;
        
        await AzureLogger.logInfo(SCHEDULER_TYPE, `Attempting to download: ${gcsFileName}`);
        
        try {
          const fileData = await gcsStorage.downloadFileAsString(gcsFileName);
          
          // Upload to Azure Storage
          await azureStorage.uploadString(azureBlobName, fileData, 'text/csv');
          
          await AzureLogger.logItemProcess(SCHEDULER_TYPE, 'SUCCESS', dateStr, 'Done summary transferred successfully');
          successCount++;
        } catch (gcsError: any) {
          if (gcsError.code === 404 || gcsError.message.includes('No such object')) {
            await AzureLogger.logItemProcess(SCHEDULER_TYPE, 'SKIP', dateStr, 'Done summary not found in GCS');
            skipCount++;
          } else {
            await AzureLogger.logItemProcess(SCHEDULER_TYPE, 'ERROR', dateStr, `GCS Error: ${gcsError.message}`);
            errorCount++;
          }
        }

      } catch (error: any) {
        errorCount++;
        await AzureLogger.logItemProcess(SCHEDULER_TYPE, 'ERROR', dateStr, `Unexpected error: ${error.message}`);
      }
    }

    await AzureLogger.logSchedulerEnd(SCHEDULER_TYPE, {
      success: successCount,
      skipped: skipCount,
      failed: errorCount,
      total: requiredDates.length
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
