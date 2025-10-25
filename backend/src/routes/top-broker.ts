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
 * Get top brokers based on netbuyvol from broker_summary CSV files
 * Returns: brokercode, netbuyvol, totalvol (buyervol + sellervol)
 * Sorted by netbuyvol descending (largest to smallest)
 */
router.get('/', async (req, res) => {
  try {
    // Validate query parameters
    const { date } = topBrokerQuerySchema.parse(req.query);
    
    // Use current date if not provided
    const targetDate = date || new Date().toISOString().slice(0, 10).replace(/-/g, '');
    
    console.log(`Fetching top brokers for date: ${targetDate}`);
    
    // Get ALLSUM file from broker_summary directory
    const filename = `broker_summary/broker_summary_${targetDate}/ALLSUM.csv`;
    console.log(`Looking for file: ${filename}`);
    
    // Download CSV data from Azure
    const csvData = await downloadText(filename);
    
    if (!csvData) {
      console.log(`File not found: ${filename}`);
      return res.status(404).json({
        success: false,
        error: `No broker summary data found for date ${targetDate}`
      });
    }
    
    console.log(`File found, size: ${csvData.length} characters`);
    
    // Parse CSV data
    const lines = csvData.trim().split('\n');
    if (lines.length < 2) {
      return res.status(404).json({
        success: false,
        error: 'Invalid broker summary data format'
      });
    }
    
    const headers = lines[0]?.split(',').map(h => h.trim()) || [];
    const brokerData = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i]?.split(',').map(v => v.trim()) || [];
      if (values.length !== headers.length) continue;
      
      const row: any = {};
      headers.forEach((header, index) => {
        const value = values[index];
        // Convert numeric fields
        if (['BuyerVol', 'SellerVol', 'NetBuyVol'].includes(header)) {
          row[header] = parseFloat(value || '0') || 0;
        } else {
          row[header] = value || '';
        }
      });
      
      // Only include rows with valid broker code and netbuyvol
      if (row.BrokerCode && row.NetBuyVol !== undefined) {
        brokerData.push({
          brokercode: row.BrokerCode,
          netbuyvol: row.NetBuyVol,
          totalvol: (row.BuyerVol || 0) + (row.SellerVol || 0)
        });
      }
    }
    
    // Sort by netbuyvol descending (largest to smallest)
    brokerData.sort((a, b) => b.netbuyvol - a.netbuyvol);
    
    console.log(`Found ${brokerData.length} brokers for date ${targetDate}`);
    
    return res.json({
      success: true,
      data: {
        brokers: brokerData,
        date: targetDate,
        count: brokerData.length
      }
    });
    
  } catch (error) {
    console.error('Top broker route error:', error);
    
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
