import { Router } from 'express';
import ForeignFlowCalculator from '../calculations/foreign/foreign_flow';
import { downloadText } from '../utils/azureBlob';

const router = Router();
const foreignCalculator = new ForeignFlowCalculator();

// Get foreign flow status
router.get('/status', async (_req, res) => {
  try {
    return res.json({
      success: true,
      data: {
        service: 'Foreign Flow Calculator',
        status: 'ready',
        description: 'Analyzes foreign investor buy/sell flow per stock'
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: `Failed to get foreign flow status: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
});

// Generate foreign flow data
router.post('/generate', async (req, res) => {
  try {
    const { date } = req.body;
    
    if (!date) {
      return res.status(400).json({
        success: false,
        error: 'Date parameter is required'
      });
    }
    
    const result = await foreignCalculator.generateForeignFlowData(date);
    
    if (result.success) {
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: `Failed to generate foreign flow data: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
});

// Get foreign flow data
router.get('/data/:date', async (req, res) => {
  try {
    const { date } = req.params;
    
    // For now, just return status since we need to implement data retrieval
    return res.json({
      success: true,
      data: {
        date,
        message: 'Data retrieval not yet implemented',
        note: 'Use generate endpoint to create data first'
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: `Failed to get foreign flow data: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
});

// Get foreign flow data for specific stock
router.get('/stock/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const { limit } = req.query;
    
    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Stock code is required'
      });
    }
    
    const stockCode = code.toUpperCase();
    console.log(`📊 Getting foreign flow data for: ${stockCode}`);
    
    // Foreign flow files are in foreign_flow/{STOCK}.csv (flat structure)
    const filePath = `foreign_flow/${stockCode}.csv`;
    
    try {
      const csvData = await downloadText(filePath);
      
      // Parse CSV data
      const lines = csvData.split('\n').filter(line => line.trim());
      if (lines.length === 0) {
        return res.status(404).json({
          success: false,
          error: `No foreign flow data found for ${stockCode}`
        });
      }
      
      const headers = lines[0]?.split(',') || [];
      const data = lines.slice(1).map(line => {
        const values = line.split(',');
        const row: any = {};
        headers.forEach((header, index) => {
          const value = values[index]?.trim() || '';
          // Numeric fields: BuyVol, SellVol, NetBuyVol
          if (['BuyVol', 'SellVol', 'NetBuyVol'].includes(header)) {
            row[header] = parseFloat(value) || 0;
          } else {
            row[header] = value;
          }
        });
        return row;
      });
      
      // Apply limit if provided (get last N records)
      let filteredData = data;
      if (limit) {
        const limitNum = parseInt(String(limit));
        if (limitNum > 0) {
          filteredData = data.slice(-limitNum);
        }
      }
      
      // Data is sorted ascending by date (oldest first) from foreign_flow.ts
      // This is already correct for charting
      
      console.log(`📊 Retrieved ${filteredData.length} foreign flow records for ${stockCode}`);
      
      return res.json({
        success: true,
        data: {
          code: stockCode,
          data: filteredData,
          total: filteredData.length,
          generated_at: new Date().toISOString()
        }
      });
      
    } catch (error) {
      console.error(`❌ Error getting foreign flow data for ${stockCode}:`, error);
      return res.status(404).json({
        success: false,
        error: `No foreign flow data found for ${stockCode}`
      });
    }
    
  } catch (error) {
    console.error(`❌ Error getting foreign flow data for ${req.params.code}:`, error);
    return res.status(500).json({
      success: false,
      error: `Failed to get foreign flow data for ${req.params.code}`
    });
  }
});

export default router;
