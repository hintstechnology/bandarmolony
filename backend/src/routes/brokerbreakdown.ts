import { Router } from 'express';
import BrokerBreakdownCalculator from '../calculations/broker/broker_breakdown';
import { downloadText } from '../utils/azureBlob';

const router = Router();
const brokerBreakdownCalculator = new BrokerBreakdownCalculator();

// Get broker breakdown status
router.get('/status', async (_req, res) => {
  try {
    return res.json({
      success: true,
      data: {
        service: 'Broker Breakdown Calculator',
        status: 'ready',
        description: 'Calculates broker breakdown analysis by stock, broker, and price level'
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: `Failed to get broker breakdown status: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
});

// Generate broker breakdown data
router.post('/generate', async (req, res) => {
  try {
    const { date } = req.body;
    
    if (!date) {
      return res.status(400).json({
        success: false,
        error: 'Date parameter is required'
      });
    }
    
    const result = await brokerBreakdownCalculator.generateBrokerBreakdownData(date);
    
    if (result.success) {
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: `Failed to generate broker breakdown data: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
});

// Get broker breakdown data for specific stock
router.get('/data/:stockCode', async (req, res) => {
  try {
    const { stockCode } = req.params;
    const { date } = req.query;
    
    if (!date) {
      return res.status(400).json({
        success: false,
        error: 'Date parameter is required'
      });
    }
    
    const filename = `done_summary_broker_breakdown/${date}/${stockCode}.csv`;
    
    try {
      const content = await downloadText(filename);
      
      // Parse CSV content
      const lines = content.trim().split('\n');
      const headers = lines[0]?.split(',') || [];
      const data = lines.slice(1).map(line => {
        const values = line.split(',');
        const row: any = {};
        headers.forEach((header, index) => {
          row[header.trim()] = values[index]?.trim() || '';
        });
        return row;
      });
      
      return res.json({
        success: true,
        data: {
          stockCode,
          date,
          filename,
          headers,
          records: data,
          totalRecords: data.length
        }
      });
    } catch (error) {
      return res.status(404).json({
        success: false,
        error: `Broker breakdown data not found for ${stockCode} on ${date}`
      });
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: `Failed to get broker breakdown data: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
});

// Get broker breakdown data for specific stock and price
router.get('/data/:stockCode/:price', async (req, res) => {
  try {
    const { stockCode, price } = req.params;
    const { date } = req.query;
    
    if (!date) {
      return res.status(400).json({
        success: false,
        error: 'Date parameter is required'
      });
    }
    
    const filename = `done_summary_broker_breakdown/${date}/${stockCode}.csv`;
    
    try {
      const content = await downloadText(filename);
      
      // Parse CSV content and filter by price
      const lines = content.trim().split('\n');
      const headers = lines[0]?.split(',') || [];
      const data = lines.slice(1)
        .map(line => {
          const values = line.split(',');
          const row: any = {};
          headers.forEach((header, index) => {
            row[header.trim()] = values[index]?.trim() || '';
          });
          return row;
        })
        .filter(row => parseFloat(row.Price) === parseFloat(price));
      
      return res.json({
        success: true,
        data: {
          stockCode,
          price: parseFloat(price),
          date,
          filename,
          headers,
          records: data,
          totalRecords: data.length
        }
      });
    } catch (error) {
      return res.status(404).json({
        success: false,
        error: `Broker breakdown data not found for ${stockCode} at price ${price} on ${date}`
      });
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: `Failed to get broker breakdown data: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
});

// Get broker breakdown summary for specific date
router.get('/summary/:date', async (req, res) => {
  try {
    const { date } = req.params;
    
    // This would require listing all files in the date folder
    // For now, return a placeholder response
    return res.json({
      success: true,
      data: {
        date,
        message: 'Broker breakdown summary endpoint - implementation pending',
        note: 'Use /data/:stockCode endpoint to get specific stock data'
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: `Failed to get broker breakdown summary: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
});

export default router;
