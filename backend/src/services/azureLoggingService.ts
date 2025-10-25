// azureLoggingService.ts
// Service for logging scheduler activities to Azure Blob Storage

import { BlobServiceClient, StorageSharedKeyCredential } from '@azure/storage-blob';

// Azure Storage Service for Logging
class AzureLoggingService {
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
  
  // Upload log content to Azure
  async uploadLog(blobName: string, logContent: string): Promise<void> {
    try {
      const blobClient = this.containerClient.getBlockBlobClient(blobName);
      await blobClient.upload(logContent, Buffer.byteLength(logContent), {
        blobHTTPHeaders: { blobContentType: 'text/plain' }
      });
      console.log(`📝 Log uploaded to Azure: ${blobName}`);
    } catch (error) {
      console.error(`❌ Failed to upload log to Azure: ${blobName}`, error);
    }
  }
  
  // Append log content to existing file
  async appendLog(blobName: string, logContent: string): Promise<void> {
    try {
      const blobClient = this.containerClient.getBlockBlobClient(blobName);
      
      // Check if file exists
      const exists = await blobClient.exists();
      
      if (exists) {
        // Download existing content
        const downloadResponse = await blobClient.download();
        const existingContent = await this.streamToString(downloadResponse.readableStreamBody!);
        
        // Append new content
        const newContent = existingContent + '\n' + logContent;
        await blobClient.upload(newContent, Buffer.byteLength(newContent), {
          blobHTTPHeaders: { blobContentType: 'text/plain' }
        });
      } else {
        // Create new file
        await blobClient.upload(logContent, Buffer.byteLength(logContent), {
          blobHTTPHeaders: { blobContentType: 'text/plain' }
        });
      }
      
      console.log(`📝 Log appended to Azure: ${blobName}`);
    } catch (error) {
      console.error(`❌ Failed to append log to Azure: ${blobName}`, error);
    }
  }
  
  private async streamToString(readableStream: NodeJS.ReadableStream): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      readableStream.on('data', (data: Buffer) => chunks.push(data));
      readableStream.on('end', () => resolve(Buffer.concat(chunks).toString()));
      readableStream.on('error', reject);
    });
  }
}

// Singleton instance
const azureLogging = new AzureLoggingService();

// Helper function to format timestamp (WIB - Asia/Jakarta)
function getTimestamp(): string {
  const now = new Date();
  const jakartaTime = new Date(now.getTime() + (7 * 60 * 60 * 1000)); // UTC + 7
  return jakartaTime.toISOString().replace('T', ' ').replace('Z', '');
}

// Helper function to get log filename with date
function getLogFilename(schedulerType: string): string {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
  return `scheduler_log/${schedulerType}_scheduler/log_${dateStr}.txt`;
}

// Main logging functions
export class AzureLogger {
  
  // Log scheduler start
  static async logSchedulerStart(schedulerType: string, details: string = ''): Promise<void> {
    const timestamp = getTimestamp();
    const logContent = `[${timestamp}] 🚀 ${schedulerType.toUpperCase()} SCHEDULER STARTED${details ? ' - ' + details : ''}`;
    
    console.log(logContent);
    await azureLogging.appendLog(getLogFilename(schedulerType), logContent);
  }
  
  // Log scheduler end
  static async logSchedulerEnd(schedulerType: string, summary: {
    success: number;
    skipped: number;
    failed: number;
    total: number;
  }): Promise<void> {
    const timestamp = getTimestamp();
    const logContent = `[${timestamp}] ✅ ${schedulerType.toUpperCase()} SCHEDULER COMPLETED - Success: ${summary.success}, Skipped: ${summary.skipped}, Failed: ${summary.failed}, Total: ${summary.total}`;
    
    console.log(logContent);
    await azureLogging.appendLog(getLogFilename(schedulerType), logContent);
  }
  
  // Log scheduler error
  static async logSchedulerError(schedulerType: string, error: string): Promise<void> {
    const timestamp = getTimestamp();
    const logContent = `[${timestamp}] ❌ ${schedulerType.toUpperCase()} SCHEDULER ERROR - ${error}`;
    
    console.error(logContent);
    await azureLogging.appendLog(getLogFilename(schedulerType), logContent);
  }
  
  // Log progress update
  static async logProgress(schedulerType: string, current: number, total: number, item: string = ''): Promise<void> {
    const timestamp = getTimestamp();
    const percentage = Math.round((current / total) * 100);
    const logContent = `[${timestamp}] 📊 ${schedulerType.toUpperCase()} PROGRESS - ${current}/${total} (${percentage}%)${item ? ' - ' + item : ''}`;
    
    console.log(logContent);
    await azureLogging.appendLog(getLogFilename(schedulerType), logContent);
  }
  
  // Log individual item processing
  static async logItemProcess(schedulerType: string, action: 'SUCCESS' | 'SKIP' | 'ERROR', item: string, details: string = ''): Promise<void> {
    const timestamp = getTimestamp();
    const emoji = action === 'SUCCESS' ? '✅' : action === 'SKIP' ? '⏭️' : '❌';
    const logContent = `[${timestamp}] ${emoji} ${schedulerType.toUpperCase()} ${action} - ${item}${details ? ' - ' + details : ''}`;
    
    console.log(logContent);
    await azureLogging.appendLog(getLogFilename(schedulerType), logContent);
  }
  
  // Log weekend skip
  static async logWeekendSkip(schedulerType: string): Promise<void> {
    const timestamp = getTimestamp();
    const logContent = `[${timestamp}] ⏭️ ${schedulerType.toUpperCase()} SCHEDULER SKIPPED - Weekend (Saturday or Sunday)`;
    
    console.log(logContent);
    await azureLogging.appendLog(getLogFilename(schedulerType), logContent);
  }
  
  // Log general info
  static async logInfo(schedulerType: string, message: string): Promise<void> {
    const timestamp = getTimestamp();
    const logContent = `[${timestamp}] ℹ️ ${schedulerType.toUpperCase()} INFO - ${message}`;
    
    console.log(logContent);
    await azureLogging.appendLog(getLogFilename(schedulerType), logContent);
  }
  
  // Log warning
  static async logWarning(schedulerType: string, message: string): Promise<void> {
    const timestamp = getTimestamp();
    const logContent = `[${timestamp}] ⚠️ ${schedulerType.toUpperCase()} WARNING - ${message}`;
    
    console.warn(logContent);
    await azureLogging.appendLog(getLogFilename(schedulerType), logContent);
  }
}

// Initialize Azure logging
export async function initializeAzureLogging(): Promise<void> {
  try {
    await azureLogging.ensureContainerExists();
    console.log('✅ Azure Logging Service initialized');
  } catch (error) {
    console.error('❌ Failed to initialize Azure Logging Service:', error);
  }
}

