import { Router } from 'express';
import { downloadText, listPaths } from '../utils/azureBlob';

const router = Router();

// Cache untuk menyimpan data yang sudah diambil
const dataCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 10 * 60 * 1000; // 10 menit

// Helper function untuk check cache
const getCachedData = (key: string) => {
  const cached = dataCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }
  return null;
};

// Helper function untuk set cache
const setCachedData = (key: string, data: any) => {
  dataCache.set(key, { data, timestamp: Date.now() });
};

/**
 * Parse CSV content to array of objects
 */
function parseCsvContent(csvContent: string): any[] {
  const lines = csvContent.split('\n').filter(line => line.trim());
  if (lines.length < 2) return [];
  
  const headers = lines[0]?.split(',').map(h => h.trim()) || [];
  const data: any[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i]?.split(',').map(v => v.trim()) || [];
    const row: any = {};
    
    headers.forEach((header, index) => {
      const value = values[index] || '';
      
      // Convert numeric fields to numbers
      if (header === 'STK_VOLM' || header === 'STK_PRIC' || 
          header === 'TRX_TIME' || header === 'TRX_CODE' || 
          header === 'TRX_SESS' || header === 'TRX_ORD1' || 
          header === 'TRX_ORD2') {
        row[header] = parseFloat(value) || 0;
      } else {
        row[header] = value;
      }
    });
    
    data.push(row);
  }
  
  return data;
}

// Get done summary status
router.get('/status', async (_req, res) => {
  try {
    return res.json({
      success: true,
      data: {
        service: 'Done Summary API',
        status: 'ready',
        description: 'Provides access to done summary data'
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: `Failed to get done summary status: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
});

// Get list of available dates from done_summary directory
router.get('/dates', async (_req, res) => {
  try {
    const cacheKey = 'done-summary-dates';
    const cachedData = getCachedData(cacheKey);
    if (cachedData) {
      return res.json(cachedData);
    }

    console.log('📊 Getting list of available dates from done_summary directory...');
    
    const doneSummaryBlobs = await listPaths({ prefix: 'done_summary/' });
    const dates: string[] = [];
    
    for (const blobName of doneSummaryBlobs) {
      // Extract date from path like "done_summary/20241201/20241201.csv"
      const match = blobName.match(/done_summary\/(\d{8})\//);
      if (match && match[1]) {
        const dateStr = match[1];
        // Convert YYYYMMDD to YYYY-MM-DD
        const formattedDate = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
        dates.push(formattedDate);
      }
    }
    
    const uniqueDates = [...new Set(dates)].sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    
    console.log(`📊 Found ${uniqueDates.length} available dates:`, uniqueDates.slice(0, 10), '...');
    
    const response = {
      success: true,
      data: {
        dates: uniqueDates,
        total: uniqueDates.length
      }
    };
    
    setCachedData(cacheKey, response);
    return res.json(response);
    
  } catch (error) {
    console.error('❌ Error getting done summary dates:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get done summary dates'
    });
  }
});

// Get done summary data for specific date
router.get('/data/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const cacheKey = `done-summary-data-${date}`;
    const cachedData = getCachedData(cacheKey);
    if (cachedData) {
      return res.json(cachedData);
    }

    console.log(`📊 Getting done summary data for date: ${date}`);
    
    const dateFormatted = date.replace(/-/g, '');
    const filePath = `done_summary/${dateFormatted}/${dateFormatted}.csv`;
    
    try {
      const csvContent = await downloadText(filePath);
      const data = parseCsvContent(csvContent);
      
      const response = {
        success: true,
        data: {
          date: date,
          doneSummaryData: data,
          total: data.length
        }
      };
      
      setCachedData(cacheKey, response);
      return res.json(response);
      
    } catch (error: any) {
      if (error.message.includes('Blob not found')) {
        return res.json({
          success: true,
          data: {
            date: date,
            doneSummaryData: [],
            total: 0
          }
        });
      }
      throw error;
    }
    
  } catch (error) {
    console.error('❌ Error getting done summary data:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get done summary data'
    });
  }
});

export default router;