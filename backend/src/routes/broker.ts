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
 * Helper function to determine Azure Storage path based on broker code and market filter
 * 
 * Path rules:
 * - BROKER: broker_transaction[/opsi_board][/tanggal]/[kode_saham].csv
 * - STOCK: sama seperti broker, tapi tambahkan suffix _stock pada semua prefix
 * 
 * SPECIAL CASE: When Board = All Trade (empty) and Inv = F or D:
 * - Folder: broker_transaction/
 * - File: broker_transaction_f_YYYYMMDD/{code}.csv or broker_transaction_d_YYYYMMDD/{code}.csv
 * 
 * Examples:
 * - ALL (no filters) → broker_transaction/broker_transaction_YYYYMMDD/{code}.csv
 * - F (All Trade) → broker_transaction/broker_transaction_f_YYYYMMDD/{code}.csv
 * - D (All Trade) → broker_transaction/broker_transaction_d_YYYYMMDD/{code}.csv
 * - RG (ALL) → broker_transaction_rg/broker_transaction_rg_YYYYMMDD/{code}.csv
 * - RG (F) → broker_transaction_rg_f/broker_transaction_rg_f_YYYYMMDD/{code}.csv
 * - RG (D) → broker_transaction_rg_d/broker_transaction_rg_d_YYYYMMDD/{code}.csv
 * - TN/NG: same pattern as RG
 * 
 * For Stock pivot, add _stock suffix to prefix:
 * - ALL → broker_transaction_stock/broker_transaction_stock_YYYYMMDD/{code}.csv
 * - F (All Trade) → broker_transaction_stock/broker_transaction_f_stock_YYYYMMDD/{code}.csv
 * - RG (F) → broker_transaction_rg_f_stock/broker_transaction_rg_f_stock_YYYYMMDD/{code}.csv
 */
const getAzurePath = (code: string, dateStr: string, pivot: 'Broker' | 'Stock' = 'Broker', invFilter?: string, boardFilter?: string): string => {
  // Start with base prefix
  let folderPrefix = 'broker_transaction';
  let filePrefix = 'broker_transaction';
  
  // Check if board filter is provided (RG/TN/NG)
  // Normalize: trim whitespace and check if empty
  const normalizedBoardFilter = boardFilter ? boardFilter.trim() : '';
  const hasBoardFilter = normalizedBoardFilter !== '' && normalizedBoardFilter !== 'All Trade';
  
  // Check if inv filter is provided (F/D)
  // Normalize: trim whitespace and uppercase
  const normalizedInvFilter = invFilter ? invFilter.trim().toUpperCase() : '';
  const hasInvFilter = normalizedInvFilter === 'F' || normalizedInvFilter === 'D';
  
  // Debug logging
  console.log(`[getAzurePath] Input: code=${code}, dateStr=${dateStr}, pivot=${pivot}, invFilter="${invFilter}", boardFilter="${boardFilter}"`);
  console.log(`[getAzurePath] Normalized: invFilter="${normalizedInvFilter}", boardFilter="${normalizedBoardFilter}"`);
  console.log(`[getAzurePath] hasBoardFilter=${hasBoardFilter}, hasInvFilter=${hasInvFilter}`);
  
  if (hasBoardFilter) {
    // When board filter exists, use standard pattern: broker_transaction_{board}[_{inv}]
    const board = normalizedBoardFilter.toUpperCase();
    const folderMap: { [key: string]: string } = {
      'RG': 'rg',
      'TN': 'tn',
      'NG': 'ng'
    };
    const folderType = folderMap[board] || board.toLowerCase();
    
    // Build parts for folder and file prefix
    const parts = [folderType];
    if (hasInvFilter) {
      parts.push(normalizedInvFilter.toLowerCase());
    }
    
    folderPrefix = `broker_transaction_${parts.join('_')}`;
    filePrefix = folderPrefix;
    console.log(`[getAzurePath] Board filter path: ${folderPrefix}/${filePrefix}_${dateStr}/${code}.csv`);
  } else if (hasInvFilter) {
    // SPECIAL CASE: Board = All Trade (empty) and Inv = F or D
    // Folder stays as broker_transaction/, but file prefix includes _f or _d
    folderPrefix = 'broker_transaction';
    filePrefix = `broker_transaction_${normalizedInvFilter.toLowerCase()}`;
    console.log(`[getAzurePath] All Trade + Inv filter path: ${folderPrefix}/${filePrefix}_${dateStr}/${code}.csv`);
  } else {
    // No filters, use default
    console.log(`[getAzurePath] No filters path: ${folderPrefix}/${filePrefix}_${dateStr}/${code}.csv`);
  }
  
  // For Stock pivot, add _stock suffix to the entire prefix
  if (pivot === 'Stock') {
    if (hasBoardFilter) {
      // For board filters: broker_transaction_{board}[_{inv}]_stock
      folderPrefix = `${folderPrefix}_stock`;
      filePrefix = `${filePrefix}_stock`;
    } else if (hasInvFilter) {
      // SPECIAL CASE: Stock + All Trade + Inv (F/D)
      // Folder: broker_transaction_stock/
      // File: broker_transaction_f_stock_YYYYMMDD/ or broker_transaction_d_stock_YYYYMMDD/
      folderPrefix = 'broker_transaction_stock';
      filePrefix = `broker_transaction_${normalizedInvFilter.toLowerCase()}_stock`;
    } else {
      // For no filters, use broker_transaction_stock
      folderPrefix = 'broker_transaction_stock';
      filePrefix = 'broker_transaction_stock';
    }
  }
  
  // Return path: {folderPrefix}/{filePrefix}_YYYYMMDD/{code}.csv
  const finalPath = `${folderPrefix}/${filePrefix}_${dateStr}/${code}.csv`;
  console.log(`[getAzurePath] Final path: ${finalPath}`);
  return finalPath;
};

/**
 * Parse CSV data with semicolon delimiter and map to transaction format
 */
const parseBrokerTransactionCSV = (csvData: string, _brokerCode: string): any[] => {
  const lines = csvData.trim().split('\n');
  if (lines.length < 2) {
    console.log('[PARSE] Not enough lines:', lines.length);
    return [];
  }
  
  console.log('[PARSE] First line (header):', lines[0]?.substring(0, 500));
  console.log('[PARSE] Second line (sample):', lines[1]?.substring(0, 500));
  
  const transactionData: any[] = [];
  let skippedCount = 0;
  let skippedReasons: { [key: string]: number } = {};
  
  // Detect format from header line
  let isAzureFormat = false;
  let azureHeader: string[] = [];
  if (lines.length > 0) {
    const headerLine = lines[0]?.trim() || '';
    azureHeader = headerLine.split(',').map(v => v.trim());
    // Azure format: Emiten,BuyerVol,BuyerValue,... (comma-delimited, first column is "Emiten")
    isAzureFormat = azureHeader.length >= 20 && azureHeader[0] === 'Emiten';
    if (isAzureFormat) {
      console.log('[PARSE] Azure format detected with', azureHeader.length, 'columns');
      console.log('[PARSE] Header columns:', azureHeader.slice(0, 30).join(', '));
    }
  }
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) {
      skippedCount++;
      skippedReasons['empty'] = (skippedReasons['empty'] || 0) + 1;
      continue;
    }
    
    // Use format detection from earlier
    let values: string[];
    if (isAzureFormat) {
      // Azure format uses comma delimiter
      values = line.split(',').map(v => v.trim());
      // Skip header row
      if (i === 1 && values[0] === 'Emiten') {
        continue;
      }
    } else {
      // Original format uses semicolon delimiter
      values = line.split(';').map(v => v.trim());
    }
    
    // Declare all variables in outer scope
    let emiten: string;
    let bCode: string, sCode: string, nbCode: string, nsCode: string;
    let bLot: number, sLot: number, nbLot: number, nsLot: number;
    let bVal: number, sVal: number, nbVal: number, nsVal: number;
    let bAvg: number, sAvg: number, nbAvg: number, nsAvg: number;
    let bFreq: number, sFreq: number, nbFreq: number, nsFreq: number;
    let bOrdNum: number, sOrdNum: number, nbOrdNum: number, nsOrdNum: number;
    let newBuyerOrdNum: number, newSellerOrdNum: number; // New order numbers for BOR/SOR display
    let bLotPerFreq: number, sLotPerFreq: number, nbLotPerFreq: number, nsLotPerFreq: number;
    let bLotPerOrdNum: number, sLotPerOrdNum: number, nbLotPerOrdNum: number, nsLotPerOrdNum: number;
    
    if (isAzureFormat) {
      // Azure format: Use header to find column indices dynamically
      // Expected columns: Emiten,BuyerVol,BuyerValue,BuyerAvg,BuyerFreq,BuyerLotPerFreq,BuyerOrdNum,BuyerLotPerOrdNum,SellerVol,SellerValue,SellerAvg,SellerFreq,SellerLotPerFreq,SellerOrdNum,SellerLotPerOrdNum,NetBuyVol,NetBuyValue,NetBuyAvg,NetBuyFreq,NetBuyLotPerFreq,NetBuyOrdNum,NetBuyLotPerOrdNum,NetSellVol,NetSellValue,NetSellAvg,NetSellFreq,NetSellLotPerFreq,NetSellOrdNum,NetSellLotPerOrdNum
      
      // Find column indices from header
      const getColumnIndex = (colName: string): number => {
        return azureHeader.findIndex(col => col.trim().toLowerCase() === colName.toLowerCase());
      };
      
      const emitenIdx = getColumnIndex('Emiten');
      const buyerVolIdx = getColumnIndex('BuyerVol');
      const buyerValueIdx = getColumnIndex('BuyerValue');
      const buyerAvgIdx = getColumnIndex('BuyerAvg');
      const buyerFreqIdx = getColumnIndex('BuyerFreq');
      const buyerLotPerFreqIdx = getColumnIndex('Lot/F'); // Value Buy: Lot/F
      const buyerOrdNumIdx = getColumnIndex('BuyerOrdNum');
      const newBuyerOrdNumIdx = getColumnIndex('NewBuyerOrdNum'); // New Buyer Order Number
      const buyerLotPerOrdNumIdx = getColumnIndex('Lot/ON'); // Value Buy: Lot/ON
      const sellerVolIdx = getColumnIndex('SellerVol');
      const sellerValueIdx = getColumnIndex('SellerValue');
      const sellerAvgIdx = getColumnIndex('SellerAvg');
      const sellerFreqIdx = getColumnIndex('SellerFreq');
      const sellerLotPerFreqIdx = getColumnIndex('Lot/F.1'); // Value Sell: Lot/F.1
      const sellerOrdNumIdx = getColumnIndex('SellerOrdNum');
      const newSellerOrdNumIdx = getColumnIndex('NewSellerOrdNum'); // New Seller Order Number
      const sellerLotPerOrdNumIdx = getColumnIndex('Lot/ON.1'); // Value Sell: Lot/ON.1
      const netBuyVolIdx = getColumnIndex('NetBuyVol');
      const netBuyValueIdx = getColumnIndex('NetBuyValue');
      const netBuyAvgIdx = getColumnIndex('NetBuyAvg');
      const netBuyFreqIdx = getColumnIndex('NetBuyFreq');
      const netBuyLotPerFreqIdx = getColumnIndex('NLot/F'); // Net Buy: NLot/F
      const netBuyOrdNumIdx = getColumnIndex('NetBuyOrdNum');
      const netBuyLotPerOrdNumIdx = getColumnIndex('NLot/ON'); // Net Buy: NLot/ON
      const netSellVolIdx = getColumnIndex('NetSellVol');
      const netSellValueIdx = getColumnIndex('NetSellValue');
      const netSellAvgIdx = getColumnIndex('NetSellAvg');
      const netSellFreqIdx = getColumnIndex('NetSellFreq');
      const netSellLotPerFreqIdx = getColumnIndex('NLot/F.1'); // Net Sell: NLot/F.1
      const netSellOrdNumIdx = getColumnIndex('NetSellOrdNum');
      const netSellLotPerOrdNumIdx = getColumnIndex('NLot/ON.1'); // Net Sell: NLot/ON.1
      
      if (values.length < Math.max(emitenIdx, buyerVolIdx, sellerVolIdx, netBuyVolIdx, netSellVolIdx) + 1) {
        skippedCount++;
        skippedReasons[`insufficient_columns_${values.length}`] = (skippedReasons[`insufficient_columns_${values.length}`] || 0) + 1;
        continue;
      }
      
      // Map to expected format - read directly from CSV
      emiten = values[emitenIdx] || '';
      const buyerVol = parseFloat(values[buyerVolIdx] || '0') || 0;
      const buyerValue = parseFloat(values[buyerValueIdx] || '0') || 0;
      const buyerAvg = parseFloat(values[buyerAvgIdx] || '0') || 0;
      const buyerFreq = parseFloat(values[buyerFreqIdx] || '0') || 0;
      // Preserve negative values: use parseFloat directly, only default to 0 if value is missing/empty
      bLotPerFreq = buyerLotPerFreqIdx >= 0 ? (values[buyerLotPerFreqIdx] ? parseFloat(values[buyerLotPerFreqIdx]) : 0) : 0;
      const buyerOrdNum = parseFloat(values[buyerOrdNumIdx] || '0') || 0;
      // Read NewBuyerOrdNum if available, otherwise fallback to BuyerOrdNum
      newBuyerOrdNum = newBuyerOrdNumIdx >= 0 ? (parseFloat(values[newBuyerOrdNumIdx] || '0') || 0) : buyerOrdNum;
      // Preserve negative values: use parseFloat directly, only default to 0 if value is missing/empty
      bLotPerOrdNum = buyerLotPerOrdNumIdx >= 0 ? (values[buyerLotPerOrdNumIdx] ? parseFloat(values[buyerLotPerOrdNumIdx]) : 0) : 0;
      
      const sellerVol = parseFloat(values[sellerVolIdx] || '0') || 0;
      const sellerValue = parseFloat(values[sellerValueIdx] || '0') || 0;
      const sellerAvg = parseFloat(values[sellerAvgIdx] || '0') || 0;
      const sellerFreq = parseFloat(values[sellerFreqIdx] || '0') || 0;
      // Preserve negative values: use parseFloat directly, only default to 0 if value is missing/empty
      sLotPerFreq = sellerLotPerFreqIdx >= 0 ? (values[sellerLotPerFreqIdx] ? parseFloat(values[sellerLotPerFreqIdx]) : 0) : 0;
      const sellerOrdNum = parseFloat(values[sellerOrdNumIdx] || '0') || 0;
      // Read NewSellerOrdNum if available, otherwise fallback to SellerOrdNum
      newSellerOrdNum = newSellerOrdNumIdx >= 0 ? (parseFloat(values[newSellerOrdNumIdx] || '0') || 0) : sellerOrdNum;
      // Preserve negative values: use parseFloat directly, only default to 0 if value is missing/empty
      sLotPerOrdNum = sellerLotPerOrdNumIdx >= 0 ? (values[sellerLotPerOrdNumIdx] ? parseFloat(values[sellerLotPerOrdNumIdx]) : 0) : 0;
      
      const netBuyVol = parseFloat(values[netBuyVolIdx] || '0') || 0;
      const netBuyValue = parseFloat(values[netBuyValueIdx] || '0') || 0;
      const netBuyAvg = parseFloat(values[netBuyAvgIdx] || '0') || 0;
      const netBuyFreq = parseFloat(values[netBuyFreqIdx] || '0') || 0;
      // Preserve negative values: use parseFloat directly, only default to 0 if value is missing/empty
      nbLotPerFreq = netBuyLotPerFreqIdx >= 0 ? (values[netBuyLotPerFreqIdx] ? parseFloat(values[netBuyLotPerFreqIdx]) : 0) : 0;
      const netBuyOrdNum = parseFloat(values[netBuyOrdNumIdx] || '0') || 0;
      // Preserve negative values: use parseFloat directly, only default to 0 if value is missing/empty
      nbLotPerOrdNum = netBuyLotPerOrdNumIdx >= 0 ? (values[netBuyLotPerOrdNumIdx] ? parseFloat(values[netBuyLotPerOrdNumIdx]) : 0) : 0;
      
      const netSellVol = parseFloat(values[netSellVolIdx] || '0') || 0;
      const netSellValue = parseFloat(values[netSellValueIdx] || '0') || 0;
      const netSellAvg = parseFloat(values[netSellAvgIdx] || '0') || 0;
      const netSellFreq = parseFloat(values[netSellFreqIdx] || '0') || 0;
      // Preserve negative values: use parseFloat directly, only default to 0 if value is missing/empty
      nsLotPerFreq = netSellLotPerFreqIdx >= 0 ? (values[netSellLotPerFreqIdx] ? parseFloat(values[netSellLotPerFreqIdx]) : 0) : 0;
      const netSellOrdNum = parseFloat(values[netSellOrdNumIdx] || '0') || 0;
      // Preserve negative values: use parseFloat directly, only default to 0 if value is missing/empty
      nsLotPerOrdNum = netSellLotPerOrdNumIdx >= 0 ? (values[netSellLotPerOrdNumIdx] ? parseFloat(values[netSellLotPerOrdNumIdx]) : 0) : 0;
      
      // Convert volumes to lots (1 lot = 100 shares)
      bLot = buyerVol / 100;
      sLot = sellerVol / 100;
      nbLot = netBuyVol / 100;
      nsLot = netSellVol / 100;
      
      // If Lot/F and Lot/ON are not in CSV, calculate them as fallback
      // But preserve negative values from CSV - don't recalculate if already exists
      if (buyerLotPerFreqIdx < 0) {
        bLotPerFreq = buyerFreq !== 0 ? bLot / buyerFreq : 0;
      }
      if (buyerLotPerOrdNumIdx < 0) {
        // Preserve negative values: if buyerOrdNum is negative, result will be negative
        bLotPerOrdNum = buyerOrdNum !== 0 ? bLot / buyerOrdNum : 0;
      }
      if (sellerLotPerFreqIdx < 0) {
        sLotPerFreq = sellerFreq !== 0 ? sLot / sellerFreq : 0;
      }
      if (sellerLotPerOrdNumIdx < 0) {
        // Preserve negative values: if sellerOrdNum is negative, result will be negative
        sLotPerOrdNum = sellerOrdNum !== 0 ? sLot / sellerOrdNum : 0;
      }
      if (netBuyLotPerFreqIdx < 0) {
        nbLotPerFreq = netBuyFreq !== 0 ? nbLot / netBuyFreq : 0;
      }
      if (netBuyLotPerOrdNumIdx < 0) {
        // Preserve negative values: if netBuyOrdNum is negative, result will be negative
        nbLotPerOrdNum = netBuyOrdNum !== 0 ? nbLot / netBuyOrdNum : 0;
      }
      if (netSellLotPerFreqIdx < 0) {
        nsLotPerFreq = netSellFreq !== 0 ? nsLot / netSellFreq : 0;
      }
      if (netSellLotPerOrdNumIdx < 0) {
        // Preserve negative values: if netSellOrdNum is negative, result will be negative
        nsLotPerOrdNum = netSellOrdNum !== 0 ? nsLot / netSellOrdNum : 0;
      }
      
      // For Azure format, BCode and SCode are the same as Emiten
      bCode = emiten;
      sCode = emiten;
      nbCode = emiten;
      nsCode = emiten;
      
      // Use parsed values
      bVal = buyerValue;
      bAvg = buyerAvg;
      bFreq = buyerFreq;
      bOrdNum = buyerOrdNum;
      // newBuyerOrdNum already defined above
      sVal = sellerValue;
      sAvg = sellerAvg;
      sFreq = sellerFreq;
      sOrdNum = sellerOrdNum;
      // newSellerOrdNum already defined above
      nbVal = netBuyValue;
      nbAvg = netBuyAvg;
      nbFreq = netBuyFreq;
      nbOrdNum = netBuyOrdNum;
      nsVal = netSellValue;
      nsAvg = netSellAvg;
      nsFreq = netSellFreq;
      nsOrdNum = netSellOrdNum;
      
    } else {
      // Original format: BCode;BLot;BVal;BAvg;BFreq;Lot/F;BOrdNum;Lot/ON;SCode;SLot;SVal;SAvg;SFreq;Lot/F;SOrdNum;Lot/ON;NBCode;NBLot;NBVal;NBAvg;NBFreq;NLot/F;NBOrdNum;NLot/ON;NSCode;NSLot;NSVal;NSAvg;NSFreq;NLot/F;NSOrdNum;NLot/ON
      if (values.length < 32) {
        skippedCount++;
        skippedReasons[`insufficient_columns_${values.length}`] = (skippedReasons[`insufficient_columns_${values.length}`] || 0) + 1;
        continue;
      }
      
      // VALUE Table: Buyer columns (0-7)
      bCode = values[0] || '';
      bLot = parseFloat(values[1] || '0') || 0; // Already in lots
      bVal = parseFloat(values[2] || '0') || 0;
      bAvg = parseFloat(values[3] || '0') || 0;
      bFreq = parseFloat(values[4] || '0') || 0;
      bLotPerFreq = parseFloat(values[5] || '0') || 0;
      bOrdNum = parseFloat(values[6] || '0') || 0;
      bLotPerOrdNum = parseFloat(values[7] || '0') || 0;
      
      // VALUE Table: Seller columns (8-15)
      sCode = values[8] || '';
      sLot = parseFloat(values[9] || '0') || 0; // Already in lots
      sVal = parseFloat(values[10] || '0') || 0;
      sAvg = parseFloat(values[11] || '0') || 0;
      sFreq = parseFloat(values[12] || '0') || 0;
      sLotPerFreq = parseFloat(values[13] || '0') || 0;
      sOrdNum = parseFloat(values[14] || '0') || 0;
      sLotPerOrdNum = parseFloat(values[15] || '0') || 0;
      
      // For original format, NewBuyerOrdNum and NewSellerOrdNum are not available, use regular order numbers
      newBuyerOrdNum = bOrdNum;
      newSellerOrdNum = sOrdNum;
      
      // NET Table: Net Buy columns (16-23)
      nbCode = values[16] || '';
      nbLot = parseFloat(values[17] || '0') || 0; // Already in lots
      nbVal = parseFloat(values[18] || '0') || 0;
      nbAvg = parseFloat(values[19] || '0') || 0;
      nbFreq = parseFloat(values[20] || '0') || 0;
      nbLotPerFreq = parseFloat(values[21] || '0') || 0;
      nbOrdNum = parseFloat(values[22] || '0') || 0;
      nbLotPerOrdNum = parseFloat(values[23] || '0') || 0;
      
      // NET Table: Net Sell columns (24-31)
      nsCode = values[24] || '';
      nsLot = parseFloat(values[25] || '0') || 0; // Already in lots
      nsVal = parseFloat(values[26] || '0') || 0;
      nsAvg = parseFloat(values[27] || '0') || 0;
      nsFreq = parseFloat(values[28] || '0') || 0;
      nsLotPerFreq = parseFloat(values[29] || '0') || 0;
      nsOrdNum = parseFloat(values[30] || '0') || 0;
      nsLotPerOrdNum = parseFloat(values[31] || '0') || 0;
      
      // Use BCode as Emiten (stock code)
      emiten = bCode || sCode || nbCode || nsCode;
    }
    
    // Calculate volumes (BLot and SLot are already in lots, convert to volume: 1 lot = 100 shares)
    const buyerVol = bLot * 100; // Convert lot to volume
    const sellerVol = sLot * 100;
    
    // NET Table: Calculate net buy/sell volumes from Net Buy and Net Sell data
    // Net Buy = Net Buy Lot - Net Sell Lot (positive means net buy, negative means net sell)
    const netBuyLot = nbLot - nsLot;
    const netBuyVol = netBuyLot * 100; // Convert to volume
    const netBuyValue = nbVal - nsVal;
    
    // Calculate totals
    const totalVolume = buyerVol + sellerVol;
    const totalValue = bVal + sVal;
    const avgPrice = totalVolume > 0 ? totalValue / totalVolume : 0;
    const transactionCount = Math.max(bFreq || 0, sFreq || 0);
    
    // Use BCode as Emiten (stock code) - BCode is the stock code in this CSV format
    // emiten is already set in the if/else block above
    
    if (!emiten || emiten === '') {
      skippedCount++;
      skippedReasons['no_emiten'] = (skippedReasons['no_emiten'] || 0) + 1;
      continue;
    }
    
    transactionData.push({
      Emiten: emiten,
      // VALUE Table: Buyer and Seller data
      BuyerVol: buyerVol,
      BuyerValue: bVal,
      SellerVol: sellerVol,
      SellerValue: sVal,
      BuyerAvg: bAvg || (buyerVol > 0 ? bVal / buyerVol : 0),
      SellerAvg: sAvg || (sellerVol > 0 ? sVal / sellerVol : 0),
      // Broker transaction specific fields for VALUE table
      BCode: bCode,
      BLot: bLot,
      BFreq: bFreq,
      BLotPerFreq: bLotPerFreq,
      BOrdNum: bOrdNum,
      NewBuyerOrdNum: newBuyerOrdNum, // New Buyer Order Number (for BOR display)
      BLotPerOrdNum: bLotPerOrdNum, // Lot/ON from CSV
      SCode: sCode,
      SLot: sLot,
      SFreq: sFreq,
      SLotPerFreq: sLotPerFreq,
      SOrdNum: sOrdNum,
      NewSellerOrdNum: newSellerOrdNum, // New Seller Order Number (for SOR display)
      SLotPerOrdNum: sLotPerOrdNum, // Lot/ON from CSV
      // NET Table: Net Buy and Net Sell data (from columns 16-31)
      NetBuyVol: netBuyVol,
      NetBuyValue: netBuyValue,
      NetBuyAvg: nbAvg || (netBuyVol > 0 ? netBuyValue / netBuyVol : 0),
      NetSellVol: netBuyVol < 0 ? Math.abs(netBuyVol) : 0, // Net sell volume when net buy is negative
      NetSellValue: netBuyValue < 0 ? Math.abs(netBuyValue) : 0, // Net sell value when net buy is negative
      NetSellAvg: nsAvg || (netBuyVol < 0 && Math.abs(netBuyVol) > 0 ? Math.abs(netBuyValue) / Math.abs(netBuyVol) : 0),
      // Net Buy/Net Sell specific fields from CSV columns 16-31
      NBCode: nbCode || emiten,
      NBLot: nbLot,
      NBVal: nbVal,
      NBAvg: nbAvg,
      NBFreq: nbFreq,
      NBLotPerFreq: nbLotPerFreq,
      NBOrdNum: nbOrdNum,
      NBLotPerOrdNum: nbLotPerOrdNum, // NLot/ON from CSV
      NSCode: nsCode || emiten,
      NSLot: nsLot,
      NSVal: nsVal,
      NSAvg: nsAvg,
      NSFreq: nsFreq,
      NSLotPerFreq: nsLotPerFreq,
      NSOrdNum: nsOrdNum,
      NSLotPerOrdNum: nsLotPerOrdNum, // NLot/ON from CSV
      // Calculated totals (for VALUE table)
      TotalVolume: totalVolume,
      AvgPrice: avgPrice,
      TransactionCount: transactionCount,
      TotalValue: totalValue,
    });
  }
  
  return transactionData;
};

/**
 * GET /api/broker/transaction/dates
 * Get available dates for broker transaction data
 * IMPORTANT: This route must be defined BEFORE /transaction/:brokerCode to avoid route conflict
 */
router.get('/transaction/dates', async (_req, res) => {
  try {
    const { listPrefixes } = await import('../utils/azureBlob');
    
    const dates = new Set<string>();
    
    // Use listPrefixes to directly get folder names (much faster than listPaths)
    // This lists only the folder structure, not all files
    
    // SPECIAL CASE: For All Trade + F/D, files are in broker_transaction/ folder
    // Pattern: broker_transaction/broker_transaction_f_YYYYMMDD/ or broker_transaction/broker_transaction_d_YYYYMMDD/
    try {
      const allTradePrefixes = await listPrefixes('broker_transaction/');
      allTradePrefixes.forEach(folderPrefix => {
        // Extract date from broker_transaction/broker_transaction[_f|_d]_YYYYMMDD/ pattern
        // This covers: 
        // - broker_transaction_YYYYMMDD (no inv filter)
        // - broker_transaction_f_YYYYMMDD (F filter)
        // - broker_transaction_d_YYYYMMDD (D filter)
        const match = folderPrefix.match(/broker_transaction\/broker_transaction(?:_[fd])?_(\d{8})\//);
        if (match && match[1]) {
          dates.add(match[1]);
        }
      });
    } catch (error: any) {
      console.error('[AZURE] Error listing broker_transaction folders:', error.message);
    }
    
    // List all possible broker_transaction prefixes for board filters (RG/TN/NG)
    // Pattern: broker_transaction_{board}[_{inv}]/broker_transaction_{board}[_{inv}]_YYYYMMDD/
    const boardPrefixesToCheck = [
      'broker_transaction_rg',        // RG (ALL)
      'broker_transaction_rg_f',      // RG (F)
      'broker_transaction_rg_d',      // RG (D)
      'broker_transaction_tn',        // TN (ALL)
      'broker_transaction_tn_f',      // TN (F)
      'broker_transaction_tn_d',      // TN (D)
      'broker_transaction_ng',        // NG (ALL)
      'broker_transaction_ng_f',       // NG (F)
      'broker_transaction_ng_d',      // NG (D)
    ];
    
    // Check each board prefix
    for (const prefix of boardPrefixesToCheck) {
      try {
        const folderPrefixes = await listPrefixes(`${prefix}/`);
        folderPrefixes.forEach(folderPrefix => {
          // Extract date from {prefix}/{prefix}_YYYYMMDD/ pattern
          const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const match = folderPrefix.match(new RegExp(`${escapedPrefix}\\/${escapedPrefix}_(\\d{8})\\/`));
          if (match && match[1]) {
            dates.add(match[1]);
          }
        });
      } catch (error: any) {
        // Silently skip if folder doesn't exist
        console.error(`[AZURE] Error listing ${prefix} folders:`, error.message);
      }
    }
    
    // Stock prefixes
    const stockPrefixesToCheck = [
      'broker_transaction_stock',      // Stock (ALL)
      'broker_transaction_rg_stock',   // Stock RG (ALL)
      'broker_transaction_rg_f_stock', // Stock RG (F)
      'broker_transaction_rg_d_stock', // Stock RG (D)
      'broker_transaction_tn_stock',   // Stock TN (ALL)
      'broker_transaction_tn_f_stock', // Stock TN (F)
      'broker_transaction_tn_d_stock', // Stock TN (D)
      'broker_transaction_ng_stock',   // Stock NG (ALL)
      'broker_transaction_ng_f_stock',  // Stock NG (F)
      'broker_transaction_ng_d_stock'  // Stock NG (D)
    ];
    
    // SPECIAL CASE: For Stock + All Trade + F/D, files are in broker_transaction_stock/ folder
    // Pattern: broker_transaction_stock/broker_transaction_f_stock_YYYYMMDD/ or broker_transaction_stock/broker_transaction_d_stock_YYYYMMDD/
    try {
      const stockAllTradePrefixes = await listPrefixes('broker_transaction_stock/');
      stockAllTradePrefixes.forEach(folderPrefix => {
        // Extract date from broker_transaction_stock/broker_transaction[_f|_d]_stock_YYYYMMDD/ pattern
        const match = folderPrefix.match(/broker_transaction_stock\/broker_transaction(?:_[fd])?_stock_(\d{8})\//);
        if (match && match[1]) {
          dates.add(match[1]);
        }
      });
    } catch (error: any) {
      console.error('[AZURE] Error listing broker_transaction_stock folders:', error.message);
    }
    
    // Check each stock board prefix
    for (const prefix of stockPrefixesToCheck) {
      try {
        const folderPrefixes = await listPrefixes(`${prefix}/`);
        folderPrefixes.forEach(folderPrefix => {
          // Extract date from {prefix}/{prefix}_YYYYMMDD/ pattern
          const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const match = folderPrefix.match(new RegExp(`${escapedPrefix}\\/${escapedPrefix}_(\\d{8})\\/`));
          if (match && match[1]) {
            dates.add(match[1]);
          }
        });
      } catch (error: any) {
        // Silently skip if folder doesn't exist
        console.error(`[AZURE] Error listing ${prefix} folders:`, error.message);
      }
    }
    
    const sortedDates = Array.from(dates).sort().reverse(); // Newest first
    
    return res.json({
      success: true,
      data: {
        dates: sortedDates,
        total: sortedDates.length
      }
    });
    
  } catch (error: any) {
    console.error('Error fetching broker transaction dates:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch broker transaction dates'
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
    const pivot = (req.query['pivot'] as 'Broker' | 'Stock') || 'Broker'; // Get pivot filter (default: Broker)
    const invFilter = (req.query['inv'] as string) || ''; // Get inv filter from query (F/D) - Investor Type
    const boardFilter = (req.query['board'] as string) || ''; // Get board filter from query (RG/TN/NG) - Board Type
    
    // Convert YYYYMMDD to YYYYMMDD format for file path
    const dateStr = date;
    
    // Validate parameters
    if (!brokerCode || !dateStr) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: brokerCode and date are required'
      });
    }
    
    // Get Azure Storage path based on code, pivot, inv filter, and board filter
    const azurePath = getAzurePath(brokerCode, dateStr, pivot, invFilter, boardFilter);
    
    // Validate azurePath
    if (!azurePath) {
      console.error(`[Broker Transaction] Invalid azurePath generated`);
      return res.status(500).json({
        success: false,
        error: 'Failed to generate Azure Storage path',
        parameters: { brokerCode, dateStr, pivot, invFilter, boardFilter }
      });
    }
    
    // Log the path being used for debugging
    console.log(`[Broker Transaction] Fetching data from Azure path: ${azurePath}`);
    console.log(`[Broker Transaction] Parameters: brokerCode=${brokerCode}, date=${dateStr}, pivot=${pivot}, inv=${invFilter || 'All'}, board=${boardFilter || 'All Trade'}`);
    
    // Download CSV data from Azure
    let csvData: string;
    try {
      csvData = await downloadText(azurePath);
    } catch (downloadError: any) {
      console.error(`[Broker Transaction] Error downloading from Azure:`, downloadError);
      return res.status(500).json({
        success: false,
        error: `Failed to download data from Azure: ${downloadError.message || 'Unknown error'}`,
        path: azurePath,
        filters: {
          pivot,
          inv: invFilter || 'All',
          board: boardFilter || 'All Trade'
        }
      });
    }
    
    if (!csvData) {
      console.log(`[Broker Transaction] File not found at path: ${azurePath}`);
      return res.status(404).json({
        success: false,
        error: `No broker transaction data found for ${brokerCode} on ${dateStr}`,
        path: azurePath, // Include path in error for debugging
        filters: {
          pivot,
          inv: invFilter || 'All',
          board: boardFilter || 'All Trade'
        }
      });
    }
    
    // Parse CSV data (handle both comma and semicolon delimiters)
    // Note: For Stock pivot, brokerCode is actually stockCode
    let transactionData: any[];
    try {
      transactionData = parseBrokerTransactionCSV(csvData, brokerCode);
    } catch (parseError: any) {
      console.error(`[Broker Transaction] Error parsing CSV data:`, parseError);
      return res.status(500).json({
        success: false,
        error: `Failed to parse CSV data: ${parseError.message || 'Unknown error'}`,
        path: azurePath
      });
    }
    
    if (transactionData.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Invalid broker transaction data format or no data found',
        path: azurePath
      });
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
    console.error('Error details:', {
      brokerCode: req.params.brokerCode,
      date: req.query['date'],
      pivot: req.query['pivot'],
      inv: req.query['inv'],
      board: req.query['board'],
      error: error.message,
      stack: error.stack
    });
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

export default router;