import express from 'express';
import { BrokerInventoryCalculator } from '../calculations/broker/broker_inventory';
import { downloadText, listPaths } from '../utils/azureBlob';

const router = express.Router();
const brokerInventoryCalculator = new BrokerInventoryCalculator();

/**
 * Generate broker inventory data
 */
router.post('/generate', async (_req, res) => {
  try {
    console.log('🔄 Starting broker inventory data generation...');
    
    // Fix: Use YYMMDD format (6 digits) instead of YYYYMMDD (8 digits)
    const dateSuffix = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    await brokerInventoryCalculator.generateBrokerInventoryData(dateSuffix);
    
    console.log('✅ Broker inventory data generation completed successfully');
    return res.json({ 
      success: true, 
      message: 'Broker inventory data generated successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error generating broker inventory data:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to generate broker inventory data',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get broker inventory data status
 */
router.get('/status', async (_req, res) => {
  try {
    return res.json({ 
      success: true, 
      status: 'Broker inventory service is running',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error getting broker inventory status:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to get broker inventory status',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get broker inventory data for specific stock and broker
 */
router.get('/data/:stock/:broker', async (req, res) => {
  try {
    const { stock, broker } = req.params;
    
    if (!stock || !broker) {
      return res.status(400).json({
        success: false,
        error: 'Stock code and broker code are required'
      });
    }
    
    const stockCode = stock.toUpperCase();
    const brokerCode = broker.toUpperCase();
    console.log(`📊 Getting broker inventory data for: ${stockCode} - ${brokerCode}`);
    
    // Broker inventory files are in broker_inventory/{STOCK}/{BROKER}.csv
    const filePath = `broker_inventory/${stockCode}/${brokerCode}.csv`;
    
    try {
      const csvData = await downloadText(filePath);
      
      // Parse CSV data
      const lines = csvData.split('\n').filter(line => line.trim());
      if (lines.length === 0) {
        return res.status(404).json({
          success: false,
          error: `No broker inventory data found for ${stockCode} - ${brokerCode}`
        });
      }
      
      const headers = lines[0]?.split(',') || [];
      const data = lines.slice(1).map((line) => {
        const values = line.split(',');
        const row: any = {};
        headers.forEach((header, index) => {
          const value = values[index]?.trim() || '';
          // Numeric fields
          if (['NetBuyVol', 'CumulativeNetBuyVol'].includes(header)) {
            row[header] = parseFloat(value) || 0;
          } else {
            row[header] = value;
          }
        });
        
        return row;
      });
      
      console.log(`📊 Retrieved ${data.length} broker inventory records for ${stockCode} - ${brokerCode}`);
      
      return res.json({
        success: true,
        data: {
          stock: stockCode,
          broker: brokerCode,
          data: data,
          total: data.length,
          generated_at: new Date().toISOString()
        }
      });
      
    } catch (error) {
      console.error(`❌ Error getting broker inventory data for ${stockCode} - ${brokerCode}:`, error);
      return res.status(404).json({
        success: false,
        error: `No broker inventory data found for ${stockCode} - ${brokerCode}`
      });
    }
    
  } catch (error) {
    console.error(`❌ Error getting broker inventory data for ${req.params.stock} - ${req.params.broker}:`, error);
    return res.status(500).json({
      success: false,
      error: `Failed to get broker inventory data for ${req.params.stock} - ${req.params.broker}`
    });
  }
});

/**
 * Get available stocks for broker inventory
 */
router.get('/stocks', async (_req, res) => {
  try {
    const allFiles = await listPaths({ prefix: 'broker_inventory/' });
    const stockFolders = allFiles
      .filter(file => file.includes('/broker_inventory/') && file.endsWith('/'))
      .map(file => {
        const match = file.match(/broker_inventory\/([A-Z0-9]+)\//);
        return match ? match[1] : null;
      })
      .filter((stock): stock is string => stock !== null)
      .sort();
    
    return res.json({
      success: true,
      data: {
        stocks: stockFolders,
        total: stockFolders.length
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: `Failed to get available stocks: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
});

/**
 * Get available brokers for specific stock
 */
router.get('/brokers/:stock', async (req, res) => {
  try {
    const { stock } = req.params;
    
    if (!stock) {
      return res.status(400).json({
        success: false,
        error: 'Stock code is required'
      });
    }
    
    const stockCode = stock.toUpperCase();
    const allFiles = await listPaths({ prefix: `broker_inventory/${stockCode}/` });
    const brokerFiles = allFiles
      .filter(file => file.endsWith('.csv'))
      .map(file => {
        const match = file.match(/broker_inventory\/[A-Z0-9]+\/([A-Z0-9]+)\.csv$/);
        return match ? match[1] : null;
      })
      .filter((broker): broker is string => broker !== null)
      .sort();
    
    return res.json({
      success: true,
      data: {
        stock: stockCode,
        brokers: brokerFiles,
        total: brokerFiles.length
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: `Failed to get available brokers for ${req.params.stock}: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
});

/**
 * Download CSV for broker inventory data
 */
router.get('/download/:stock/:broker', async (req, res) => {
  try {
    const { stock, broker } = req.params;
    
    if (!stock || !broker) {
      return res.status(400).json({
        success: false,
        error: 'Stock code and broker code are required'
      });
    }
    
    const stockCode = stock.toUpperCase();
    const brokerCode = broker.toUpperCase();
    console.log(`📊 Downloading CSV for broker inventory data: ${stockCode} - ${brokerCode}`);
    
    const filePath = `broker_inventory/${stockCode}/${brokerCode}.csv`;
    
    try {
      const csvData = await downloadText(filePath);
      
      // Parse CSV data to ensure it's valid
      const lines = csvData.split('\n').filter(line => line.trim());
      if (lines.length === 0) {
        return res.status(404).json({
          success: false,
          error: `No broker inventory data found for ${stockCode} - ${brokerCode}`
        });
      }
      
      // Set headers for CSV download
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="broker_inventory_${stockCode}_${brokerCode}.csv"`);
      
      // Send the CSV data directly
      res.send(csvData);
      
      console.log(`📊 CSV downloaded successfully for ${stockCode} - ${brokerCode}: ${lines.length} records`);
      return;
      
    } catch (error) {
      console.error(`❌ Error downloading CSV for ${stockCode} - ${brokerCode}:`, error);
      return res.status(404).json({
        success: false,
        error: `No broker inventory data found for ${stockCode} - ${brokerCode}`
      });
    }
    
  } catch (error) {
    console.error(`❌ Error downloading CSV for ${req.params.stock} - ${req.params.broker}:`, error);
    return res.status(500).json({
      success: false,
      error: `Failed to download CSV for ${req.params.stock} - ${req.params.broker}`
    });
  }
});

export default router;
