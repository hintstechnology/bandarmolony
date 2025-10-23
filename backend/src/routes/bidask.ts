import { Router } from 'express';
import BidAskCalculator from '../calculations/bidask/bid_ask';
import { downloadText, listPaths } from '../utils/azureBlob';

const router = Router();
const bidAskCalculator = new BidAskCalculator();

// Get bid/ask footprint status
router.get('/status', async (_req, res) => {
  try {
    return res.json({
      success: true,
      data: {
        service: 'Bid/Ask Footprint Calculator',
        status: 'ready',
        description: 'Analyzes bid/ask footprint per broker and stock'
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: `Failed to get bid/ask footprint status: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
});

// Generate bid/ask footprint data
router.post('/generate', async (req, res) => {
  try {
    const { date } = req.body;
    
    if (!date) {
      return res.status(400).json({
        success: false,
        error: 'Date parameter is required'
      });
    }
    
    const result = await bidAskCalculator.generateBidAskData(date);
    
    if (result.success) {
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: `Failed to generate bid/ask footprint data: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
});

// Get bid/ask footprint data for specific stock and date
router.get('/stock/:code/:date', async (req, res) => {
  try {
    const { code, date } = req.params;
    
    if (!code || !date) {
      return res.status(400).json({
        success: false,
        error: 'Stock code and date are required'
      });
    }
    
    const stockCode = code.toUpperCase();
    console.log(`📊 Getting bid/ask data for: ${stockCode} on ${date}`);
    
    // Bid/ask files are in bid_ask/bid_ask_{YYYYMMDD}/{STOCK}.csv
    const filePath = `bid_ask/bid_ask_${date}/${stockCode}.csv`;
    
    try {
      const csvData = await downloadText(filePath);
      
      // Parse CSV data
      const lines = csvData.split('\n').filter(line => line.trim());
      if (lines.length === 0) {
        return res.status(404).json({
          success: false,
          error: `No bid/ask data found for ${stockCode} on ${date}`
        });
      }
      
      const headers = lines[0]?.split(',') || [];
      const data = lines.slice(1).map(line => {
        const values = line.split(',');
        const row: any = {};
        headers.forEach((header, index) => {
          const value = values[index]?.trim() || '';
          // Numeric fields
          if (['Price', 'BidVolume', 'AskVolume', 'NetVolume', 'TotalVolume', 'BidCount', 'AskCount', 'UniqueBidBrokers', 'UniqueAskBrokers'].includes(header)) {
            row[header] = parseFloat(value) || 0;
          } else {
            row[header] = value;
          }
        });
        return row;
      });
      
      console.log(`📊 Retrieved ${data.length} bid/ask records for ${stockCode} on ${date}`);
      
      return res.json({
        success: true,
        data: {
          code: stockCode,
          date: date,
          data: data,
          total: data.length,
          generated_at: new Date().toISOString()
        }
      });
      
    } catch (error) {
      console.error(`❌ Error getting bid/ask data for ${stockCode} on ${date}:`, error);
      return res.status(404).json({
        success: false,
        error: `No bid/ask data found for ${stockCode} on ${date}`
      });
    }
    
  } catch (error) {
    console.error(`❌ Error getting bid/ask data for ${req.params.code} on ${req.params.date}:`, error);
    return res.status(500).json({
      success: false,
      error: `Failed to get bid/ask data for ${req.params.code} on ${req.params.date}`
    });
  }
});

// Get available dates for bid/ask data
router.get('/dates', async (_req, res) => {
  try {
    const allFiles = await listPaths({ prefix: 'bid_ask/' });
    const dateFolders = allFiles
      .filter(file => file.includes('/bid_ask_') && file.endsWith('/'))
      .map(file => {
        const match = file.match(/bid_ask\/(\d{8})\//);
        return match ? match[1] : null;
      })
      .filter((date): date is string => date !== null)
      .sort()
      .reverse(); // Newest first
    
    return res.json({
      success: true,
      data: {
        dates: dateFolders,
        total: dateFolders.length
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: `Failed to get available dates: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
});

// Get available stocks for specific date
router.get('/stocks/:date', async (req, res) => {
  try {
    const { date } = req.params;
    
    if (!date) {
      return res.status(400).json({
        success: false,
        error: 'Date parameter is required'
      });
    }
    
    const allFiles = await listPaths({ prefix: `bid_ask/bid_ask_${date}/` });
    const stockFiles = allFiles
      .filter(file => file.endsWith('.csv') && !file.includes('ALL_STOCK'))
      .map(file => {
        const match = file.match(/bid_ask\/bid_ask_\d{8}\/([A-Z0-9]+)\.csv$/);
        return match ? match[1] : null;
      })
      .filter((stock): stock is string => stock !== null)
      .sort();
    
    return res.json({
      success: true,
      data: {
        date: date,
        stocks: stockFiles,
        total: stockFiles.length
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: `Failed to get available stocks for ${req.params.date}: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
});

export default router;
