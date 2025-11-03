import express from 'express';
import { BrokerInventoryCalculator } from '../calculations/broker/broker_inventory';
import { downloadText } from '../utils/azureBlob';
import { z } from 'zod';

const router = express.Router();
const brokerInventoryCalculator = new BrokerInventoryCalculator();

// Validation schemas
const brokerInventoryParamsSchema = z.object({
  stockCode: z.string().min(1, 'Stock code is required'),
  brokerCode: z.string().min(1, 'Broker code is required')
});

/**
 * GET /api/broker-inventory/brokers/:stockCode
 * Get list of available brokers for a specific stock from broker_inventory folder
 * IMPORTANT: This route must be BEFORE /:stockCode/:brokerCode to avoid route conflict
 */
router.get('/brokers/:stockCode', async (req, res) => {
  try {
    const { stockCode } = req.params;
    const stockCodeUpper = stockCode.toUpperCase();
    
    console.log(`[BrokerInventory] Listing brokers for stock: ${stockCodeUpper}`);
    
    // List all files in broker_inventory/{stockCode}/ folder
    const prefix = `broker_inventory/${stockCodeUpper}/`;
    const { listPaths } = await import('../utils/azureBlob');
    const files = await listPaths({ prefix });
    
    // Extract broker codes from filenames (broker_inventory/{stockCode}/{brokerCode}.csv)
    const brokers = new Set<string>();
    for (const file of files) {
      const fileName = file.replace(prefix, '').replace('.csv', '');
      if (fileName && fileName.length > 0) {
        brokers.add(fileName.toUpperCase());
      }
    }
    
    const brokersList = Array.from(brokers).sort();
    
    console.log(`[BrokerInventory] Found ${brokersList.length} brokers for ${stockCodeUpper}`);
    
    return res.json({
      success: true,
      data: {
        stockCode: stockCodeUpper,
        brokers: brokersList,
        count: brokersList.length
      }
    });
  } catch (error: any) {
    console.error('[BrokerInventory] Error listing brokers:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid parameters',
        details: error.issues
      });
    }
    
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to list brokers'
    });
  }
});

/**
 * GET /api/broker-inventory/:stockCode/:brokerCode
 * Get broker inventory data for a specific stock and broker
 * Path: broker_inventory/{stockCode}/{brokerCode}.csv
 * Format: Date,NetBuyVol,CumulativeNetBuyVol
 */
router.get('/:stockCode/:brokerCode', async (req, res) => {
  try {
    const { stockCode, brokerCode } = brokerInventoryParamsSchema.parse(req.params);
    
    // Path structure: broker_inventory/{STOCK}/{BROKER}.csv
    const filename = `broker_inventory/${stockCode.toUpperCase()}/${brokerCode.toUpperCase()}.csv`;
    
    console.log(`[BrokerInventory] Fetching data for stock ${stockCode}, broker ${brokerCode}`);
    console.log(`[BrokerInventory] Looking for file: ${filename}`);
    
    // Download CSV data from Azure
    const csvData = await downloadText(filename);
    
    if (!csvData) {
      console.log(`[BrokerInventory] File not found: ${filename}`);
      return res.status(404).json({
        success: false,
        error: `No broker inventory data found for ${stockCode}/${brokerCode}`
      });
    }
    
    console.log(`[BrokerInventory] File found, size: ${csvData.length} characters`);
    
    // Parse CSV data
    const lines = csvData.trim().split('\n');
    if (lines.length < 2) {
      return res.status(404).json({
        success: false,
        error: 'Invalid broker inventory data format'
      });
    }
    
    const headers = lines[0]?.split(',').map(h => h.trim()) || [];
    console.log(`[BrokerInventory] CSV headers: ${headers.join(', ')}`);
    
    const inventoryData = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i]?.split(',').map(v => v.trim()) || [];
      if (values.length !== headers.length) continue;
      
      const row: any = {};
      headers.forEach((header, index) => {
        const value = values[index];
        // Convert numeric fields
        if (['NetBuyVol', 'CumulativeNetBuyVol'].includes(header)) {
          row[header] = parseFloat(value || '0') || 0;
        } else {
          row[header] = value || '';
        }
      });
      
      inventoryData.push(row);
    }
    
    console.log(`[BrokerInventory] Parsed ${inventoryData.length} records for ${stockCode}/${brokerCode}`);
    
    return res.json({
      success: true,
      data: {
        stockCode: stockCode.toUpperCase(),
        brokerCode: brokerCode.toUpperCase(),
        inventoryData
      }
    });
    
  } catch (error: any) {
    console.error('[BrokerInventory] Error fetching broker inventory data:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid parameters',
        details: error.issues
      });
    }
    
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch broker inventory data'
    });
  }
});

/**
 * POST /api/broker-inventory/generate
 * Generate broker inventory data
 */
router.post('/generate', async (_req, res) => {
  try {
    console.log('🔄 Starting broker inventory data generation...');
    
    const dateSuffix = new Date().toISOString().split('T')[0]?.replace(/-/g, '') || '';
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
 * GET /api/broker-inventory/status
 * Get broker inventory data status
 */
router.get('/status', async (_req, res) => {
  try {
    // For now, just return a simple status
    // In the future, this could check if data exists in Azure
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

export default router;
