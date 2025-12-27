import express from 'express';
import { downloadText } from '../utils/azureBlob';

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

// Build sector mapping from csv_input/sector_mapping.csv
async function buildSectorMappingFromCsv(): Promise<void> {
  try {
    console.log('🔍 Building sector mapping from csv_input/sector_mapping.csv...');

    // Load sector mapping from CSV file
    const csvData = await downloadText('csv_input/sector_mapping.csv');
    const lines = csvData.split('\n')
      .map(line => line.trim())
      .filter(line => line && line.length > 0);

    // Clear existing mapping
    Object.keys(SECTOR_MAPPING).forEach(sector => {
      SECTOR_MAPPING[sector] = [];
    });

    // Parse CSV data (skip header row: "sector,emiten")
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      // Simple CSV parsing: split by comma
      const values = line.split(',').map(v => v.trim());

      if (values.length >= 2) {
        const sector = values[0] || '';
        const emiten = values[1] || '';

        if (sector && emiten) {
          if (!SECTOR_MAPPING[sector]) {
            SECTOR_MAPPING[sector] = [];
          }
          // Avoid duplicates
          if (!SECTOR_MAPPING[sector].includes(emiten)) {
            SECTOR_MAPPING[sector].push(emiten);
          }
        }
      }
    }

    console.log('📊 Sector mapping built successfully from CSV');
    console.log(`📊 Found ${Object.keys(SECTOR_MAPPING).length} sectors with total ${Object.values(SECTOR_MAPPING).flat().length} emitens`);

  } catch (error) {
    console.warn('⚠️ Could not build sector mapping from CSV:', error);
    console.log('⚠️ Using default sector mapping');

    // Initialize with default sectors if CSV fails
    Object.keys(SECTOR_MAPPING).forEach(sector => {
      SECTOR_MAPPING[sector] = [];
    });
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
    // Build sector mapping first
    await buildSectorMappingFromCsv();

    // Get all stocks from sector mapping
    const allStocks: string[] = [];
    Object.values(SECTOR_MAPPING).forEach(stocks => {
      allStocks.push(...stocks);
    });

    const stocks = allStocks
      .filter(stock => stock.length === 4) // Only 4-character stock codes
      .sort();

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
 * GET /api/stock/emiten-list
 * Get list of emiten codes from csv_input/emiten_list.csv
 */
router.get('/emiten-list', async (_req, res) => {
  try {
    console.log('📊 Fetching emiten list from csv_input/emiten_list.csv...');

    // Download CSV data from Azure
    const csvData = await downloadText('csv_input/emiten_list.csv');

    if (!csvData) {
      console.log('❌ Emiten list file not found');
      return res.status(404).json({
        success: false,
        error: 'Emiten list file not found'
      });
    }

    // Parse CSV data
    const lines = csvData.split('\n').filter(line => line.trim());
    const stocks: string[] = [];

    // Skip header row if exists, process data rows
    // Assuming CSV format: either just stock codes or has a header like "code" or "emiten"
    const firstLine = lines[0]?.trim().toUpperCase();
    const hasHeader = firstLine === 'CODE' || firstLine === 'EMITEN' || firstLine === 'STOCK';
    const startIndex = hasHeader ? 1 : 0;

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i]?.trim();
      if (line && line.length > 0) {
        // Handle CSV with potential comma-separated values (take first column)
        const stockCode = line.split(',')[0]?.trim().toUpperCase();
        if (stockCode && stockCode.length === 4) {
          stocks.push(stockCode);
        }
      }
    }

    // Remove duplicates and sort
    const uniqueStocks = Array.from(new Set(stocks)).sort();

    console.log(`✅ Loaded ${uniqueStocks.length} emiten codes from CSV`);

    return res.json({
      success: true,
      data: {
        stocks: uniqueStocks,
        total: uniqueStocks.length
      }
    });

  } catch (error: any) {
    console.error('❌ Error fetching emiten list:', error);
    console.error('Error details:', {
      error: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch emiten list'
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


    // Build sector mapping first
    await buildSectorMappingFromCsv();

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
    filteredData.sort((a, b) => {
      const dateA = a.Date || '';
      const dateB = b.Date || '';
      return dateA.localeCompare(dateB);
    });


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

    // Build sector mapping first
    await buildSectorMappingFromCsv();

    const results: any[] = [];

    for (const stockCode of stockCodes) {
      if (stockCode.length !== 4) continue;

      try {
        // Get sector for this stock
        const sector = getSectorForEmiten(stockCode.toUpperCase());
        const filePath = `stock/${sector}/${stockCode.toUpperCase()}.csv`;


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
        filteredData.sort((a, b) => {
          const dateA = a.Date || '';
          const dateB = b.Date || '';
          return dateA.localeCompare(dateB);
        });

        results.push({
          stockCode: stockCode.toUpperCase(),
          data: filteredData,
          total: filteredData.length
        });

      } catch (error) {
        console.error(`Error processing ${stockCode}:`, error);
      }
    }


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


    // Build sector mapping first
    await buildSectorMappingFromCsv();

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

/**
 * GET /api/stock/sector-mapping
 * Get sector mapping (stock code -> sector name)
 */
router.get('/sector-mapping', async (_req, res) => {
  try {

    // Build sector mapping first
    await buildSectorMappingFromCsv();

    // Build reverse mapping: stock -> sector
    const stockToSector: { [stock: string]: string } = {};
    for (const [sector, stocks] of Object.entries(SECTOR_MAPPING)) {
      stocks.forEach(stock => {
        stockToSector[stock.toUpperCase()] = sector;
      });
    }

    // Also get list of all sectors
    const sectors = Object.keys(SECTOR_MAPPING).filter(sector => SECTOR_MAPPING[sector] && SECTOR_MAPPING[sector].length > 0);

    // Add IDX as a special sector (for aggregate index data)
    // IDX is not a regular stock but an aggregated index, so it should appear as a sector
    if (!SECTOR_MAPPING['IDX']) {
      SECTOR_MAPPING['IDX'] = ['IDX'];
    }
    if (!sectors.includes('IDX')) {
      sectors.push('IDX');
    }

    return res.json({
      success: true,
      data: {
        stockToSector,
        sectors: sectors.sort(),
        sectorMapping: SECTOR_MAPPING
      }
    });

  } catch (error) {
    console.error('❌ Error getting sector mapping:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get sector mapping'
    });
  }
});

// ============================================================================
// Stock List with Company Names (from stock-list.ts)
// ============================================================================

interface StockDetail {
  code: string;
  companyName: string;
  listingDate?: string;
  shares?: string;
  listingBoard?: string;
}

// Helper function to parse CSV line with quoted fields
function parseCsvLineWithQuotes(line: string): string[] {
  const values: string[] = [];
  let currentValue = '';
  let inQuotes = false;

  for (let j = 0; j < line.length; j++) {
    const char = line[j];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(currentValue.trim());
      currentValue = '';
    } else {
      currentValue += char;
    }
  }
  values.push(currentValue.trim()); // Add last value
  return values;
}

// Handler function for stock list with company names (shared logic)
async function handleStockListWithCompany(_req: express.Request, res: express.Response) {
  try {

    // Download CSV data from Azure
    const blobName = 'csv_input/emiten_detail_list.csv';
    const csvData = await downloadText(blobName);

    // Parse CSV data
    const lines = csvData.split('\n').filter(line => line.trim());
    if (lines.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No data found in emiten_detail_list.csv'
      });
    }

    const headers = lines[0]?.split(',').map(h => h.trim()) || [];
    const stocks: StockDetail[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]?.trim();

      // Skip empty lines or lines with only commas
      if (!line || line === '' || /^,+\s*$/.test(line)) {
        continue;
      }

      // Parse CSV line - handle quoted fields
      const values = parseCsvLineWithQuotes(line);

      if (values.length >= headers.length) {
        const row: any = {};
        headers.forEach((header, index) => {
          row[header] = values[index] || '';
        });

        const stockDetail: StockDetail = {
          code: row.Code || row.code || '',
          companyName: row['Company Name'] || row.CompanyName || row.companyName || '',
          listingDate: row['Listing Date'] || row.ListingDate || row.listingDate || '',
          shares: row.Shares || row.shares || '',
          listingBoard: row['Listing Board'] || row.ListingBoard || row.listingBoard || ''
        };

        // Only add if we have at least code
        if (stockDetail.code && stockDetail.code.length === 4) {
          stocks.push(stockDetail);
        }
      }
    }

    // Sort by code
    stocks.sort((a, b) => a.code.localeCompare(b.code));


    return res.json({
      success: true,
      data: {
        stocks,
        total: stocks.length,
        generated_at: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Error getting stock list with company names:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get stock list with company names'
    });
  }
}

// Handler function for stock detail (shared logic)
async function handleStockDetail(req: express.Request, res: express.Response) {
  try {
    const { stockCode } = req.params;

    if (!stockCode || stockCode.length !== 4) {
      return res.status(400).json({
        success: false,
        error: 'Invalid stock code. Must be 4 characters.'
      });
    }


    // Download CSV data from Azure
    const blobName = 'csv_input/emiten_detail_list.csv';
    const csvData = await downloadText(blobName);

    // Parse CSV data
    const lines = csvData.split('\n').filter(line => line.trim());
    if (lines.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No data found in emiten_detail_list.csv'
      });
    }

    const headers = lines[0]?.split(',').map(h => h.trim()) || [];
    let stockDetail: StockDetail | null = null;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]?.trim();

      // Skip empty lines
      if (!line || line === '' || /^,+\s*$/.test(line)) {
        continue;
      }

      // Parse CSV line - handle quoted fields
      const values = parseCsvLineWithQuotes(line);

      if (values.length >= headers.length) {
        const row: any = {};
        headers.forEach((header, index) => {
          row[header] = values[index] || '';
        });

        const code = row.Code || row.code || '';

        if (code.toUpperCase() === stockCode.toUpperCase()) {
          stockDetail = {
            code: code,
            companyName: row['Company Name'] || row.CompanyName || row.companyName || '',
            listingDate: row['Listing Date'] || row.ListingDate || row.listingDate || '',
            shares: row.Shares || row.shares || '',
            listingBoard: row['Listing Board'] || row.ListingBoard || row.listingBoard || ''
          };
          break;
        }
      }
    }

    if (!stockDetail) {
      return res.status(404).json({
        success: false,
        error: `Stock ${stockCode} not found in emiten_detail_list.csv`
      });
    }


    return res.json({
      success: true,
      data: stockDetail
    });

  } catch (error) {
    console.error('❌ Error getting stock details:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get stock details'
    });
  }
}

/**
 * GET /api/stock/list-with-company
 * Get list of stocks with company names (alternative path)
 */
router.get('/list-with-company', async (_req, res) => {
  return handleStockListWithCompany(_req, res);
});

/**
 * GET /api/stock/company/:stockCode
 * Get stock details for a specific stock code (alternative path)
 */
router.get('/company/:stockCode', async (req, res) => {
  return handleStockDetail(req, res);
});

/**
 * GET /api/stock-list/ (root path - must be last to avoid conflicts)
 * Get list of stocks with company names from emiten_detail_list.csv
 * Note: This route is mounted at /api/stock-list, so / becomes the root
 */
router.get('/', async (_req, res) => {
  return handleStockListWithCompany(_req, res);
});

/**
 * GET /api/stock-list/:stockCode (must be after / to avoid conflicts)
 * Get stock details for a specific stock code
 * Note: This route is mounted at /api/stock-list, so :stockCode becomes the param
 * IMPORTANT: This must be the last route to avoid conflicts with other routes like /list, /data, etc.
 */
router.get('/:stockCode', async (req, res, next) => {
  // Check if this is a valid stock code (4 characters) to avoid conflicts with other routes
  const { stockCode } = req.params;
  // Only handle if it's a 4-character alphanumeric code (valid stock code)
  if (stockCode && stockCode.length === 4 && /^[A-Z0-9]{4}$/i.test(stockCode)) {
    return handleStockDetail(req, res);
  }
  // If not a valid stock code, pass to next middleware (might be handled by other routes)
  return next();
});

export default router;
