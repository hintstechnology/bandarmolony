import { Router } from 'express';
import { downloadText, listPaths } from '../utils/azureBlob';
import BreakDoneTradeCalculator from '../calculations/done/break_done_trade';
import DoneDetailPivotCalculator from '../calculations/done/done_detail_pivot';

const router = Router();
const breakDoneTradeCalculator = new BreakDoneTradeCalculator();
const pivotCalculator = new DoneDetailPivotCalculator();

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

// Get break done trade status
router.get('/status', async (_req, res) => {
  try {
    return res.json({
      success: true,
      data: {
        service: 'Break Done Trade Calculator',
        status: 'ready',
        description: 'Breaks down done trade data by stock code into separate files'
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: `Failed to get break done trade status: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
});

// Get list of available dates from done_detail directory
router.get('/dates', async (_req, res) => {
  try {
    const cacheKey = 'break-done-trade-dates';
    const cachedData = getCachedData(cacheKey);
    if (cachedData) {
      return res.json(cachedData);
    }

    console.log('📊 Getting list of available dates from done_detail directory...');
    
    const doneDetailBlobs = await listPaths({ prefix: 'done_detail/' });
    const dates: string[] = [];
    
    for (const blobName of doneDetailBlobs) {
      // Extract date from path like "done_detail/20241201/BBRI.csv"
      const match = blobName.match(/done_detail\/(\d{8})\//);
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
    console.error('❌ Error getting break done trade dates:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get break done trade dates'
    });
  }
});

// Get list of available stocks for a specific date
router.get('/stocks/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const cacheKey = `break-done-trade-stocks-${date}`;
    const cachedData = getCachedData(cacheKey);
    if (cachedData) {
      return res.json(cachedData);
    }

    console.log(`📊 Getting list of available stocks for date: ${date}`);
    
    const dateFormatted = date.replace(/-/g, '');
    const prefix = `done_detail/${dateFormatted}/`;
    
    try {
      const blobs = await listPaths({ prefix });
      const stocks: string[] = [];
      
      for (const blobName of blobs) {
        // Extract stock code from path like "done_detail/20241201/BBRI.csv"
        const match = blobName.match(new RegExp(`done_detail/${dateFormatted}/(.+)\\.csv$`));
        if (match && match[1]) {
          stocks.push(match[1]);
        }
      }
      
      const response = {
        success: true,
        data: {
          date: date,
          stocks: stocks.sort(),
          total: stocks.length
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
            stocks: [],
            total: 0
          }
        });
      }
      throw error;
    }
    
  } catch (error) {
    console.error('❌ Error getting break done trade stocks:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get break done trade stocks'
    });
  }
});

// Get break done trade data for specific stock and date
router.get('/data/:date/:stock', async (req, res) => {
  try {
    const { date, stock } = req.params;
    const cacheKey = `break-done-trade-data-${date}-${stock}`;
    const cachedData = getCachedData(cacheKey);
    if (cachedData) {
      return res.json(cachedData);
    }

    console.log(`📊 Getting break done trade data for stock: ${stock}, date: ${date}`);
    
    const dateFormatted = date.replace(/-/g, '');
    const filePath = `done_detail/${dateFormatted}/${stock}.csv`;
    
    try {
      const csvContent = await downloadText(filePath);
      const data = parseCsvContent(csvContent);
      
      const response = {
        success: true,
        data: {
          date: date,
          stock: stock,
          doneTradeData: data,
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
            stock: stock,
            doneTradeData: [],
            total: 0
          }
        });
      }
      throw error;
    }
    
  } catch (error) {
    console.error('❌ Error getting break done trade data:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get break done trade data'
    });
  }
});

// Generate break done trade data
router.post('/generate', async (req, res) => {
  try {
    const { date } = req.body;
    
    if (!date) {
      return res.status(400).json({
        success: false,
        error: 'Date parameter is required'
      });
    }
    
    console.log(`🚀 Generating break done trade data for date: ${date}`);
    
    // Use the existing calculator class
    const result = await breakDoneTradeCalculator.generateBreakDoneTradeData(date);
    
    if (result.success) {
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
    
  } catch (error) {
    console.error('❌ Error generating break done trade data:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate break done trade data'
    });
  }
});

// Get pivot data
router.post('/pivot', async (req, res) => {
  try {
    const { stockCode, dates, pivotType } = req.body;
    
    if (!stockCode || !dates || !Array.isArray(dates) || dates.length === 0 || !pivotType) {
      return res.status(400).json({
        success: false,
        error: 'stockCode, dates (array), and pivotType are required'
      });
    }

    const cacheKey = `break-done-trade-pivot-${stockCode}-${dates.join(',')}-${pivotType}`;
    const cachedData = getCachedData(cacheKey);
    if (cachedData) {
      return res.json(cachedData);
    }

    console.log(`📊 Getting pivot data for stock: ${stockCode}, dates: ${dates.join(', ')}, type: ${pivotType}`);
    
    // Map pivotType to PivotDimension
    const pivotDimensionMap: { [key: string]: any } = {
      'time': 'TRX_TIME',
      'buyer_broker': 'BRK_COD1',
      'seller_broker': 'BRK_COD2',
      'price': 'STK_PRIC',
      'stock_code': 'STK_CODE',
      'inv_typ1': 'INV_TYP1',
      'inv_typ2': 'INV_TYP2',
      'trx_type': 'TRX_TYPE',
      'trx_sess': 'TRX_SESS',
      'buyer_seller_cross': 'BRK_COD1_BRK_COD2',
      'seller_buyer_breakdown': 'BRK_COD2_BRK_COD1',
      'buyer_seller_detail': 'BRK_COD1_BRK_COD2_DETAIL',
      'session_buyer_broker': 'TRX_SESS_BRK_COD1',
      'session_seller_broker': 'TRX_SESS_BRK_COD2',
      'session_stock_code': 'TRX_SESS_STK_CODE',
      'buyer_broker_session': 'BRK_COD1_TRX_SESS',
      'seller_broker_session': 'BRK_COD2_TRX_SESS',
      'stock_code_session': 'STK_CODE_TRX_SESS',
      'buyer_inv_type_broker': 'INV_TYP1_BRK_COD1',
      'seller_inv_type_broker': 'INV_TYP2_BRK_COD2',
      'trx_type_buyer_broker': 'TRX_TYPE_BRK_COD1',
      'trx_type_seller_broker': 'TRX_TYPE_BRK_COD2',
    };

    let pivotData: any;
    
    if (pivotType === 'buyer_seller_cross') {
      // Special case for cross pivot
      pivotData = await pivotCalculator.pivotByBuyerSellerCross(stockCode, dates);
    } else {
      const dimension = pivotDimensionMap[pivotType];
      if (!dimension) {
        return res.status(400).json({
          success: false,
          error: `Invalid pivotType: ${pivotType}. Valid types: ${Object.keys(pivotDimensionMap).join(', ')}, buyer_seller_cross`
        });
      }
      
      // Get filters from request body if provided
      const filters = {
        stockCodes: req.body.stockCodes,
        buyerBrokers: req.body.buyerBrokers,
        sellerBrokers: req.body.sellerBrokers,
        minPrice: req.body.minPrice,
        maxPrice: req.body.maxPrice,
        dates: req.body.dates,
      };
      
      // Access createPivot method (it's private, so we need to cast)
      const calculator = pivotCalculator as any;
      pivotData = await calculator.createPivot(stockCode, dates, dimension, filters);
    }
    
    const response = {
      success: true,
      data: {
        stockCode,
        dates,
        pivotType,
        pivotData
      }
    };
    
    setCachedData(cacheKey, response);
    return res.json(response);
    
  } catch (error) {
    console.error('❌ Error getting pivot data:', error);
    return res.status(500).json({
      success: false,
      error: `Failed to get pivot data: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
});

export default router;
