// dataUpdateService.ts
// Base service with parallel processing and connection pooling

import axios, { AxiosInstance } from 'axios';
import { BlobServiceClient, StorageSharedKeyCredential } from '@azure/storage-blob';
// Removed unused imports

// Connection Pool Configuration
const MAX_CONCURRENT_REQUESTS = 250;
const REQUEST_TIMEOUT = 30000;
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 1000;

// Memory Management - Batch sizes per phase
const BATCH_SIZE_PHASE_1_STOCK = 500; // Phase 1 Stock: 500
const BATCH_SIZE_PHASE_1_INDEX = 44; // Phase 1 Index: 44
const BATCH_SIZE_PHASE_1 = 500; // Phase 1: 500 (Shareholders, Holding)
const MAX_CONCURRENT_REQUESTS_PHASE_1 = 250; // Phase 1: 250 concurrent
const BATCH_SIZE_PHASE_2 = 500; // Phase 2: 500
const MAX_CONCURRENT_REQUESTS_PHASE_2 = 250; // Phase 2: 250 concurrent
const MAX_CONCURRENT_REQUESTS_INDEX = 44; // Index Data: 44 concurrent
const BATCH_SIZE_PHASE_3 = 6;   // Phase 3: 6
const MAX_CONCURRENT_REQUESTS_PHASE_3 = 3; // Phase 3: 3 concurrent
const BATCH_SIZE_PHASE_4 = 6;   // Phase 4: 6
const MAX_CONCURRENT_REQUESTS_PHASE_4 = 3; // Phase 4: 3 concurrent
const BATCH_SIZE_PHASE_5 = 6;   // Phase 5: 6
const MAX_CONCURRENT_REQUESTS_PHASE_5 = 3; // Phase 5: 3 concurrent
const BATCH_SIZE_PHASE_6 = 6;   // Phase 6: 6
const MAX_CONCURRENT_REQUESTS_PHASE_6 = 3; // Phase 6: 3 concurrent
const BATCH_SIZE_PHASE_7 = 4;   // Phase 7: 4
const MAX_CONCURRENT_REQUESTS_PHASE_7 = 4; // Phase 7: 4 concurrent
const BATCH_SIZE_PHASE_8 = 6;   // Phase 8: 6
const MAX_CONCURRENT_REQUESTS_PHASE_8 = 3; // Phase 8: 3 concurrent
const MEMORY_CLEANUP_INTERVAL = 100;

// Azure Storage Service with Connection Pooling
class OptimizedAzureStorageService {
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

// Optimized HTTP Client with Connection Pooling
class OptimizedHttpClient {
  private axiosInstance: AxiosInstance;
  private requestQueue: Array<() => Promise<any>> = [];
  private activeRequests = 0;
  
  constructor(baseURL: string, jwtToken: string) {
    this.axiosInstance = axios.create({
      baseURL,
      timeout: REQUEST_TIMEOUT,
      headers: {
        "Accept": "application/json",
        "Authorization": `Bearer ${jwtToken}`,
        "x-Auth-key": jwtToken,
        "Connection": "keep-alive",
      },
      // Connection pooling configuration
      maxRedirects: 3,
      maxContentLength: 50 * 1024 * 1024, // 50MB
      maxBodyLength: 50 * 1024 * 1024, // 50MB
    });
    
    // Add request interceptor for retry logic
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      async (error) => {
        const config = error.config;
        if (!config || !config.retryCount) {
          config.retryCount = 0;
        }
        
        if (config.retryCount < RETRY_ATTEMPTS && this.shouldRetry(error)) {
          config.retryCount++;
          await this.delay(RETRY_DELAY * config.retryCount);
          return this.axiosInstance(config);
        }
        
        return Promise.reject(error);
      }
    );
  }
  
  private shouldRetry(error: any): boolean {
    // Retry on network errors, timeouts, and server errors
    const isTimeout = error.code === 'ETIMEDOUT' || 
                     error.code === 'ECONNABORTED' ||
                     error.message?.includes('timeout');
    const isNetworkError = error.code === 'ECONNRESET' ||
                          error.code === 'ENOTFOUND' ||
                          error.code === 'ECONNREFUSED';
    const isServerError = error.response && error.response.status >= 500;
    
    return isTimeout || isNetworkError || isServerError;
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  async get(url: string, params?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push(async () => {
        try {
          const response = await this.axiosInstance.get(url, { params });
          resolve(response);
        } catch (error) {
          reject(error);
        }
      });
      this.processQueue();
    });
  }
  
  private async processQueue(): Promise<void> {
    if (this.activeRequests >= MAX_CONCURRENT_REQUESTS || this.requestQueue.length === 0) {
      return;
    }
    
    this.activeRequests++;
    const request = this.requestQueue.shift();
    
    if (request) {
      try {
        await request();
      } finally {
        this.activeRequests--;
        this.processQueue();
      }
    }
  }
}

// Parallel Processing Utilities
class ParallelProcessor {
  static async processInBatches<T, R>(
    items: T[],
    processor: (item: T, index: number) => Promise<R>,
    batchSize: number = BATCH_SIZE_PHASE_1,
    maxConcurrency: number = MAX_CONCURRENT_REQUESTS
  ): Promise<R[]> {
    const results: R[] = [];
    
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      
      // Process batch with controlled concurrency
      const batchPromises = batch.map((item, batchIndex) => 
        processor(item, i + batchIndex)
      );
      
      // Limit concurrent requests
      const batchResults = await this.limitConcurrency(batchPromises, maxConcurrency);
      results.push(...batchResults);
      
      // Memory cleanup every few batches
      if (i % MEMORY_CLEANUP_INTERVAL === 0) {
        await this.cleanupMemory();
      }
    }
    
    return results;
  }
  
  static async limitConcurrency<T>(
    promises: Promise<T>[],
    maxConcurrency: number
  ): Promise<T[]> {
    const results: T[] = [];
    
    // Process promises in batches to control concurrency
    for (let i = 0; i < promises.length; i += maxConcurrency) {
      const batch = promises.slice(i, i + maxConcurrency);
      
      // Use Promise.allSettled to ensure all promises are tracked
      const batchResults = await Promise.allSettled(batch);
      
      // Extract successful results and handle rejected promises
      batchResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          // Ensure rejected promises are handled - create a default error result
          // This prevents unhandled promise rejections
          const errorResult = {
            success: false,
            skipped: false,
            error: result.reason?.message || 'Unknown error'
          } as T;
          results.push(errorResult);
        }
      });
    }
    
    return results;
  }
  
  private static async cleanupMemory(): Promise<void> {
    if (global.gc) {
      global.gc();
    }
  }
}

// Caching Service
class CacheService {
  private cache = new Map<string, { data: any; timestamp: number; ttl: number }>();
  private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
  
  set(key: string, data: any, ttl: number = this.DEFAULT_TTL): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }
  
  get(key: string): any | null {
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (Date.now() - item.timestamp > item.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return item.data;
  }
  
  clear(): void {
    this.cache.clear();
  }
  
  cleanup(): void {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (now - item.timestamp > item.ttl) {
        this.cache.delete(key);
      }
    }
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

export {
  OptimizedAzureStorageService,
  OptimizedHttpClient,
  ParallelProcessor,
  CacheService,
  getTodayDate,
  removeDuplicates,
  convertToCsv,
  parseCsvString,
  BATCH_SIZE_PHASE_1_STOCK,
  BATCH_SIZE_PHASE_1_INDEX,
  BATCH_SIZE_PHASE_1,
  MAX_CONCURRENT_REQUESTS_PHASE_1,
  BATCH_SIZE_PHASE_2,
  MAX_CONCURRENT_REQUESTS_PHASE_2,
  BATCH_SIZE_PHASE_3,
  MAX_CONCURRENT_REQUESTS_PHASE_3,
  BATCH_SIZE_PHASE_4,
  MAX_CONCURRENT_REQUESTS_PHASE_4,
  BATCH_SIZE_PHASE_5,
  MAX_CONCURRENT_REQUESTS_PHASE_5,
  BATCH_SIZE_PHASE_6,
  MAX_CONCURRENT_REQUESTS_PHASE_6,
  BATCH_SIZE_PHASE_7,
  MAX_CONCURRENT_REQUESTS_PHASE_7,
  BATCH_SIZE_PHASE_8,
  MAX_CONCURRENT_REQUESTS_PHASE_8,
  MAX_CONCURRENT_REQUESTS_INDEX,
  MAX_CONCURRENT_REQUESTS
};
