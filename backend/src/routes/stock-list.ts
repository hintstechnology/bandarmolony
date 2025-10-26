import express from 'express';
import { downloadText } from '../utils/azureBlob';

interface StockDetail {
  code: string;
  companyName: string;
  listingDate?: string;
  shares?: string;
  listingBoard?: string;
}

const router = express.Router();

/**
 * Get list of stocks with company names from emiten_detail_list.csv
 */
router.get('/', async (_req, res) => {
  try {
    console.log('📊 Getting stock list with company names...');
    
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
    
    console.log(`📊 Found ${stocks.length} stocks with company names`);
    
    return res.json({
      success: true,
      data: {
        stocks,
        total: stocks.length,
        generated_at: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('❌ Error getting stock list:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get stock list with company names'
    });
  }
});

/**
 * Get stock details for a specific stock code
 */
router.get('/:stockCode', async (req, res) => {
  try {
    const { stockCode } = req.params;
    
    if (!stockCode || stockCode.length !== 4) {
      return res.status(400).json({
        success: false,
        error: 'Invalid stock code. Must be 4 characters.'
      });
    }
    
    console.log(`📊 Getting stock details for: ${stockCode}`);
    
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
    
    console.log(`📊 Found stock details for ${stockCode}: ${stockDetail.companyName}`);
    
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
});

export default router;
