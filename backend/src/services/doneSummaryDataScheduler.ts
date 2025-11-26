// doneSummaryDataUpdateService.ts
// Service for daily done summary data updates from Google Cloud Storage to Azure

import { Storage } from '@google-cloud/storage';
import { BlobServiceClient, StorageSharedKeyCredential } from '@azure/storage-blob';
import { SchedulerLogService } from './schedulerLogService';


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
export async function updateDoneSummaryData(logId?: string | null, triggeredBy?: string): Promise<void> {
  // Skip if weekend
  const today = new Date();
  const dayOfWeek = today.getDay();
  
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    console.log('📅 Weekend detected - skipping Done Summary Data sync (no market data available)');
    return;
  }
  
  // Only create log entry if logId is not provided (called from scheduler, not manual trigger)
  let finalLogId = logId;
  if (!finalLogId) {
    const logEntry = await SchedulerLogService.createLog({
      feature_name: 'done-summary',
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
    console.log('🚀 Done Summary scheduler started - Daily done summary data update');
    
    const azureStorage = new AzureStorageService();
    await azureStorage.ensureContainerExists();
    console.log('ℹ️ Azure Storage initialized');

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
        const errorMsg = `GCS credentials not found at ${credentialsBlobName}. Please upload cred-bucket-ferry.json to csv_input/ directory in Azure.`;
        console.error(`❌ Done Summary scheduler error: ${errorMsg}`);
        if (finalLogId) {
          await SchedulerLogService.markFailed(finalLogId, errorMsg, error);
        }
        return;
      }
      throw error;
    }
    
    const gcsStorage = new GoogleCloudStorageService(gcsCredentials);
    console.log('ℹ️ GCS Storage initialized with credentials from Azure');

    // List all files in GCS and check which ones don't exist in Azure
    console.log('ℹ️ Listing all files in GCS...');
    const gcsAllFiles = await gcsStorage.listFiles('');
    
    // Filter for DT CSV files (pattern: YYYYMMDD/DTYYMMDD.csv)
    const gcsCsvFiles = gcsAllFiles.filter((fileName: string) => {
      return /^\d{8}\/DT\d{6}\.csv$/.test(fileName);
    });
    
    // Sort by date descending (newest first) - process from newest to oldest
    const sortedGcsFiles = gcsCsvFiles.sort((a, b) => {
      const matchA = a.match(/^(\d{8})\/DT\d{6}\.csv$/);
      const matchB = b.match(/^(\d{8})\/DT\d{6}\.csv$/);
      const dateA = matchA ? matchA[1] || '' : '';
      const dateB = matchB ? matchB[1] || '' : '';
      return dateB.localeCompare(dateA); // Descending order (newest first)
    });
    
    console.log(`ℹ️ Found ${sortedGcsFiles.length} DT CSV files in GCS (sorted newest first)`);
    
    // Check which files already exist in Azure and filter out existing ones
    const filesToProcess: string[] = [];
    let existingCount = 0;
    
    for (const gcsFileName of sortedGcsFiles) {
      // Derive date and target Azure path
      const match = gcsFileName.match(/^(\d{8})\/DT(\d{6})\.csv$/);
      const dateStr = match ? match[1] : '';
      const dtStr = match ? match[2] : '';
      const azureBlobName = match
        ? `done-summary/${dateStr}/DT${dtStr}.csv`
        : `done-summary/${gcsFileName}`;
      
      // Check if already exists in Azure
      if (await azureStorage.blobExists(azureBlobName)) {
        existingCount++;
        continue;
      }
      
      filesToProcess.push(gcsFileName);
    }
    
    console.log(`ℹ️ Found ${filesToProcess.length} files to process (${existingCount} already exist in Azure)`);
    
    if (filesToProcess.length === 0) {
      console.log('ℹ️ All files already exist in Azure - nothing to process');
      console.log(`✅ Done Summary scheduler completed - Success: 0, Skipped: ${existingCount}, Failed: 0, Total: ${sortedGcsFiles.length}`);
      
      if (finalLogId) {
        await SchedulerLogService.markCompleted(finalLogId, {
          total_files_processed: existingCount,
          files_created: 0,
          files_skipped: existingCount,
          files_failed: 0
        });
      }
      return;
    }

    let successCount = 0;
    let skipCount = existingCount; // Already counted existing files
    let errorCount = 0;

    for (let i = 0; i < filesToProcess.length; i++) {
      const gcsFileName = filesToProcess[i];
      if (!gcsFileName) continue;
      
      // Derive date and target Azure path
      // Expected pattern: 20251028/DT251028.csv (YYYYMMDD/DTYYMMDD.csv)
      const match = gcsFileName.match(/^(\d{8})\/DT(\d{6})\.csv$/);
      const dateStr = match ? match[1] : '';
      const dtStr = match ? match[2] : '';
      const azureBlobName = match
        ? `done-summary/${dateStr}/DT${dtStr}.csv`
        : `done-summary/${gcsFileName}`; // fallback: mirror structure under done-summary/
      
      try {
        if ((i + 1) % 5 === 0 || i === 0) {
          const percentage = Math.round(((i + 1) / filesToProcess.length) * 100);
          console.log(`📊 Done Summary progress - ${i + 1}/${filesToProcess.length} (${percentage}%) - Syncing ${gcsFileName}`);
          if (finalLogId) {
            await SchedulerLogService.updateLog(finalLogId, {
              progress_percentage: percentage,
              current_processing: `Syncing done summary ${i + 1}/${filesToProcess.length}`
            });
          }
        }
        
        // Download from Google Cloud Storage by listed file name
        console.log(`ℹ️ Attempting to download from GCS: ${gcsFileName}`);
        
        try {
          const fileData = await gcsStorage.downloadFileAsString(gcsFileName);
          
          // Upload to Azure Storage
          await azureStorage.uploadString(azureBlobName, fileData, 'text/csv');
          
          console.log(`✅ Done Summary SUCCESS - ${dateStr || gcsFileName} - Done summary transferred successfully`);
          successCount++;
        } catch (gcsError: any) {
          if (gcsError.code === 404 || (gcsError.message && gcsError.message.includes('No such object'))) {
            console.log(`⏭️ Done Summary SKIP - ${dateStr || gcsFileName} - Done summary not found in GCS`);
            skipCount++;
          } else {
            console.error(`❌ Done Summary ERROR - ${dateStr || gcsFileName} - GCS Error: ${gcsError.message}`);
            errorCount++;
          }
        }

      } catch (error: any) {
        errorCount++;
        console.error(`❌ Done Summary ERROR - ${dateStr || gcsFileName} - Unexpected error: ${error.message}`);
      }
    }

    console.log(`✅ Done Summary scheduler completed - Success: ${successCount}, Skipped: ${skipCount}, Failed: ${errorCount}, Total: ${sortedGcsFiles.length}`);

    if (finalLogId) {
      await SchedulerLogService.markCompleted(finalLogId, {
        total_files_processed: sortedGcsFiles.length,
        files_created: successCount,
        files_skipped: skipCount,
        files_failed: errorCount
      });
    }

  } catch (error: any) {
    console.error(`❌ Done Summary scheduler error: ${error.message}`);
    if (finalLogId) {
      await SchedulerLogService.markFailed(finalLogId, error.message, error);
    }
  }
}
