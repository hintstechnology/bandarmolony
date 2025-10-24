import { Router } from 'express';
import MoneyFlowCalculator from '../calculations/moneyflow/money_flow';
import { downloadText } from '../utils/azureBlob';

const router = Router();
const moneyFlowCalculator = new MoneyFlowCalculator();

// Get money flow status
router.get('/status', async (_req, res) => {
  try {
    return res.json({
      success: true,
      data: {
        service: 'Money Flow Calculator',
        status: 'ready',
        description: 'Calculates Money Flow Index (MFI) for stocks and indices'
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: `Failed to get money flow status: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
});

// Generate money flow data
router.post('/generate', async (req, res) => {
  try {
    const { date } = req.body;
    
    if (!date) {
      return res.status(400).json({
        success: false,
        error: 'Date parameter is required'
      });
    }
    
    const result = await moneyFlowCalculator.generateMoneyFlowData(date);
    
    if (result.success) {
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: `Failed to generate money flow data: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
});

// Get money flow data
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
      error: `Failed to get money flow data: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
});

// Get money flow data for specific stock or index
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
    console.log(`📊 Getting money flow data for: ${stockCode}`);
    
    // Try stock first, then index
    let filePath = `money_flow/stock/${stockCode}.csv`;
    let csvData: string;
    let type: 'stock' | 'index' = 'stock';
    
    try {
      csvData = await downloadText(filePath);
    } catch (error) {
      // If stock not found, try index
      console.log(`📊 Stock not found, trying index...`);
      filePath = `money_flow/index/${stockCode}.csv`;
      type = 'index';
      csvData = await downloadText(filePath);
    }
    
    // Parse CSV data
    const lines = csvData.split('\n').filter(line => line.trim());
    if (lines.length === 0) {
      return res.status(404).json({
        success: false,
        error: `No money flow data found for ${stockCode}`
      });
    }
    
    const headers = lines[0]?.split(',') || [];
    const data = lines.slice(1).map(line => {
      const values = line.split(',');
      const row: any = {};
      headers.forEach((header, index) => {
        const value = values[index]?.trim() || '';
        // MFI is numeric
        if (header === 'MFI') {
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
    
    // Data is already sorted by date (newest first from money_flow.ts)
    // But we'll reverse it for the frontend (oldest first for charting)
    filteredData.reverse();
    
    console.log(`📊 Retrieved ${filteredData.length} money flow records for ${stockCode}`);
    
    return res.json({
      success: true,
      data: {
        code: stockCode,
        type,
        data: filteredData,
        total: filteredData.length,
        generated_at: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error(`❌ Error getting money flow data for ${req.params.code}:`, error);
    return res.status(404).json({
      success: false,
      error: `No money flow data found for ${req.params.code}`
    });
  }
});

export default router;
