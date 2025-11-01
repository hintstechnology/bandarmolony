import { BlobServiceClient } from '@azure/storage-blob';
import config from '../config';

export interface AzureListOptions {
  prefix?: string;
  maxResults?: number;
}

function getAzureAccountName(connectionString: string): string | null {
  try {
    const parts = connectionString.split(';');
    const accountNamePart = parts.find(part => part.startsWith('AccountName='));
    if (accountNamePart) {
      return accountNamePart.split('=')[1] || null;
    }
  } catch (e) {
    // Ignore parse errors
  }
  return null;
}

function getContainer(): any {
  const connectionString = config.AZURE_STORAGE_CONNECTION_STRING;
  const containerName = config.AZURE_STORAGE_CONTAINER_NAME || 'stock-trading-data';
  if (!connectionString) {
    throw new Error('Azure Storage configuration is missing');
  }
  
  // Extract and log Azure account name
  const accountName = getAzureAccountName(connectionString);
  if (accountName) {
    console.log(`🔧 Azure Storage - Account: ${accountName}, Container: ${containerName}`);
  } else {
    console.log(`🔧 Azure Storage - Container: ${containerName} (account name not found in connection string)`);
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

export async function uploadText(path: string, content: string, contentType = 'text/csv'): Promise<void> {
  try {
    const container = getContainer();
    const blockBlob = container.getBlockBlobClient(path);
    
    console.log(`📤 Uploading to Azure: ${path} (${Buffer.byteLength(content)} bytes)`);
    
    await blockBlob.upload(content, Buffer.byteLength(content), {
      blobHTTPHeaders: { blobContentType: contentType },
    });
    
    console.log(`✅ Successfully uploaded to Azure: ${path}`);
  } catch (error) {
    console.error(`❌ Failed to upload to Azure: ${path}`, error);
    throw error; // Re-throw untuk caller bisa handle
  }
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


