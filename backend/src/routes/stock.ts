import express from 'express';
import { downloadText, listPaths } from '../utils/azureBlob';

// Sector mapping (same as stockDataUpdateService.ts)
const SECTOR_MAPPING: { [key: string]: string[] } = {
  'Basic Materials': [],
  'Consumer Cyclicals': [],
  'Consumer Non-Cyclicals': [],
  'Energy': [],
  'Financials': [],
  'Healthcare': [],
  'Industrials': [],
  'Infrastructures': [],
  'Properties & Real Estate': [],
  'Technology': [],
  'Transportation & Logistic': []
};

// Build sector mapping from Azure Storage
async function buildSectorMappingFromAzure(): Promise<void> {
  console.log('🔍 Building sector mapping from Azure Storage...');
  
  try {
    const stockBlobs = await listPaths({ prefix: 'stock/' });
    
    Object.keys(SECTOR_MAPPING).forEach(sector => {
      SECTOR_MAPPING[sector] = [];
    });
    
    for (const blobName of stockBlobs) {
      const pathParts = blobName.replace('stock/', '').split('/');
      if (pathParts.length === 2 && pathParts[0] && pathParts[1]) {
        const sector = pathParts[0];
        const emiten = pathParts[1].replace('.csv', '');
        
        if (SECTOR_MAPPING[sector]) {
          SECTOR_MAPPING[sector].push(emiten);
        }
      }
    }
    
    console.log('📊 Sector mapping built successfully');
  } catch (error) {
    console.warn('⚠️ Could not build sector mapping from Azure, using default');
  }
}

// Get sector for emiten using mapping
function getSectorForEmiten(emiten: string): string {
  // Check if emiten already exists in mapping
  for (const [sector, emitens] of Object.entries(SECTOR_MAPPING)) {
    if (emitens.includes(emiten)) {
      return sector;
    }
  }
  
  // If not found, distribute based on hash
  const sectors = Object.keys(SECTOR_MAPPING);
  if (sectors.length === 0) {
    return 'Technology'; // Default fallback
  }
  
  const hash = emiten.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0);
  
  return sectors[Math.abs(hash) % sectors.length] || 'Technology';
}

const router = express.Router();

/**
 * Get list of available stocks
 */
router.get('/list', async (_req, res) => {
  try {
    console.log('📊 Getting list of available stocks...');
    
    // Build sector mapping first
    await buildSectorMappingFromAzure();
    
    // Get all stocks from sector mapping
    const allStocks: string[] = [];
    Object.values(SECTOR_MAPPING).forEach(stocks => {
      allStocks.push(...stocks);
    });
    
    const stocks = allStocks
      .filter(stock => stock.length === 4) // Only 4-character stock codes
      .sort();
    
    console.log(`📊 Found ${stocks.length} stocks:`, stocks.slice(0, 10), '...');
    
    return res.json({
      success: true,
      data: {
        stocks,
        total: stocks.length
      }
    });
    
  } catch (error) {
    console.error('❌ Error getting stock list:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get stock list'
    });
  }
});

/**
 * Get OHLC data for a specific stock
 */
router.get('/data/:stockCode', async (req, res) => {
  try {
    const { stockCode } = req.params;
    const { startDate, endDate, limit } = req.query;
    
    if (!stockCode || stockCode.length !== 4) {
      return res.status(400).json({
        success: false,
        error: 'Invalid stock code. Must be 4 characters.'
      });
    }
    
    console.log(`📊 Getting OHLC data for stock: ${stockCode}`);
    
    // Build sector mapping first
    await buildSectorMappingFromAzure();
    
    // Get sector for this stock
    const sector = getSectorForEmiten(stockCode.toUpperCase());
    const filePath = `stock/${sector}/${stockCode.toUpperCase()}.csv`;
    
    console.log(`📊 Using sector: ${sector} for stock: ${stockCode}`);
    
    // Download CSV data from Azure
    const csvData = await downloadText(filePath);
    
    // Parse CSV data
    const lines = csvData.split('\n').filter(line => line.trim());
    if (lines.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No data found for this stock'
      });
    }
    
    const headers = lines[0]?.split(',') || [];
    const data = lines.slice(1).map(line => {
      const values = line.split(',');
      const row: any = {};
      headers.forEach((header, index) => {
        const value = values[index]?.trim() || '';
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
        if (startDate && rowDate < startDate) return false;
        if (endDate && rowDate > endDate) return false;
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
    filteredData.sort((a, b) => a.Date.localeCompare(b.Date));
    
    console.log(`📊 Parsed ${stockCode} data: ${filteredData.length} rows`);
    
    return res.json({
      success: true,
      data: {
        stockCode: stockCode.toUpperCase(),
        headers,
        data: filteredData,
        total: filteredData.length,
        generated_at: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error(`❌ Error getting stock data for ${req.params.stockCode}:`, error);
    return res.status(500).json({
      success: false,
      error: `Failed to get stock data for ${req.params.stockCode}`
    });
  }
});

/**
 * Get OHLC data for multiple stocks
 */
router.get('/data', async (req, res) => {
  try {
    const { stocks, startDate, endDate, limit } = req.query;
    
    if (!stocks) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: stocks'
      });
    }
    
    const stockCodes = Array.isArray(stocks) ? stocks as string[] : [stocks as string];
    console.log(`📊 Getting OHLC data for stocks:`, stockCodes);
    
    // Build sector mapping first
    await buildSectorMappingFromAzure();
    
    const results: any[] = [];
    
    for (const stockCode of stockCodes) {
      if (stockCode.length !== 4) continue;
      
      try {
        // Get sector for this stock
        const sector = getSectorForEmiten(stockCode.toUpperCase());
        const filePath = `stock/${sector}/${stockCode.toUpperCase()}.csv`;
        
        console.log(`📊 Using sector: ${sector} for stock: ${stockCode}`);
        
        const csvData = await downloadText(filePath);
        
        const lines = csvData.split('\n').filter(line => line.trim());
        if (lines.length === 0) continue;
        
        const headers = lines[0]?.split(',') || [];
        const data = lines.slice(1).map(line => {
          const values = line.split(',');
          const row: any = {};
          headers.forEach((header, index) => {
            const value = values[index]?.trim() || '';
            if (['Open', 'High', 'Low', 'Close', 'Volume', 'Value', 'Frequency', 'ChangePercent'].includes(header)) {
              row[header] = parseFloat(value) || 0;
            } else {
              row[header] = value;
            }
          });
          return row;
        });
        
        // Apply date filtering
        let filteredData = data;
        if (startDate || endDate) {
          filteredData = data.filter(row => {
            const rowDate = row.Date || '';
            if (startDate && rowDate < startDate) return false;
            if (endDate && rowDate > endDate) return false;
            return true;
          });
        }
        
        // Apply limit
        if (limit) {
          const limitNum = parseInt(String(limit));
          if (limitNum > 0) {
            filteredData = filteredData.slice(-limitNum);
          }
        }
        
        // Sort by date
        filteredData.sort((a, b) => a.Date.localeCompare(b.Date));
        
        results.push({
          stockCode: stockCode.toUpperCase(),
          data: filteredData,
          total: filteredData.length
        });
        
      } catch (error) {
        console.error(`Error processing ${stockCode}:`, error);
      }
    }
    
    console.log(`📊 Processed ${results.length} stocks successfully`);
    
    return res.json({
      success: true,
      data: {
        stocks: results,
        total: results.length,
        generated_at: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('❌ Error getting multiple stocks data:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get stocks data'
    });
  }
});

/**
 * Get footprint data for a specific stock and date
 */
router.get('/footprint/:stockCode', async (req, res) => {
  try {
    const { stockCode } = req.params;
    const { date } = req.query;
    
    if (!stockCode || stockCode.length !== 4) {
      return res.status(400).json({
        success: false,
        error: 'Invalid stock code. Must be 4 characters.'
      });
    }
    
    if (!date) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: date (YYYYMMDD format)'
      });
    }
    
    console.log(`📊 Getting footprint data for stock: ${stockCode} on date: ${date}`);
    
    // Look for bid/ask data in done-summary folder
    const dateStr = String(date);
    const dtFileName = `done-summary/${dateStr}/DT${dateStr.slice(2)}.csv`;
    
    try {
      const csvData = await downloadText(dtFileName);
      
      // Parse CSV data with semicolon separator
      const lines = csvData.split('\n').filter(line => line.trim());
      if (lines.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'No transaction data found for this date'
        });
      }
      
      const headers = lines[0]?.split(';') || [];
      const data = lines.slice(1).map(line => {
        const values = line.split(';');
        const row: any = {};
        headers.forEach((header, index) => {
          const value = values[index]?.trim() || '';
          if (['STK_VOLM', 'STK_PRIC'].includes(header)) {
            row[header] = parseFloat(value) || 0;
          } else {
            row[header] = value;
          }
        });
        return row;
      });
      
      // Filter data for the specific stock
      const stockData = data.filter(row => 
        row.STK_CODE === stockCode.toUpperCase()
      );
      
      if (stockData.length === 0) {
        return res.status(404).json({
          success: false,
          error: `No transaction data found for stock ${stockCode} on date ${date}`
        });
      }
      
      // Group by price level and calculate buy/sell frequency
      const priceLevels: { [key: string]: { buy: number; sell: number; price: number } } = {};
      
      stockData.forEach(row => {
        const price = row.STK_PRIC;
        const volume = row.STK_VOLM;
        const trxCode = row.TRX_CODE;
        
        if (!priceLevels[price]) {
          priceLevels[price] = { buy: 0, sell: 0, price: price };
        }
        
        if (trxCode === 'B') {
          priceLevels[price].buy += volume;
        } else if (trxCode === 'S') {
          priceLevels[price].sell += volume;
        }
      });
      
      // Convert to array format for frontend
      const footprintData = Object.values(priceLevels).map(level => ({
        price: level.price,
        bFreq: level.buy,
        sFreq: level.sell
      })).sort((a, b) => b.price - a.price); // Sort by price descending
      
      console.log(`📊 Generated footprint data: ${footprintData.length} price levels`);
      
      return res.json({
        success: true,
        data: {
          stockCode: stockCode.toUpperCase(),
          date: date,
          footprintData,
          total: footprintData.length,
          generated_at: new Date().toISOString()
        }
      });
      
    } catch (error) {
      console.error(`Error loading footprint data for ${stockCode}:`, error);
      return res.status(404).json({
        success: false,
        error: `No footprint data found for stock ${stockCode} on date ${date}`
      });
    }
    
  } catch (error) {
    console.error(`❌ Error getting footprint data for ${req.params.stockCode}:`, error);
    return res.status(500).json({
      success: false,
      error: `Failed to get footprint data for ${req.params.stockCode}`
    });
  }
});

/**
 * Get latest available date for a specific stock
 */
router.get('/latest-date/:stockCode', async (req, res) => {
  try {
    const { stockCode } = req.params;
    
    if (!stockCode || stockCode.length !== 4) {
      return res.status(400).json({
        success: false,
        error: 'Invalid stock code. Must be 4 characters.'
      });
    }
    
    console.log(`📊 Getting latest available date for stock: ${stockCode}`);
    
    // Build sector mapping first
    await buildSectorMappingFromAzure();
    
    // Get sector for this stock
    const sector = getSectorForEmiten(stockCode.toUpperCase());
    const filePath = `stock/${sector}/${stockCode.toUpperCase()}.csv`;
    
    console.log(`📊 Using sector: ${sector} for stock: ${stockCode}`);
    
    try {
      // Download CSV data from Azure
      const csvData = await downloadText(filePath);
      
      // Parse CSV to find latest date (get MAXIMUM date, not last row)
      const lines = csvData.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        return res.status(404).json({
          success: false,
          error: `No data found for stock ${stockCode}`
        });
      }
      
      // Get headers
      const headers = lines[0]?.split(',') || [];
      const dateIndex = headers.indexOf('Date');
      
      if (dateIndex === -1) {
        return res.status(404).json({
          success: false,
          error: 'Date column not found in stock data'
        });
      }
      
      // Collect all dates and find the LATEST (maximum date)
      // Don't rely on row position - CSV might not be sorted
      let latestDate: string | null = null;
      
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i]?.split(',') || [];
        if (line.length > dateIndex) {
          const date = line[dateIndex]?.trim();
          if (date) {
            // Compare dates as strings (YYYY-MM-DD format sorts correctly)
            if (!latestDate || date > latestDate) {
              latestDate = date;
            }
          }
        }
      }
      
      if (!latestDate) {
        return res.status(404).json({
          success: false,
          error: 'Could not determine latest date'
        });
      }
      
      console.log(`📊 Latest available date for ${stockCode}: ${latestDate}`);
      
      return res.json({
        success: true,
        data: {
          stockCode: stockCode.toUpperCase(),
          latestDate,
          generated_at: new Date().toISOString()
        }
      });
      
    } catch (error) {
      console.error(`❌ Error reading stock file for ${stockCode}:`, error);
      return res.status(404).json({
        success: false,
        error: `Stock data not found for ${stockCode}`
      });
    }
    
  } catch (error) {
    console.error('❌ Error getting latest date:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get latest date'
    });
  }
});

export default router;
