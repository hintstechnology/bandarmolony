import { Router } from 'express';
import { downloadText, listPaths } from '../utils/azureBlob';
import AccumulationDistributionCalculator from '../calculations/accumulation/accumulation_distribution';


const router = Router();
const accumulationCalculator = new AccumulationDistributionCalculator();

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
      row[header] = values[index] || '';
    });
    
    data.push(row);
  }
  
  return data;
}

// Get accumulation distribution status
router.get('/status', async (_req, res) => {
  try {
    return res.json({
      success: true,
      data: {
        service: 'Accumulation Distribution Calculator',
        status: 'ready',
        description: 'Calculates weekly/daily accumulation, volume percentages, and MA indicators'
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: `Failed to get accumulation distribution status: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
});

// Get list of available dates from accumulation_distribution directory
router.get('/dates', async (_req, res) => {
  try {
    const cacheKey = 'accumulation-distribution-dates';
    const cachedData = getCachedData(cacheKey);
    if (cachedData) {
      return res.json(cachedData);
    }

    console.log('📊 Getting list of available dates from accumulation_distribution directory...');
    
    const accumulationBlobs = await listPaths({ prefix: 'accumulation_distribution/' });
    const dates: string[] = [];
    
    for (const blobName of accumulationBlobs) {
      // Extract date from path like "accumulation_distribution/20241201.csv"
      const match = blobName.match(/accumulation_distribution\/(\d{8})\.csv$/);
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
    console.error('❌ Error getting accumulation distribution dates:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get accumulation distribution dates'
    });
  }
});

// Get accumulation distribution data for specific date
router.get('/data/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const cacheKey = `accumulation-distribution-${date}`;
    const cachedData = getCachedData(cacheKey);
    if (cachedData) {
      return res.json(cachedData);
    }

    console.log(`📊 Getting accumulation distribution data for date: ${date}`);
    
    const dateFormatted = date.replace(/-/g, '');
    const filePath = `accumulation_distribution/${dateFormatted}.csv`;
    
    try {
      const csvContent = await downloadText(filePath);
      const data = parseCsvContent(csvContent);
      
      const response = {
        success: true,
        data: {
          date: date,
          accumulationData: data,
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
            accumulationData: [],
            total: 0
          }
        });
      }
      throw error;
    }
    
  } catch (error) {
    console.error('❌ Error getting accumulation distribution data:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get accumulation distribution data'
    });
  }
});

// Generate accumulation distribution data
router.post('/generate', async (req, res) => {
  try {
    const { date } = req.body;
    
    if (!date) {
      return res.status(400).json({
        success: false,
        error: 'Date parameter is required'
      });
    }
    
    console.log(`🚀 Calculating accumulation distribution for date: ${date}`);
    
    // Use the existing calculator class
    const result = await accumulationCalculator.generateAccumulationDistributionData(date);
    
    if (result.success) {
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
    
  } catch (error) {
    console.error('❌ Error calculating accumulation distribution:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to calculate accumulation distribution data'
    });
  }
});

export default router;
