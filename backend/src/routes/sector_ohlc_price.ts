import express from 'express';
import { downloadText } from '../utils/azureBlob';

const router = express.Router();

// Sector to filename mapping
const SECTOR_TO_FILENAME: { [key: string]: string } = {
  'Basic Materials': 'IDXBASIC.csv',
  'Consumer Cyclicals': 'IDXCYCLIC.csv',
  'Consumer Non-Cyclicals': 'IDXNONCYC.csv',
  'Energy': 'IDXENERGY.csv',
  'Financials': 'IDXFINANCE.csv',
  'Healthcare': 'IDXHEALTH.csv',
  'IDX': 'COMPOSITE.csv',
  'Industrials': 'IDXINDUST.csv',
  'Infrastructures': 'IDXINFRA.csv',
  'Properties & Real Estate': 'IDXPROPERT.csv',
  'Technology': 'IDXTECHNO.csv',
  'Transportation & Logistic': 'IDXTRANS.csv'
};

/**
 * Get OHLC price data for a specific sector
 * GET /api/sector-ohlc-price/:sectorName
 * Query params: startDate, endDate, limit
 */
router.get('/:sectorName', async (req, res) => {
  try {
    // Decode sector name from URL (handles URL encoding like %20 for spaces)
    let { sectorName } = req.params;
    sectorName = decodeURIComponent(sectorName);
    const { startDate, endDate, limit } = req.query;
    
    if (!sectorName) {
      return res.status(400).json({
        success: false,
        error: 'Sector name is required'
      });
    }
    
    console.log(`[SectorOHLC] Received request for sector: "${sectorName}"`);
    console.log(`[SectorOHLC] Available sectors in mapping:`, Object.keys(SECTOR_TO_FILENAME));
    
    // Get filename for this sector (case-sensitive match)
    const filename = SECTOR_TO_FILENAME[sectorName];
    
    if (!filename) {
      console.error(`[SectorOHLC] Sector name "${sectorName}" not found in mapping`);
      console.error(`[SectorOHLC] Available sectors:`, Object.keys(SECTOR_TO_FILENAME));
      return res.status(400).json({
        success: false,
        error: `Invalid sector name: "${sectorName}". Supported sectors: ${Object.keys(SECTOR_TO_FILENAME).join(', ')}`
      });
    }
    
    // Path: stock-trading-data/index/{filename}
    const filePath = `stock-trading-data/index/${filename}`;
    
    console.log(`📊 Getting sector OHLC data for: ${sectorName}`);
    console.log(`📊 Looking for file: ${filePath}`);
    
    // Download CSV data from Azure
    let csvData: string;
    try {
      csvData = await downloadText(filePath);
    } catch (error: any) {
      console.error(`[SectorOHLC] Error downloading from Azure:`, error);
      return res.status(404).json({
        success: false,
        error: `No OHLC data found for sector ${sectorName}`,
        path: filePath
      });
    }
    
    if (!csvData) {
      return res.status(404).json({
        success: false,
        error: `No OHLC data found for sector ${sectorName}`,
        path: filePath
      });
    }
    
    console.log(`[SectorOHLC] File found, size: ${csvData.length} characters`);
    
    // Parse CSV data
    const lines = csvData.split('\n').filter(line => line.trim());
    if (lines.length < 2) {
      return res.status(404).json({
        success: false,
        error: 'Invalid sector OHLC data format'
      });
    }
    
    const headers = lines[0]?.split(',').map(h => h.trim()) || [];
    console.log(`[SectorOHLC] CSV headers: ${headers.join(', ')}`);
    
    const data = lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim());
      const row: any = {};
      headers.forEach((header, index) => {
        const value = values[index] || '';
        // Convert numeric fields
        if (['Open', 'High', 'Low', 'Close', 'Volume', 'Value', 'Frequency', 'ChangePercent'].includes(header)) {
          row[header] = parseFloat(value) || 0;
        } else {
          row[header] = value;
        }
      });
      return row;
    });
    
    // Apply date filtering if provided
    let filteredData = data;
    if (startDate || endDate) {
      filteredData = data.filter(row => {
        const rowDate = row.Date || '';
        if (startDate && rowDate < String(startDate)) return false;
        if (endDate && rowDate > String(endDate)) return false;
        return true;
      });
    }
    
    // Apply limit if provided
    if (limit) {
      const limitNum = parseInt(String(limit));
      if (limitNum > 0) {
        filteredData = filteredData.slice(-limitNum); // Get last N records
      }
    }
    
    // Sort by date (oldest first)
    filteredData.sort((a, b) => {
      const dateA = a.Date || '';
      const dateB = b.Date || '';
      return dateA.localeCompare(dateB);
    });
    
    return res.json({
      success: true,
      data: {
        sectorName,
        headers,
        data: filteredData,
        total: filteredData.length,
        generated_at: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error(`❌ Error getting sector OHLC data for ${req.params.sectorName}:`, error);
    return res.status(500).json({
      success: false,
      error: `Failed to get sector OHLC data for ${req.params.sectorName}`
    });
  }
});

export default router;

