import { Router } from 'express';
import { downloadText } from '../utils/azureBlob';
import { z } from 'zod';

const router = Router();

// Validation schema
const topBrokerQuerySchema = z.object({
  date: z.string().regex(/^\d{8}$/, 'Date must be in YYYYMMDD format').optional()
});

/**
 * GET /api/top-broker
 * Get top brokers from top_broker directory (already calculated by top_broker.ts)
 * Path: top_broker/top_broker_{date}/top_broker.csv
 * Data structure: ComprehensiveBrokerData[]
 * Fields: BrokerCode, TotalBrokerVol, TotalBrokerValue, TotalBrokerFreq,
 *         NetBuyVol, NetBuyValue, NetBuyFreq,
 *         SellerVol, SellerValue, SellerFreq,
 *         BuyerVol, BuyerValue, BuyerFreq
 * Already sorted by TotalBrokerValue descending
 */
router.get('/', async (req, res) => {
  try {
    // Validate query parameters
    const { date } = topBrokerQuerySchema.parse(req.query);
    
    // Use current date if not provided
    const targetDate = date || new Date().toISOString().slice(0, 10).replace(/-/g, '');
    
    console.log(`[TopBroker] Fetching top brokers for date: ${targetDate}`);
    
    // Correct path: top_broker/top_broker_{date}/top_broker.csv (with subfolder!)
    const filename = `top_broker/top_broker_${targetDate}/top_broker.csv`;
    console.log(`[TopBroker] Looking for file: ${filename}`);
    
    // Download CSV data from Azure
    const csvData = await downloadText(filename);
    
    if (!csvData) {
      console.log(`[TopBroker] File not found: ${filename}`);
      return res.status(404).json({
        success: false,
        error: `No top broker data found for date ${targetDate}`
      });
    }
    
    console.log(`[TopBroker] File found, size: ${csvData.length} characters`);
    
    // Parse CSV data
    const lines = csvData.trim().split('\n');
    if (lines.length < 2) {
      return res.status(404).json({
        success: false,
        error: 'Invalid top broker data format'
      });
    }
    
    const headers = lines[0]?.split(',').map(h => h.trim()) || [];
    console.log(`[TopBroker] CSV headers:`, headers);
    
    const brokerData = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i]?.split(',').map(v => v.trim()) || [];
      if (values.length !== headers.length) continue;
      
      const row: any = {};
      headers.forEach((header, index) => {
        const value = values[index];
        // Convert numeric fields - match ComprehensiveBrokerData structure
        const numericFields = [
          'TotalBrokerVol', 'TotalBrokerValue', 'TotalBrokerFreq',
          'NetBuyVol', 'NetBuyValue', 'NetBuyFreq',
          'SellerVol', 'SellerValue', 'SellerFreq',
          'BuyerVol', 'BuyerValue', 'BuyerFreq'
        ];
        if (numericFields.includes(header)) {
          row[header] = parseFloat(value || '0') || 0;
        } else {
          row[header] = value || '';
        }
      });
      
      // Map to consistent format - use ComprehensiveBrokerData fields
      const brokerCode = row.BrokerCode || '';
      const netBuyVol = row.NetBuyVol || 0;
      const totalVol = row.TotalBrokerVol || 0; // Use TotalBrokerVol, not TotalVol
      
      // Only include rows with valid broker code
      if (brokerCode) {
        brokerData.push({
          brokercode: brokerCode,
          netbuyvol: netBuyVol,
          totalvol: totalVol
        });
      }
    }
    
    // Data should already be sorted by TotalBrokerValue, but ensure it's sorted by netbuyvol descending
    brokerData.sort((a, b) => b.netbuyvol - a.netbuyvol);
    
    console.log(`[TopBroker] Found ${brokerData.length} brokers for date ${targetDate}`);
    
    return res.json({
      success: true,
      data: {
        brokers: brokerData,
        date: targetDate,
        count: brokerData.length
      }
    });
    
  } catch (error) {
    console.error('[TopBroker] Route error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid query parameters',
        details: error.issues
      });
    }
    
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
