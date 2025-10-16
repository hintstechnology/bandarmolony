// indexDataUpdateService.ts
// Service for daily index data updates from TICMI API

import axios, { AxiosInstance } from 'axios';
import { BlobServiceClient, StorageSharedKeyCredential } from '@azure/storage-blob';
import { SchedulerLogService } from './schedulerLogService';
import { AzureLogger } from './azureLoggingService';

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
  
  async uploadCsvData(blobName: string, csvData: string): Promise<void> {
    const blobClient = this.containerClient.getBlockBlobClient(blobName);
    await blobClient.upload(csvData, Buffer.byteLength(csvData), {
      blobHTTPHeaders: { blobContentType: 'text/csv' }
    });
  }
  
  async downloadCsvData(blobName: string): Promise<string> {
    const blobClient = this.containerClient.getBlockBlobClient(blobName);
    const downloadResponse = await blobClient.download();
    return await this.streamToString(downloadResponse.readableStreamBody!);
  }
  
  async blobExists(blobName: string): Promise<boolean> {
    const blobClient = this.containerClient.getBlockBlobClient(blobName);
    return await blobClient.exists();
  }
  
  async listBlobs(prefix: string): Promise<string[]> {
    const blobs: string[] = [];
    for await (const blob of this.containerClient.listBlobsFlat({ prefix })) {
      blobs.push(blob.name);
    }
    return blobs;
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

// Helper functions
function getTodayDate(): string {
  const today = new Date();
  const datePart = today.toISOString().split('T')[0];
  if (!datePart) {
    throw new Error('Failed to get today date');
  }
  return datePart;
}

function removeDuplicates(data: any[]): any[] {
  if (data.length === 0) return data;
  
  const firstRow = data[0];
  let dateColumn: string | null = null;
  
  if ('Date' in firstRow) dateColumn = 'Date';
  else if ('date' in firstRow) dateColumn = 'date';
  else if ('timestamp' in firstRow) dateColumn = 'timestamp';
  
  if (dateColumn) {
    const seen = new Set();
    return data.filter(row => {
      const key = row[dateColumn!];
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } else {
    const seen = new Set();
    return data.filter(row => {
      const key = JSON.stringify(row);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}

function convertToCsv(data: any[]): string {
  if (data.length === 0) return '';
  
  const headers = Object.keys(data[0]);
  const csvRows = [headers.join(',')];
  
  for (const row of data) {
    const values = headers.map(header => {
      const value = row[header];
      return typeof value === 'string' && value.includes(',') ? `"${value}"` : value;
    });
    csvRows.push(values.join(','));
  }
  
  return csvRows.join('\n');
}

async function parseCsvString(csvString: string): Promise<any[]> {
  const data: any[] = [];
  const lines = csvString.split('\n');
  
  if (lines.length < 2 || !lines[0]) return [];
  
  const headers = lines[0].split(',');
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line && line.trim()) {
      const values = line.split(',');
      const row: any = {};
      
      headers.forEach((header, index) => {
        const value = values[index];
        row[header.trim()] = value ? value.trim() : '';
      });
      
      data.push(row);
    }
  }
  
  return data;
}

// Main update function
export async function updateIndexData(): Promise<void> {
  const SCHEDULER_TYPE = 'index';
  
  // Check if today is weekend
  const today = new Date();
  const dayOfWeek = today.getDay();
  
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    await AzureLogger.logWeekendSkip(SCHEDULER_TYPE);
    return;
  }
  
  const logEntry = await SchedulerLogService.createLog({
    feature_name: 'rrg', // Using existing feature type
    trigger_type: 'scheduled',
    triggered_by: 'system',
    status: 'running',
    force_override: false,
    environment: process.env['NODE_ENV'] || 'development'
  });

  if (!logEntry) {
    console.error('❌ Failed to create scheduler log entry');
    return;
  }

  const logId = logEntry.id!;
  
  try {
    await AzureLogger.logSchedulerStart(SCHEDULER_TYPE, 'Daily index data update');
    
    const azureStorage = new AzureStorageService();
    await azureStorage.ensureContainerExists();
    await AzureLogger.logInfo(SCHEDULER_TYPE, 'Azure Storage initialized');

    // Get list of indexes from Azure (existing indexes)
    const indexBlobs = await azureStorage.listBlobs('index/');
    const indexes = indexBlobs.map(blobName => 
      blobName.replace('index/', '').replace('.csv', '')
    );

    await AzureLogger.logInfo(SCHEDULER_TYPE, `Found ${indexes.length} indexes to update`);

    const jwtToken = process.env['TICMI_JWT_TOKEN'] || '';
    const axiosInstance: AxiosInstance = axios.create({
      timeout: 30000,
      headers: {
        "Accept": "application/json",
        "Authorization": `Bearer ${jwtToken}`,
        "x-Auth-key": jwtToken,
        "Connection": "keep-alive",
      }
    });

    const todayDate = getTodayDate();
    const baseUrl = `${process.env['TICMI_API_BASE_URL'] || ''}${process.env['TICMI_INDEX_ENDPOINT'] || ''}`;

    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    for (let i = 0; i < indexes.length; i++) {
      const indexCode = indexes[i];
      if (!indexCode) continue;
      
      try {
        if ((i + 1) % 50 === 0 || i === 0) {
          await AzureLogger.logProgress(SCHEDULER_TYPE, i + 1, indexes.length, `Processing ${indexCode}`);
          if (logId) {
            await SchedulerLogService.updateLog(logId, {
              progress_percentage: Math.round(((i + 1) / indexes.length) * 100),
              current_processing: `Processing index ${i + 1}/${indexes.length}`
            });
          }
        }
        
        const azureBlobName = `index/${indexCode}.csv`;
        
        let existingData: any[] = [];
        if (await azureStorage.blobExists(azureBlobName)) {
          const existingCsvData = await azureStorage.downloadCsvData(azureBlobName);
          existingData = await parseCsvString(existingCsvData);
        }
        
        const todayDataExists = existingData.some(row => 
          row.date === todayDate || row.tanggal === todayDate || row.Date === todayDate
        );
        
        if (todayDataExists) {
          await AzureLogger.logItemProcess(SCHEDULER_TYPE, 'SKIP', indexCode, 'Data already exists for today');
          skipCount++;
          continue;
        }
        
        const params = {
          indexCode: indexCode,
          startDate: todayDate,
          endDate: todayDate,
          granularity: "daily",
        };

        const response = await axiosInstance.get(baseUrl, { params });
        
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
          successCount++;
          continue;
        }

        const payload = response.data;
        const data = payload.data || payload;

        let normalizedData: any[] = [];
        if (Array.isArray(data)) {
          normalizedData = data;
        } else if (typeof data === 'object' && data !== null) {
          normalizedData = [data];
        } else {
          skipCount++;
          continue;
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
        await AzureLogger.logItemProcess(SCHEDULER_TYPE, 'SUCCESS', indexCode, 'Data updated successfully');
        successCount++;

      } catch (error: any) {
        errorCount++;
        await AzureLogger.logItemProcess(SCHEDULER_TYPE, 'ERROR', indexCode, error.message);
      }
    }

    await AzureLogger.logSchedulerEnd(SCHEDULER_TYPE, {
      success: successCount,
      skipped: skipCount,
      failed: errorCount,
      total: indexes.length
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

