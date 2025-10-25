import express from 'express';
import { BlobServiceClient } from '@azure/storage-blob';
import NodeCache from 'node-cache';

const router = express.Router();

// Initialize Azure Blob Storage with error handling
let blobServiceClient: BlobServiceClient;
let containerClient: any;

try {
  const connectionString = process.env['AZURE_STORAGE_CONNECTION_STRING'];
  if (!connectionString) {
    console.warn('⚠️ AZURE_STORAGE_CONNECTION_STRING not set, broker-optimized routes will be disabled');
  } else {
    blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    containerClient = blobServiceClient.getContainerClient('bandarmolony');
  }
} catch (error) {
  console.error('❌ Failed to initialize Azure Blob Storage:', error);
}

// Initialize cache
const brokerCache = new NodeCache({ stdTTL: 600 }); // 10 minutes

// Helper function to get cached data or fetch from blob
async function getCachedBrokerData(stockCode: string, date: string): Promise<any[]> {
  if (!containerClient) {
    console.warn('Azure Blob Storage not initialized');
    return [];
  }

  const cacheKey = `broker_${stockCode}_${date}`;
  
  // Check cache first
  const cachedData = brokerCache.get(cacheKey);
  if (cachedData) {
    return cachedData as any[];
  }
  
  try {
    const blobName = `broker_summary/broker_summary_${date}/${stockCode}.csv`;
    const blobClient = containerClient.getBlobClient(blobName);
    
    if (!(await blobClient.exists())) {
      return [];
    }
    
    const downloadResponse = await blobClient.download();
    if (!downloadResponse.readableStreamBody) {
      return [];
    }
    
    const csvContent = await streamToString(downloadResponse.readableStreamBody);
    
    const lines = csvContent.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];
    
    const headers = lines[0]?.split(',').map(h => h.trim().replace(/"/g, '')) || [];
    const brokerData: any[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i]?.split(',').map(v => v.trim().replace(/"/g, '')) || [];
      const row: any = {};
      
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      
      // Only include rows with non-zero NetBuyVol
      const netBuyVol = parseFloat(row.NetBuyVol || '0');
      if (netBuyVol !== 0) {
        brokerData.push({
          broker: row.BrokerCode,
          nblot: netBuyVol,
          date: date,
          stockCode: stockCode
        });
      }
    }
    
    // Cache the result
    brokerCache.set(cacheKey, brokerData);
    return brokerData;
    
  } catch (error) {
    console.error(`Error fetching broker data for ${stockCode} on ${date}:`, error);
    return [];
  }
}

// Helper function to convert stream to string
async function streamToString(readableStream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    readableStream.on('data', (data) => {
      chunks.push(data instanceof Buffer ? data : Buffer.from(data));
    });
    readableStream.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf-8'));
    });
    readableStream.on('error', reject);
  });
}

// Optimized endpoint to get broker summary data for multiple dates
router.get('/broker-summary-optimized/:stockCode', async (req, res) => {
  try {
    const { stockCode } = req.params;
    const { startDate, endDate, limit = 30 } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ 
        success: false, 
        error: 'startDate and endDate are required' 
      });
    }
    
    // Generate date range
    const dates: string[] = [];
    const start = new Date(startDate as string);
    const end = new Date(endDate as string);
    const current = new Date(start);
    
    while (current <= end && dates.length < parseInt((limit as string) || '30')) {
      dates.push(current.toISOString().split('T')[0] || '');
      current.setDate(current.getDate() + 1);
    }
    
    // Fetch data for all dates in parallel
    const promises = dates.map(date => getCachedBrokerData(stockCode, date));
    const results = await Promise.all(promises);
    
    // Flatten results and filter out empty data
    const allBrokerData = results.flat().filter(data => data.nblot !== 0);
    
    // Group by date for easier processing
    const dataByDate: { [date: string]: any[] } = {};
    allBrokerData.forEach(record => {
      if (!dataByDate[record.date]) {
        dataByDate[record.date] = [];
      }
      dataByDate[record.date]?.push(record);
    });
    
    return res.json({
      success: true,
      data: {
        stockCode,
        dateRange: { startDate, endDate },
        totalRecords: allBrokerData.length,
        dataByDate,
        allBrokerData
      }
    });
    
  } catch (error) {
    console.error('Error in broker-summary-optimized:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// Cache statistics endpoint
router.get('/cache-stats', (_, res) => {
  const brokerStats = brokerCache.getStats();
  
  return res.json({
    success: true,
    data: {
      brokerCache: {
        keys: brokerStats.keys,
        hits: brokerStats.hits,
        misses: brokerStats.misses,
        ksize: brokerStats.ksize,
        vsize: brokerStats.vsize
      }
    }
  });
});

export default router;