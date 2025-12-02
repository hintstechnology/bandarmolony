import { BlobServiceClient } from '@azure/storage-blob';
import config from '../config';

export interface AzureListOptions {
  prefix?: string;
  maxResults?: number;
}

function getContainer(): any {
  const connectionString = config.AZURE_STORAGE_CONNECTION_STRING;
  const containerName = config.AZURE_STORAGE_CONTAINER_NAME || 'stock-trading-data';
  if (!connectionString) {
    throw new Error('Azure Storage configuration is missing');
  }
  
  const service = BlobServiceClient.fromConnectionString(connectionString);
  return service.getContainerClient(containerName);
}

export async function downloadText(prefixPath: string): Promise<string> {
  const container = getContainer();
  const blobClient = container.getBlobClient(prefixPath);
  const exists = await blobClient.exists();
  if (!exists) {
    throw new Error(`Blob not found: ${prefixPath}`);
  }
  const download = await blobClient.download();
  const content = await streamToString(download.readableStreamBody);
  return content;
}

export async function exists(path: string): Promise<boolean> {
  const container = getContainer();
  const blobClient = container.getBlobClient(path);
  return await blobClient.exists();
}

export async function listPaths(options: AzureListOptions): Promise<string[]> {
  const container = getContainer();
  const out: string[] = [];
  const iter = container.listBlobsFlat({ prefix: options.prefix });
  let i = 0;
  for await (const item of iter) {
    out.push(item.name);
    i++;
    if (options.maxResults && i >= options.maxResults) break;
  }
  return out;
}

export async function listPrefixes(prefix: string): Promise<string[]> {
  const container = getContainer();
  const out: string[] = [];
  const delim = '/';
  const iter = container.listBlobsByHierarchy(delim, { prefix });
  for await (const item of iter) {
    if ((item as any).kind === 'prefix') {
      out.push((item as any).name);
    }
  }
  return out;
}

/**
 * Upload text dengan retry logic untuk handle network errors
 */
export async function uploadText(path: string, content: string, contentType = 'text/csv', retries = 3): Promise<void> {
  const maxRetries = retries;
  let lastError: any = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const container = getContainer();
      const blockBlob = container.getBlockBlobClient(path);
      
      if (attempt === 1) {
        console.log(`📤 Uploading to Azure: ${path} (${Buffer.byteLength(content)} bytes)`);
      } else {
        console.log(`🔄 Retry ${attempt}/${maxRetries} uploading to Azure: ${path}`);
      }
      
      await blockBlob.upload(content, Buffer.byteLength(content), {
        blobHTTPHeaders: { blobContentType: contentType },
      });
      
      if (attempt > 1) {
        console.log(`✅ Successfully uploaded to Azure (after ${attempt} attempts): ${path}`);
      } else {
        console.log(`✅ Successfully uploaded to Azure: ${path}`);
      }
      
      return; // Success, exit function
    } catch (error: any) {
      lastError = error;
      
      // Check if error is retryable (network errors)
      const isRetryable = 
        error?.code === 'EADDRNOTAVAIL' ||
        error?.code === 'ECONNRESET' ||
        error?.code === 'ETIMEDOUT' ||
        error?.code === 'ENOTFOUND' ||
        error?.code === 'ECONNREFUSED' ||
        error?.name === 'RestError' ||
        (error?.message && (
          error.message.includes('connect') ||
          error.message.includes('timeout') ||
          error.message.includes('network')
        ));
      
      if (!isRetryable || attempt === maxRetries) {
        // Not retryable or max retries reached
        if (attempt === maxRetries) {
          console.error(`❌ Failed to upload to Azure after ${maxRetries} attempts: ${path}`, error);
        } else {
          console.error(`❌ Failed to upload to Azure (non-retryable error): ${path}`, error);
        }
        throw error;
      }
      
      // Calculate exponential backoff delay: 1s, 2s, 4s
      const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Max 10 seconds
      console.warn(`⚠️ Upload failed (attempt ${attempt}/${maxRetries}), retrying in ${delayMs}ms...`, error?.code || error?.message);
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  // Should never reach here, but just in case
  throw lastError || new Error(`Failed to upload ${path} after ${maxRetries} attempts`);
}

async function streamToString(readable: NodeJS.ReadableStream | undefined): Promise<string> {
  if (!readable) return '';
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    readable.on('data', (d) => chunks.push(Buffer.isBuffer(d) ? d : Buffer.from(d)));
    readable.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    readable.on('error', reject);
  });
}


