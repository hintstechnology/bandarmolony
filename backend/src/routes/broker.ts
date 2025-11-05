import { Router } from 'express';
import { downloadText } from '../utils/azureBlob';
import { z } from 'zod';

const router = Router();

// Validation schemas
const brokerSummaryParamsSchema = z.object({
  stockCode: z.string().min(1, 'Stock code is required')
});

const brokerSummaryQuerySchema = z.object({
  date: z.string().regex(/^\d{8}$/, 'Date must be in YYYYMMDD format')
});

const brokerTransactionParamsSchema = z.object({
  brokerCode: z.string().min(1, 'Broker code is required')
});

const brokerTransactionQuerySchema = z.object({
  date: z.string().regex(/^\d{8}$/, 'Date must be in YYYYMMDD format')
});

/**
 * GET /api/broker/list
 * Get list of available brokers from csv_input/broker_list.csv
 */
router.get('/list', async (_req, res) => {
  try {
    console.log('Fetching broker list from csv_input/broker_list.csv');
    
    // Download CSV data from Azure
    const csvData = await downloadText('csv_input/broker_list.csv');
    
    if (!csvData) {
      console.log('Broker list file not found, using fallback list');
      // Fallback to hardcoded list
      const fallbackBrokers = ['MG','CIMB','UOB','COIN','NH','TRIM','DEWA','BNCA','PNLF','VRNA','SD','LMGA','DEAL','ESA','SSA'];
      return res.json({
        success: true,
        data: {
          brokers: fallbackBrokers,
          total: fallbackBrokers.length
        }
      });
    }
    
    // Parse CSV data
    const lines = csvData.split('\n').filter(line => line.trim());
    const brokers: string[] = [];
    
    // Skip header row, process data rows
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (line && line.trim()) {
        const brokerCode = line.trim();
        if (brokerCode) {
          brokers.push(brokerCode);
        }
      }
    }
    
    console.log(`Found ${brokers.length} brokers in CSV file`);
    
    return res.json({
      success: true,
      data: {
        brokers: brokers,
        total: brokers.length
      }
    });
    
  } catch (error: any) {
    console.error('Error fetching broker list:', error);
    console.error('Error details:', {
      error: error.message,
      stack: error.stack
    });
    
    // Fallback to hardcoded list on error
    const fallbackBrokers = ['MG','CIMB','UOB','COIN','NH','TRIM','DEWA','BNCA','PNLF','VRNA','SD','LMGA','DEAL','ESA','SSA'];
    return res.json({
      success: true,
      data: {
        brokers: fallbackBrokers,
        total: fallbackBrokers.length
      }
    });
  }
});

/**
 * GET /api/broker/summary/:stockCode
 * Get broker summary data for a specific stock and date
 */
router.get('/summary/:stockCode', async (req, res) => {
  try {
    const { stockCode } = brokerSummaryParamsSchema.parse(req.params);
    const { date } = brokerSummaryQuerySchema.parse(req.query);
    
    // Convert YYYYMMDD to YYYYMMDD format for file path
    const dateStr = date;
    const filename = `broker_summary/broker_summary_${dateStr}/${stockCode}.csv`;
    
    console.log(`Fetching broker summary data for ${stockCode} on ${dateStr}`);
    console.log(`Looking for file: ${filename}`);
    
    // Download CSV data from Azure
    const csvData = await downloadText(filename);
    
    if (!csvData) {
      console.log(`File not found: ${filename}`);
      return res.status(404).json({
        success: false,
        error: `No broker summary data found for ${stockCode} on ${dateStr}`
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
        if (['BuyerVol', 'BuyerValue', 'SellerVol', 'SellerValue', 'NetBuyVol', 'NetBuyValue', 'BuyerAvg', 'SellerAvg'].includes(header)) {
          row[header] = parseFloat(value || '0') || 0;
        } else {
          row[header] = value || '';
        }
      });
      
      // Map backend columns to frontend format
      const mappedRow = {
        broker: row.BrokerCode || '',
        nblot: row.NetBuyVol || 0,        // Net Buy Lot
        nbval: row.NetBuyValue || 0,      // Net Buy Value
        bavg: row.BuyerAvg || 0,          // Buyer Average
        sl: row.SellerVol || 0,           // Seller Lot
        nslot: -(row.SellerVol || 0),     // Net Sell Lot (negative)
        nsval: -(row.SellerValue || 0),   // Net Sell Value (negative)
        savg: row.SellerAvg || 0          // Seller Average
      };
      
      brokerData.push(mappedRow);
    }
    
    return res.json({
      success: true,
      data: {
        stockCode,
        date: dateStr,
        brokerData
      }
    });
    
  } catch (error: any) {
    console.error('Error fetching broker summary data:', error);
    console.error('Error details:', {
      stockCode: req.params.stockCode,
      date: req.query['date'],
      filename: `broker_summary/broker_summary_${req.query['date']}/${req.params.stockCode}.csv`,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch broker summary data'
    });
  }
});

/**
 * GET /api/broker/transaction/:brokerCode
 * Get broker transaction data for a specific broker and date
 */
router.get('/transaction/:brokerCode', async (req, res) => {
  try {
    const { brokerCode } = brokerTransactionParamsSchema.parse(req.params);
    const { date } = brokerTransactionQuerySchema.parse(req.query);
    
    // Convert YYYYMMDD to YYYYMMDD format for file path
    const dateStr = date;
    const filename = `broker_transaction/broker_transaction_${dateStr}/${brokerCode}.csv`;
    
    console.log(`Fetching broker transaction data for ${brokerCode} on ${dateStr}`);
    
    // Download CSV data from Azure
    const csvData = await downloadText(filename);
    
    if (!csvData) {
      return res.status(404).json({
        success: false,
        error: `No broker transaction data found for ${brokerCode} on ${dateStr}`
      });
    }
    
    // Parse CSV data
    const lines = csvData.trim().split('\n');
    if (lines.length < 2) {
      return res.status(404).json({
        success: false,
        error: 'Invalid broker transaction data format'
      });
    }
    
    const headers = lines[0]?.split(',').map(h => h.trim()) || [];
    const transactionData = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i]?.split(',').map(v => v.trim()) || [];
      if (values.length !== headers.length) continue;
      
      const row: any = {};
      headers.forEach((header, index) => {
        const value = values[index];
        // Convert numeric fields
        if (['rsVal', 'hitLot', 'rsFreq', 'sAvg'].includes(header)) {
          row[header] = parseFloat(value || '0') || 0;
        } else {
          row[header] = value || '';
        }
      });
      
      transactionData.push(row);
    }
    
    return res.json({
      success: true,
      data: {
        brokerCode,
        date: dateStr,
        transactionData
      }
    });
    
  } catch (error: any) {
    console.error('Error fetching broker transaction data:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch broker transaction data'
    });
  }
});

/**
 * GET /api/broker/dates
 * Get available dates for broker summary data
 */
router.get('/dates', async (_req, res) => {
  try {
    const { listPrefixes } = await import('../utils/azureBlob');
    
    // Use listPrefixes to directly get folder names (much faster than listPaths)
    // This lists only the folder structure, not all files
    const prefixes = await listPrefixes('broker_summary/');
    
    const dates = new Set<string>();
    
    prefixes.forEach(prefix => {
      // Extract date from broker_summary/broker_summary_YYYYMMDD/ pattern
      const match = prefix.match(/broker_summary\/broker_summary_(\d{8})\//);
      if (match && match[1]) {
        dates.add(match[1]);
      }
    });
    
    const sortedDates = Array.from(dates).sort().reverse(); // Newest first
    
    console.log(`[Broker] Found ${sortedDates.length} unique dates from ${prefixes.length} folders`);
    
    return res.json({
      success: true,
      data: {
        dates: sortedDates
      }
    });
    
  } catch (error: any) {
    console.error('Error fetching broker summary dates:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch broker summary dates'
    });
  }
});

/**
 * GET /api/broker/stocks
 * Get available stocks for broker summary on specific date
 */
router.get('/stocks', async (req, res) => {
  try {
    const { date } = brokerSummaryQuerySchema.parse(req.query);
    const { listPaths } = await import('../utils/azureBlob');
    
    // List all files in broker_summary for specific date
    const prefix = `broker_summary/broker_summary_${date}/`;
    const allFiles = await listPaths({ prefix });
    
    const stocks = allFiles
      .filter(file => file.endsWith('.csv') && !file.includes('ALLSUM'))
      .map(file => {
        // Extract stock code from filename: broker_summary/broker_summary_YYYYMMDD/STOCK.csv
        const parts = file.split('/');
        const filename = parts[parts.length - 1];
        return filename ? filename.replace('.csv', '') : '';
      })
      .filter(stock => stock.length === 4) // Only 4-character stock codes
      .sort();
    
    return res.json({
      success: true,
      data: {
        stocks,
        date
      }
    });
    
  } catch (error: any) {
    console.error('Error fetching broker summary stocks:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch broker summary stocks'
    });
  }
});

// Get available dates for broker transaction data
router.get('/transaction/dates', async (_req, res) => {
  try {
    const { listPaths } = await import('../utils/azureBlob');
    
    // List all broker_transaction directories
    const allFiles = await listPaths({ prefix: 'broker_transaction/' });
    const dates = new Set<string>();
    
    allFiles.forEach(file => {
      // Extract date from broker_transaction/broker_transaction_YYYYMMDD/ pattern
      const match = file.match(/broker_transaction\/broker_transaction_(\d{8})\//);
      if (match && match[1]) {
        dates.add(match[1]);
      }
    });
    
    const sortedDates = Array.from(dates).sort().reverse(); // Newest first
    
    return res.json({
      success: true,
      data: {
        dates: sortedDates
      }
    });
  } catch (error: any) {
    console.error('Error fetching broker transaction dates:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch broker transaction dates'
    });
  }
});

export default router;