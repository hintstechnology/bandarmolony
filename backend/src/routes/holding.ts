import { Router } from 'express';
import { downloadText } from '../utils/azureBlob';

const router = Router();

/**
 * Get holding/shareholding data for a specific stock
 * Returns breakdown of local vs foreign ownership by investor type
 */
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
    console.log(`📊 Getting holding data for: ${stockCode}`);
    
    // Holding files are in holding/{STOCK}.csv
    const filePath = `holding/${stockCode}.csv`;
    
    try {
      const csvData = await downloadText(filePath);
      
      // Parse CSV data
      const lines = csvData.split('\n').filter(line => line.trim());
      if (lines.length === 0) {
        return res.status(404).json({
          success: false,
          error: `No holding data found for ${stockCode}`
        });
      }
      
      const headers = lines[0]?.split(',') || [];
      const data = lines.slice(1).map(line => {
        const values = line.split(',');
        const row: any = {};
        headers.forEach((header, index) => {
          const value = values[index]?.trim() || '';
          // Numeric fields: all values except date fields
          if (header !== 'date' && header !== 'lastUpdatedDate' && header !== 'lastUpdatedTime') {
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
      
      // Data is sorted ascending by date (oldest first)
      // Sort by date to ensure correct order
      filteredData.sort((a, b) => {
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        return dateA.getTime() - dateB.getTime();
      });
      
      console.log(`📊 Retrieved ${filteredData.length} holding records for ${stockCode}`);
      
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
      console.error(`❌ Error getting holding data for ${stockCode}:`, error);
      return res.status(404).json({
        success: false,
        error: `No holding data found for ${stockCode}`
      });
    }
    
  } catch (error) {
    console.error(`❌ Error getting holding data for ${req.params.code}:`, error);
    return res.status(500).json({
      success: false,
      error: `Failed to get holding data for ${req.params.code}`
    });
  }
});

export default router;

