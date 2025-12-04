import { uploadText, listPaths } from '../../utils/azureBlob';
import { BATCH_SIZE_PHASE_7, MAX_CONCURRENT_REQUESTS_PHASE_7 } from '../../services/dataUpdateService';
import { SchedulerLogService } from '../../services/schedulerLogService';
import { doneSummaryCache } from '../../cache/doneSummaryCacheService';

// Helper function to limit concurrency for Phase 7-8
async function limitConcurrency<T>(promises: Promise<T>[], maxConcurrency: number): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < promises.length; i += maxConcurrency) {
    const batch = promises.slice(i, i + maxConcurrency);
    const batchResults = await Promise.allSettled(batch);
    batchResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        // Log error for debugging
        console.error(`⚠️ Promise rejected in batch at index ${i + index}:`, result.reason);
      }
    });
  }
  return results;
}

// Type definitions for broker breakdown data
interface TransactionData {
  STK_CODE: string;
  BRK_COD1: string; // Buyer broker
  BRK_COD2: string; // Seller broker
  STK_VOLM: number;
  STK_PRIC: number;
  TRX_CODE: string;
  TRX_TIME: string;
  TRX_TYPE: string; // Board type: RG, TN, NG
  INV_TYP1: string; // Investor type 1 (buyer) - I = Indonesia, A = Asing
  INV_TYP2: string; // Investor type 2 (seller) - I = Indonesia, A = Asing
  TRX_ORD1: number; // Order reference 1 (buyer)
  TRX_ORD2: number; // Order reference 2 (seller)
}

interface BrokerBreakdownData {
  Price: number;
  BFreq: number;    // Buy Frequency
  BLot: number;    // Buy Lot
  BLotPerFreq: number; // BLot / BFreq
  BOrd: number;    // Buy Order (unique TRX_ORD1)
  BLotPerOrd: number; // BLot / BOrd
  SLot: number;    // Sell Lot
  SFreq: number;   // Sell Frequency
  SLotPerFreq: number; // SLot / SFreq
  SOrd: number;    // Sell Order (unique TRX_ORD2)
  SLotPerOrd: number; // SLot / SOrd
  TFreq: number;   // Total Frequency
  TLot: number;    // Total Lot
  TOrd: number;    // Total Order
}

// Investor Type: D = Domestik, F = Foreign, All = All Trade (no filter)
type InvestorType = 'D' | 'F' | 'All';
// Board Type: RG = Regular, TN = Tunai, NG = Negosiasi, All = All Board (no filter)
type BoardType = 'RG' | 'TN' | 'NG' | 'All';

// Enhanced transaction data with pre-computed flags for faster filtering
interface EnhancedTransactionData extends TransactionData {
  isBid: boolean;
  buyerInvType: InvestorType | null;
  sellerInvType: InvestorType | null;
  boardType: BoardType;
}

// Progress tracker interface for thread-safe stock counting
interface ProgressTracker {
  totalStocks: number;
  processedStocks: number;
  logId: string | null;
  updateProgress: () => Promise<void>;
}

export class BrokerBreakdownCalculator {
  constructor() {
    // No need for Azure client initialization - using azureBlob utility
  }

  /**
   * Get investor type from INV_TYP value
   */
  private getInvestorType(invTyp: string): InvestorType | null {
    const normalized = invTyp?.trim().toUpperCase() || '';
    if (normalized === 'I') return 'D'; // Indonesia = Domestik
    if (normalized === 'A') return 'F'; // Asing = Foreign
    return null;
  }

  /**
   * Find all DT files in done-summary folder
   * OPTIMIZED: Uses shared cache to avoid repeated listPaths calls
   * Returns files sorted by date descending (newest first)
   */
  private async findAllDtFiles(): Promise<string[]> {
    console.log("Scanning all DT files in done-summary folder...");
    
    try {
      // Use shared cache for DT files list
      const allDtFiles = await doneSummaryCache.getDtFilesList();
      
      // Sort by date descending (newest first) - process from newest to oldest
      const sortedFiles = allDtFiles.sort((a, b) => {
        const dateA = a.split('/')[1] || '';
        const dateB = b.split('/')[1] || '';
        return dateB.localeCompare(dateA); // Descending order (newest first)
      });
      
      console.log(`Found ${sortedFiles.length} DT files to process (sorted newest first)`);
      return sortedFiles;
    } catch (error) {
      console.error('Error scanning DT files:', error);
      return [];
    }
  }

  /**
   * Pre-check which dates already have broker breakdown output
   * Returns array of files that need processing (sorted newest first)
   */
  private async filterExistingDates(dtFiles: string[]): Promise<string[]> {
    console.log(`🔍 Pre-checking existing broker breakdown outputs (checking from newest to oldest)...`);
    
    const filesToProcess: string[] = [];
    let skippedCount = 0;
    
    // Check sequentially from newest to oldest to maintain order
    for (const blobName of dtFiles) {
      const pathParts = blobName.split('/');
      const dateFolder = pathParts[1] || 'unknown';
      const dateSuffix = dateFolder;
      
      try {
        const outputPrefix = `done_summary_broker_breakdown/${dateSuffix}/`;
        const existingFiles = await listPaths({ prefix: outputPrefix, maxResults: 1 });
        
        if (existingFiles.length > 0) {
          skippedCount++;
          console.log(`⏭️ Broker breakdown already exists for date ${dateSuffix} - skipping`);
        } else {
          filesToProcess.push(blobName);
          console.log(`✅ Date ${dateSuffix} needs processing`);
        }
      } catch (error) {
        // If check fails, proceed with processing (safer to process than skip)
        console.warn(`⚠️ Could not check existence for ${dateSuffix}, will process:`, error instanceof Error ? error.message : error);
        filesToProcess.push(blobName);
      }
    }
    
    console.log(`📊 Pre-check complete: ${filesToProcess.length} files to process, ${skippedCount} already exist`);
    
    if (filesToProcess.length > 0) {
      console.log(`📋 Processing order (newest first):`);
      const dates = filesToProcess.map(f => f.split('/')[1]).filter((v, i, arr) => arr.indexOf(v) === i);
      dates.slice(0, 10).forEach((date, idx) => {
        console.log(`   ${idx + 1}. ${date}`);
      });
      if (dates.length > 10) {
        console.log(`   ... and ${dates.length - 10} more dates`);
      }
    }
    
    return filesToProcess;
  }

  /**
   * Load and process a single DT file
   * OPTIMIZED: Uses shared cache to avoid repeated downloads
   */
  private async loadAndProcessSingleDtFile(blobName: string): Promise<{ data: TransactionData[], dateSuffix: string } | null> {
    try {
      // Use shared cache for raw content (will cache automatically if not exists)
      const content = await doneSummaryCache.getRawContent(blobName);
      
      if (!content || content.trim().length === 0) {
        console.log(`⚠️ Empty file: ${blobName}`);
        return null;
      }
      
      // Extract date from blob name (done-summary/20251021/DT251021.csv)
      const pathParts = blobName.split('/');
      const dateFolder = pathParts[1] || 'unknown'; // 20251021
      const dateSuffix = dateFolder; // Use full date as suffix
      
      const data = this.parseTransactionData(content);
      // Log will be shown in processSingleDtFile with more context
      
      return { data, dateSuffix };
    } catch (error) {
      console.error(`❌ Error loading file ${blobName}:`, error instanceof Error ? error.message : error);
      return null;
    }
  }

  private parseTransactionData(content: string): TransactionData[] {
    const lines = content.trim().split('\n');
    const data: TransactionData[] = [];
    
    if (lines.length < 2) return data;
    
    // Parse header to get column indices (using semicolon separator)
    const header = lines[0]?.split(';') || [];
    // Silent - header logging is too verbose
    
    const getColumnIndex = (columnName: string): number => {
      return header.findIndex(col => col.trim() === columnName);
    };
    
    const stkCodeIndex = getColumnIndex('STK_CODE');
    const brkCod1Index = getColumnIndex('BRK_COD1');
    const brkCod2Index = getColumnIndex('BRK_COD2');
    const stkVolmIndex = getColumnIndex('STK_VOLM');
    const stkPricIndex = getColumnIndex('STK_PRIC');
    const trxCodeIndex = getColumnIndex('TRX_CODE');
    const trxTimeIndex = getColumnIndex('TRX_TIME');
    const trxTypeIndex = getColumnIndex('TRX_TYPE');
    const invTyp1Index = getColumnIndex('INV_TYP1');
    const invTyp2Index = getColumnIndex('INV_TYP2');
    const trxOrd1Index = getColumnIndex('TRX_ORD1');
    const trxOrd2Index = getColumnIndex('TRX_ORD2');
    
    // Validate required columns exist
    if (stkCodeIndex === -1 || brkCod1Index === -1 || brkCod2Index === -1 || 
        stkVolmIndex === -1 || stkPricIndex === -1 || trxCodeIndex === -1 ||
        trxTimeIndex === -1 || trxTypeIndex === -1 || invTyp1Index === -1 || 
        invTyp2Index === -1 || trxOrd1Index === -1 || trxOrd2Index === -1) {
      console.error('❌ Required columns not found in CSV header');
      return data;
    }
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line || line.trim().length === 0) continue;
      
      const values = line.split(';');
      if (values.length < header.length) continue;
      
      const stockCode = values[stkCodeIndex]?.trim() || '';
      
      // Filter hanya kode emiten 4 huruf
      if (stockCode.length === 4) {
        const transaction: TransactionData = {
          STK_CODE: stockCode,
          BRK_COD1: values[brkCod1Index]?.trim() || '',
          BRK_COD2: values[brkCod2Index]?.trim() || '',
          STK_VOLM: parseFloat(values[stkVolmIndex]?.trim() || '0') || 0,
          STK_PRIC: parseFloat(values[stkPricIndex]?.trim() || '0') || 0,
          TRX_CODE: values[trxCodeIndex]?.trim() || '',
          TRX_TIME: values[trxTimeIndex]?.trim() || '',
          TRX_TYPE: values[trxTypeIndex]?.trim() || '',
          INV_TYP1: values[invTyp1Index]?.trim() || '',
          INV_TYP2: values[invTyp2Index]?.trim() || '',
          TRX_ORD1: parseInt(values[trxOrd1Index]?.trim() || '0', 10) || 0,
          TRX_ORD2: parseInt(values[trxOrd2Index]?.trim() || '0', 10) || 0
        };
        
        data.push(transaction);
      }
    }
    
    // Silent - too verbose, already logged in processSingleDtFile
    return data;
  }

  /**
   * Pre-compute flags for all transactions to avoid repeated calculations
   */
  private enhanceTransactions(data: TransactionData[]): EnhancedTransactionData[] {
    return data.map(row => {
      const isBid = row.TRX_ORD1 > row.TRX_ORD2;
      return {
        ...row,
        isBid,
        buyerInvType: this.getInvestorType(row.INV_TYP1),
        sellerInvType: this.getInvestorType(row.INV_TYP2),
        boardType: row.TRX_TYPE as BoardType
      };
    });
  }

  /**
   * Check if transaction matches investor and board type filters
   * NOTE: Currently not used - replaced by preGroupTransactionsByType() for better performance
   * Kept for reference/documentation purposes
   */
  // private matchesFilter(
  //   row: EnhancedTransactionData,
  //   investorType: InvestorType,
  //   boardType: BoardType
  // ): boolean {
  //   // Filter by board type
  //   if (boardType !== 'All' && row.boardType !== boardType) {
  //     return false;
  //   }

  //   // Filter by investor type
  //   if (investorType !== 'All') {
  //     const brokerInvType = row.isBid ? row.buyerInvType : row.sellerInvType;
  //     if (brokerInvType !== investorType) {
  //       return false;
  //     }
  //   }

  //   return true;
  // }

  /**
   * OPTIMIZED: Pre-group transactions by investor/board type (once, reuse for all combinations)
   * This eliminates redundant filtering - ~12x speedup
   * 
   * Logic matches matchesFilter():
   * - boardType filter: exact match (RG, TN, NG) or 'All' (all board types)
   * - investorType filter: based on buyerInvType (if isBid) or sellerInvType (if !isBid)
   */
  private preGroupTransactionsByType(
    enhancedData: EnhancedTransactionData[]
  ): Map<InvestorType, Map<BoardType, EnhancedTransactionData[]>> {
    const grouped = new Map<InvestorType, Map<BoardType, EnhancedTransactionData[]>>();
    
    // Initialize all combinations
    const investorTypes: InvestorType[] = ['All', 'D', 'F'];
    const boardTypes: BoardType[] = ['All', 'RG', 'TN', 'NG'];
    
    investorTypes.forEach(invType => {
      grouped.set(invType, new Map<BoardType, EnhancedTransactionData[]>());
      boardTypes.forEach(boardType => {
        grouped.get(invType)!.set(boardType, []);
      });
    });
    
    // Single-pass grouping - matches the logic in matchesFilter()
    enhancedData.forEach(row => {
      const boardType = row.boardType;
      
      // Determine investor type based on isBid flag (matches matchesFilter logic)
      const brokerInvType = row.isBid ? row.buyerInvType : row.sellerInvType;
      
      // Add to All × All (all transactions, all filters)
      grouped.get('All')!.get('All')!.push(row);
      
      // Add to All × specific boardType (all investor types, specific board)
      grouped.get('All')!.get(boardType)!.push(row);
      
      // Add to specific investorType × All (specific investor, all board types)
      if (brokerInvType) {
        grouped.get(brokerInvType)!.get('All')!.push(row);
      }
      
      // Add to specific investorType × specific boardType (specific investor, specific board)
      if (brokerInvType) {
        grouped.get(brokerInvType)!.get(boardType)!.push(row);
      }
    });
    
    return grouped;
  }

  /**
   * OPTIMIZED: Get pre-grouped transactions for a specific combination
   * Much faster than filtering from scratch
   */
  private getGroupedTransactions(
    groupedData: Map<InvestorType, Map<BoardType, EnhancedTransactionData[]>>,
    investorType: InvestorType,
    boardType: BoardType
  ): EnhancedTransactionData[] {
    const investorGroup = groupedData.get(investorType);
    if (!investorGroup) return [];
    
    const boardGroup = investorGroup.get(boardType);
    if (!boardGroup) return [];
    
    return boardGroup;
  }

  /**
   * Create broker breakdown data grouped by stock code, broker, and price level
   * Structure: emiten -> broker -> price level
   * Optimized to use enhanced transaction data (already filtered)
   */
  private createBrokerBreakdownData(
    data: EnhancedTransactionData[]
  ): Map<string, Map<string, BrokerBreakdownData[]>> {
    // Structure: stock -> broker -> price -> data
    const stockBrokerPriceMap = new Map<string, Map<string, Map<number, {
      buyLot: number;
      buyFreq: number;
      buyOrd: Set<number>;
      sellLot: number;
      sellFreq: number;
      sellOrd: Set<number>;
    }>>>();
    
    data.forEach(row => {
      const stock = row.STK_CODE;
      const price = row.STK_PRIC;
      const volume = row.STK_VOLM;
      
      // Get broker code based on HAKA/HAKI logic
      const brokerCode = row.isBid ? row.BRK_COD1 : row.BRK_COD2;
      
      if (!stockBrokerPriceMap.has(stock)) {
        stockBrokerPriceMap.set(stock, new Map());
      }
      const stockMap = stockBrokerPriceMap.get(stock)!;
      
      if (!stockMap.has(brokerCode)) {
        stockMap.set(brokerCode, new Map());
      }
      const brokerMap = stockMap.get(brokerCode)!;
      
      if (!brokerMap.has(price)) {
        brokerMap.set(price, {
          buyLot: 0,
          buyFreq: 0,
          buyOrd: new Set<number>(),
          sellLot: 0,
          sellFreq: 0,
          sellOrd: new Set<number>()
        });
      }
      const priceData = brokerMap.get(price)!;
      
      // Klasifikasi BID/ASK berdasarkan HAKA/HAKI
      if (row.isBid) {
        priceData.buyLot += volume;
        priceData.buyFreq += 1;
        if (row.TRX_ORD1 > 0) {
          priceData.buyOrd.add(row.TRX_ORD1);
        }
      } else {
        priceData.sellLot += volume;
        priceData.sellFreq += 1;
        if (row.TRX_ORD2 > 0) {
          priceData.sellOrd.add(row.TRX_ORD2);
        }
      }
    });
    
    // Convert to final structure: stock -> broker -> array of price data
    const breakdownData = new Map<string, Map<string, BrokerBreakdownData[]>>();
    
    stockBrokerPriceMap.forEach((brokerMap, stock) => {
      const stockBrokerData = new Map<string, BrokerBreakdownData[]>();
      
      brokerMap.forEach((priceMap, broker) => {
        const brokerData: BrokerBreakdownData[] = [];
        
        priceMap.forEach((priceData, price) => {
          const bLot = priceData.buyLot / 100;
          const sLot = priceData.sellLot / 100;
          const bFreq = priceData.buyFreq;
          const sFreq = priceData.sellFreq;
          const bOrd = priceData.buyOrd.size;
          const sOrd = priceData.sellOrd.size;
          const tFreq = bFreq + sFreq;
          const tLot = bLot + sLot;
          const tOrd = bOrd + sOrd;
          
          const bLotPerFreq = bFreq > 0 ? bLot / bFreq : 0;
          const bLotPerOrd = bOrd > 0 ? bLot / bOrd : 0;
          const sLotPerFreq = sFreq > 0 ? sLot / sFreq : 0;
          const sLotPerOrd = sOrd > 0 ? sLot / sOrd : 0;
          
          brokerData.push({
            Price: price,
            BFreq: bFreq,
            BLot: bLot,
            BLotPerFreq: bLotPerFreq,
            BOrd: bOrd,
            BLotPerOrd: bLotPerOrd,
            SLot: sLot,
            SFreq: sFreq,
            SLotPerFreq: sLotPerFreq,
            SOrd: sOrd,
            SLotPerOrd: sLotPerOrd,
            TFreq: tFreq,
            TLot: tLot,
            TOrd: tOrd
          });
        });
        
        brokerData.sort((a, b) => b.Price - a.Price);
        stockBrokerData.set(broker, brokerData);
      });
      
      breakdownData.set(stock, stockBrokerData);
    });
    
    return breakdownData;
  }

  /**
   * OPTIMIZED: Derive All.csv from breakdownData instead of recalculating
   * NOTE: Currently not used - we use createAllBrokerDataForStock() instead to ensure
   * accurate unique order counts (requires original TRX_ORD values).
   * This function would be faster but approximates unique orders, which changes results.
   * Kept for reference/documentation purposes.
   */
  // private deriveAllBrokerDataFromBreakdown(
  //   breakdownData: Map<string, Map<string, BrokerBreakdownData[]>>,
  //   stockCode: string
  // ): BrokerBreakdownData[] {
  //   // ... implementation removed (not used)
  // }

  /**
   * Create All.csv file that aggregates all brokers for a stock
   * DEPRECATED: Use deriveAllBrokerDataFromBreakdown() instead (faster)
   * Kept for backward compatibility if needed
   */
  private createAllBrokerDataForStock(
    data: EnhancedTransactionData[],
    stockCode: string
  ): BrokerBreakdownData[] {
    // Aggregate by price (all brokers combined)
    const priceMap = new Map<number, {
      buyLot: number;
      buyFreq: number;
      buyOrd: Set<number>;
      sellLot: number;
      sellFreq: number;
      sellOrd: Set<number>;
    }>();
    
    data.forEach(row => {
      if (row.STK_CODE !== stockCode) return;
      
      const price = row.STK_PRIC;
      const volume = row.STK_VOLM;
      
      if (!priceMap.has(price)) {
        priceMap.set(price, {
          buyLot: 0,
          buyFreq: 0,
          buyOrd: new Set<number>(),
          sellLot: 0,
          sellFreq: 0,
          sellOrd: new Set<number>()
        });
      }
      const priceData = priceMap.get(price)!;
      
      if (row.isBid) {
        priceData.buyLot += volume;
        priceData.buyFreq += 1;
        if (row.TRX_ORD1 > 0) {
          priceData.buyOrd.add(row.TRX_ORD1);
        }
      } else {
        priceData.sellLot += volume;
        priceData.sellFreq += 1;
        if (row.TRX_ORD2 > 0) {
          priceData.sellOrd.add(row.TRX_ORD2);
        }
      }
    });
    
    // Convert to BrokerBreakdownData format
    const allData: BrokerBreakdownData[] = [];
    priceMap.forEach((priceData, price) => {
      const bLot = priceData.buyLot / 100;
      const sLot = priceData.sellLot / 100;
      const bFreq = priceData.buyFreq;
      const sFreq = priceData.sellFreq;
      const bOrd = priceData.buyOrd.size;
      const sOrd = priceData.sellOrd.size;
      const tFreq = bFreq + sFreq;
      const tLot = bLot + sLot;
      const tOrd = bOrd + sOrd;
      
      const bLotPerFreq = bFreq > 0 ? bLot / bFreq : 0;
      const bLotPerOrd = bOrd > 0 ? bLot / bOrd : 0;
      const sLotPerFreq = sFreq > 0 ? sLot / sFreq : 0;
      const sLotPerOrd = sOrd > 0 ? sLot / sOrd : 0;
      
      allData.push({
        Price: price,
        BFreq: bFreq,
        BLot: bLot,
        BLotPerFreq: bLotPerFreq,
        BOrd: bOrd,
        BLotPerOrd: bLotPerOrd,
        SLot: sLot,
        SFreq: sFreq,
        SLotPerFreq: sLotPerFreq,
        SOrd: sOrd,
        SLotPerOrd: sLotPerOrd,
        TFreq: tFreq,
        TLot: tLot,
        TOrd: tOrd
      });
    });
    
    allData.sort((a, b) => b.Price - a.Price);
    return allData;
  }

  /**
   * Convert broker breakdown data to CSV format
   */
  private dataToCsv(data: BrokerBreakdownData[]): string {
    if (data.length === 0) return '';
    
    const headers = ['Price', 'BFreq', 'BLot', 'BLot/Freq', 'BOrd', 'BLot/Ord', 'SLot', 'SFreq', 'SLot/Freq', 'SOrd', 'SLot/Ord', 'TFreq', 'TLot', 'TOrd'];
    return [
      headers.join(','),
      ...data.map(row => [
        row.Price,
        row.BFreq,
        row.BLot,
        row.BLotPerFreq,
        row.BOrd,
        row.BLotPerOrd,
        row.SLot,
        row.SFreq,
        row.SLotPerFreq,
        row.SOrd,
        row.SLotPerOrd,
        row.TFreq,
        row.TLot,
        row.TOrd
      ].join(','))
    ].join('\n');
  }

  /**
   * OPTIMIZED: Check stock folder existence instead of individual files
   * This is ~250x faster than checking 87,844 individual files
   */
  private async checkStockFoldersExist(dateSuffix: string, stockCodes: string[]): Promise<Set<string>> {
    const existingStockFolders = new Set<string>();
    
    // Check folders in parallel batches
    const BATCH_SIZE = 500; // Check 250 stock folders at a time
    const checkPromises = stockCodes.map(async (stockCode) => {
      try {
        const folderPrefix = `done_summary_broker_breakdown/${dateSuffix}/${stockCode}/`;
        const existingFiles = await listPaths({ prefix: folderPrefix, maxResults: 1 });
        if (existingFiles.length > 0) {
          return { stockCode, exists: true };
        }
        return { stockCode, exists: false };
      } catch (error) {
        // If check fails, assume folder doesn't exist (safer to process than skip)
        return { stockCode, exists: false };
      }
    });
    
    // Process in batches
    for (let i = 0; i < checkPromises.length; i += BATCH_SIZE) {
      const batch = checkPromises.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.allSettled(batch);
      batchResults.forEach((result) => {
        if (result.status === 'fulfilled' && result.value.exists) {
          existingStockFolders.add(result.value.stockCode);
        }
      });
    }
    
    return existingStockFolders;
  }

  // Removed checkFileExists - no longer needed (using folder-level check instead)

  /**
   * OPTIMIZED: Batch upload with retry logic and controlled concurrency
   * Reduced batch size to prevent network exhaustion (EADDRNOTAVAIL errors)
   */
  private async batchUpload(files: Array<{ filename: string; content: string }>): Promise<void> {
    // REDUCED: Smaller batch size to prevent connection exhaustion
    // EADDRNOTAVAIL errors occur when too many concurrent connections
    const UPLOAD_BATCH_SIZE = 500; // 100 files at a time
    const DELAY_BETWEEN_BATCHES = 500; // 500ms delay between batches
    
    let failedUploads = 0;
    let successfulUploads = 0;
    
    // Process files in smaller batches with delay between batches
    for (let i = 0; i < files.length; i += UPLOAD_BATCH_SIZE) {
      const batch = files.slice(i, i + UPLOAD_BATCH_SIZE);
      const batchNumber = Math.floor(i / UPLOAD_BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(files.length / UPLOAD_BATCH_SIZE);
      
      console.log(`📤 Uploading batch ${batchNumber}/${totalBatches} (${batch.length} files)...`);
      
      // Process batch with controlled concurrency
      const batchPromises = batch.map(async ({ filename, content }) => {
        try {
          // uploadText now has built-in retry logic (3 retries with exponential backoff)
          await uploadText(filename, content, 'text/csv', 3);
          return { filename, success: true };
        } catch (error) {
          console.error(`❌ Failed to upload ${filename} after retries:`, error instanceof Error ? error.message : error);
          return { filename, success: false, error };
        }
      });
      
      // Wait for batch to complete
      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          if (result.value.success) {
            successfulUploads++;
          } else {
            failedUploads++;
          }
        } else {
          failedUploads++;
          console.error(`❌ Upload promise rejected:`, result.reason);
        }
      });
      
      // Add delay between batches to prevent network exhaustion
      if (i + UPLOAD_BATCH_SIZE < files.length) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
      }
    }
    
    console.log(`📊 Upload summary: ${successfulUploads} successful, ${failedUploads} failed (out of ${files.length} total)`);
    
    if (failedUploads > 0) {
      console.warn(`⚠️ ${failedUploads} file(s) failed to upload (out of ${files.length} total)`);
      // Don't throw error - allow partial success
    }
  }

  /**
   * Process a single DT file with broker breakdown analysis for all combinations
   * OPTIMIZED: Single-pass processing with batch operations
   */
  private async processSingleDtFile(blobName: string, progressTracker?: ProgressTracker): Promise<{ success: boolean; dateSuffix: string; files: string[]; skipped?: boolean }> {
    const pathParts = blobName.split('/');
    const dateFolder = pathParts[1] || 'unknown';
    const dateSuffix = dateFolder;
    
    // Note: Pre-checking is done in filterExistingDates() before batch processing
    // This function only processes files that are confirmed to need processing
    
    // Load and enhance transactions once
    const result = await this.loadAndProcessSingleDtFile(blobName);
    if (!result) {
      return { success: false, dateSuffix: '', files: [] };
    }
    
    const { data } = result;
    if (data.length === 0) {
      console.log(`⚠️ No transaction data in ${blobName} - skipping`);
      return { success: false, dateSuffix, files: [] };
    }
    
    // Validate and enhance transactions once
    const validTransactions = data.filter(t => 
      t.STK_CODE && t.STK_CODE.length === 4 && 
      t.BRK_COD1 && t.BRK_COD2 && 
      t.STK_VOLM > 0 && t.STK_PRIC > 0
    );
    
    if (validTransactions.length === 0) {
      console.log(`⚠️ No valid transaction data in ${blobName} - skipping`);
      return { success: false, dateSuffix, files: [] };
    }
    
    console.log(`📊 Date ${dateSuffix}: ${validTransactions.length.toLocaleString()} valid transactions`);
    
    try {
      // Pre-compute enhanced data once
      const enhancedData = this.enhanceTransactions(validTransactions);
      
      // Get unique stocks once
      const uniqueStocks = new Set<string>();
      enhancedData.forEach(row => uniqueStocks.add(row.STK_CODE));
      
      console.log(`📈 Date ${dateSuffix}: Processing ${uniqueStocks.size} stocks across 12 combinations (InvestorType × BoardType)...`);
      
      // OPTIMIZED: Check stock folders first (folder-level check is ~100x faster)
      const uniqueStocksArray = Array.from(uniqueStocks);
      console.log(`🔍 Date ${dateSuffix}: Checking ${uniqueStocksArray.length} stock folders for existing data...`);
      const existingStockFolders = await this.checkStockFoldersExist(dateSuffix, uniqueStocksArray);
      const stocksToProcess = uniqueStocksArray.filter(stock => !existingStockFolders.has(stock));
      
      // Update progress tracker for stocks that already exist
      if (progressTracker && existingStockFolders.size > 0) {
        progressTracker.processedStocks += existingStockFolders.size;
        await progressTracker.updateProgress();
      }
      
      if (stocksToProcess.length === 0) {
        console.log(`⏭️ Date ${dateSuffix}: All ${uniqueStocksArray.length} stock folders already exist - skipping`);
        return { success: true, dateSuffix, files: [] };
      }
      
      console.log(`✅ Date ${dateSuffix}: ${stocksToProcess.length} stocks need processing (${existingStockFolders.size} already exist)`);
      
      // OPTIMIZED: Pre-group transactions by investor/board type (once, reuse for all combinations)
      // This eliminates redundant filtering (12x speedup)
      const groupedData = this.preGroupTransactionsByType(enhancedData);
      
      const investorTypes: InvestorType[] = ['All', 'D', 'F'];
      const boardTypes: BoardType[] = ['All', 'RG', 'TN', 'NG'];
      const totalCombinations = investorTypes.length * boardTypes.length;
      
      // OPTIMIZED: Process combinations in parallel for faster processing
      const combinationPromises: Promise<Array<{
        filename: string;
        data: BrokerBreakdownData[];
        type: 'broker' | 'all';
        stockCode: string;
        combination: string;
      }>>[] = [];
      
      let combinationIndex = 0;
      
      // Create promises for all combinations (parallel processing)
      for (const investorType of investorTypes) {
        for (const boardType of boardTypes) {
          combinationIndex++;
          const combinationLabel = `${investorType === 'All' ? 'All' : investorType === 'D' ? 'Domestik' : 'Foreign'} × ${boardType === 'All' ? 'All' : boardType}`;
          
          // Process each combination in parallel
          const combinationPromise = (async () => {
            // OPTIMIZED: Get pre-grouped data instead of filtering from scratch
            const filteredData = this.getGroupedTransactions(groupedData, investorType, boardType);
            
            if (filteredData.length === 0) {
              console.log(`   [${combinationIndex}/${totalCombinations}] ${combinationLabel}: No data - skipped`);
              return [];
            }
            
            // Create broker breakdown data
            const breakdownData = this.createBrokerBreakdownData(filteredData);
            
            const fileSuffix = investorType === 'All' && boardType === 'All' 
              ? '' 
              : `_${investorType.toLowerCase()}_${boardType.toLowerCase()}`;
            
            const filesForCombination: Array<{
              filename: string;
              data: BrokerBreakdownData[];
              type: 'broker' | 'all';
              stockCode: string;
              combination: string;
            }> = [];
            
            // OPTIMIZED: Only process stocks that don't have existing folders
            for (const stockCode of stocksToProcess) {
              const stockBrokerData = breakdownData.get(stockCode);
              if (!stockBrokerData) continue;
              
              const emitenFolder = stockCode;
              
              // Collect broker files
              for (const [brokerCode, brokerData] of stockBrokerData) {
                const filename = `done_summary_broker_breakdown/${dateSuffix}/${emitenFolder}/${brokerCode}${fileSuffix}.csv`;
                filesForCombination.push({ filename, data: brokerData, type: 'broker', stockCode, combination: combinationLabel });
              }
              
              // OPTIMIZED: Use pre-grouped filteredData (already filtered by combination)
              // This is faster than recalculating from scratch because filteredData is already grouped
              // Note: We still need to recalculate All.csv from filteredData to get exact unique order counts
              // (deriveAllBrokerDataFromBreakdown would approximate unique orders, which changes results)
              const allData = this.createAllBrokerDataForStock(filteredData, stockCode);
              const allFilename = `done_summary_broker_breakdown/${dateSuffix}/${emitenFolder}/All${fileSuffix}.csv`;
              filesForCombination.push({ filename: allFilename, data: allData, type: 'all', stockCode, combination: combinationLabel });
            }
            
            const stocksProcessed = new Set(filesForCombination.map(f => f.stockCode)).size;
            console.log(`   [${combinationIndex}/${totalCombinations}] ${combinationLabel}: ${stocksProcessed} stocks, ${filesForCombination.length} files`);
            
            return filesForCombination;
          })();
          
          combinationPromises.push(combinationPromise);
        }
      }
      
      // Wait for all combinations to complete in parallel
      const combinationResults = await Promise.all(combinationPromises);
      
      // Flatten results
      const filesToProcess = combinationResults.flat();
      
      if (filesToProcess.length === 0) {
        console.log(`⚠️ Date ${dateSuffix}: No files to process`);
        return { success: true, dateSuffix, files: [] };
      }
      
      // OPTIMIZED: Stream CSV generation and upload per stock batch (reduce memory)
      console.log(`📤 Date ${dateSuffix}: Generating and uploading ${filesToProcess.length.toLocaleString()} files...`);
      
      // Group files by stock for streaming upload
      const filesByStock = new Map<string, Array<{
        filename: string;
        data: BrokerBreakdownData[];
        type: 'broker' | 'all';
        stockCode: string;
        combination: string;
      }>>();
      
      filesToProcess.forEach(file => {
        if (!filesByStock.has(file.stockCode)) {
          filesByStock.set(file.stockCode, []);
        }
        filesByStock.get(file.stockCode)!.push(file);
      });
      
      // OPTIMIZED: Upload per stock batch (streaming - generate CSV and upload immediately)
      // REDUCED: Smaller batch size and sequential processing to prevent network exhaustion
      const STOCK_BATCH_SIZE = 5; // Reduced from 10 to 5 to prevent network exhaustion
      const DELAY_BETWEEN_STOCK_BATCHES = 500; // 0.5 second delay between stock batches
      const stockArray = Array.from(filesByStock.entries());
      const createdFiles: string[] = [];
      
      // Process stock batches sequentially with delay to prevent network exhaustion
      for (let i = 0; i < stockArray.length; i += STOCK_BATCH_SIZE) {
        const stockBatch = stockArray.slice(i, i + STOCK_BATCH_SIZE);
        const batchNumber = Math.floor(i / STOCK_BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(stockArray.length / STOCK_BATCH_SIZE);
        
        console.log(`📦 Date ${dateSuffix}: Processing stock batch ${batchNumber}/${totalBatches} (${stockBatch.length} stocks)...`);
        
        const batchFiles: Array<{ filename: string; content: string }> = [];
        
        for (const [, stockFiles] of stockBatch) {
          // Generate CSV and prepare upload for this stock
          for (const file of stockFiles) {
            if (file.data.length > 0) {
              batchFiles.push({
                filename: file.filename,
                content: this.dataToCsv(file.data)
              });
            }
          }
        }
        
        // Upload batch for these stocks
        if (batchFiles.length > 0) {
          await this.batchUpload(batchFiles);
          createdFiles.push(...batchFiles.map(f => f.filename));
        }
        
        // Update progress tracker after each stock batch
        if (progressTracker) {
          progressTracker.processedStocks += stockBatch.length;
          await progressTracker.updateProgress();
        }
        
        // Add delay between stock batches to prevent network exhaustion
        if (i + STOCK_BATCH_SIZE < stockArray.length) {
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_STOCK_BATCHES));
        }
      }
      
      // Calculate summary stats
      const stocksWithFiles = new Set(createdFiles.map(f => {
        const parts = f.split('/');
        return parts[parts.length - 2]; // Stock code from path
      })).size;
      
      console.log(`✅ Date ${dateSuffix}: Completed - ${createdFiles.length.toLocaleString()} files created for ${stocksWithFiles} stocks`);
      
      return { success: true, dateSuffix, files: createdFiles };
      
    } catch (error) {
      console.error(`❌ Error processing ${blobName}:`, error instanceof Error ? error.message : error);
      if (error instanceof Error && error.stack) {
        console.error(`   Stack trace:`, error.stack);
      }
      
      // If error occurs after we know the stocks count, update progress tracker
      // (This handles cases where error occurs during processing but we've already counted stocks)
      // Note: For early errors (before stock counting), we don't update progress as no stocks were processed
      
      return { success: false, dateSuffix, files: [] };
    }
  }

  /**
   * Pre-count total unique stocks from all DT files that need processing
   * This is used for accurate progress tracking
   */
  private async preCountTotalStocks(dtFiles: string[]): Promise<number> {
    console.log(`🔍 Pre-counting total stocks from ${dtFiles.length} DT files...`);
    const allStocks = new Set<string>();
    let processedFiles = 0;
    
    // Process files in small batches to avoid memory issues
    const PRE_COUNT_BATCH_SIZE = 10;
    for (let i = 0; i < dtFiles.length; i += PRE_COUNT_BATCH_SIZE) {
      const batch = dtFiles.slice(i, i + PRE_COUNT_BATCH_SIZE);
      const batchPromises = batch.map(async (blobName) => {
        try {
          const result = await this.loadAndProcessSingleDtFile(blobName);
          if (result && result.data.length > 0) {
            const validTransactions = result.data.filter(t => 
              t.STK_CODE && t.STK_CODE.length === 4 && 
              t.BRK_COD1 && t.BRK_COD2 && 
              t.STK_VOLM > 0 && t.STK_PRIC > 0
            );
            validTransactions.forEach(t => allStocks.add(t.STK_CODE));
          }
        } catch (error) {
          // Skip files that can't be read during pre-count
          console.warn(`⚠️ Could not pre-count stocks from ${blobName}:`, error instanceof Error ? error.message : error);
        }
      });
      
      await Promise.all(batchPromises);
      processedFiles += batch.length;
      
      if ((i + PRE_COUNT_BATCH_SIZE) % 50 === 0 || i + PRE_COUNT_BATCH_SIZE >= dtFiles.length) {
        console.log(`   Pre-counted ${processedFiles}/${dtFiles.length} files, found ${allStocks.size} unique stocks so far...`);
      }
    }
    
    console.log(`✅ Pre-count complete: ${allStocks.size} unique stocks found across ${dtFiles.length} DT files`);
    return allStocks.size;
  }

  /**
   * Main function to generate broker breakdown data for all DT files
   */
  public async generateBrokerBreakdownData(_dateSuffix: string, logId?: string | null): Promise<{ success: boolean; message: string; data?: any }> {
    const startTime = Date.now();
    let datesToProcess: Set<string> = new Set();
    
    try {
      console.log(`Starting broker breakdown analysis for all DT files...`);
      
      // Find all DT files (sorted newest first)
      const allDtFiles = await this.findAllDtFiles();
      
      if (allDtFiles.length === 0) {
        console.log(`⚠️ No DT files found in done-summary folder`);
        return {
          success: true,
          message: `No DT files found - skipped broker breakdown generation`,
          data: { skipped: true, reason: 'No DT files found' }
        };
      }
      
      // Pre-check existing dates (sequentially, from newest to oldest)
      // This ensures we only process files that need processing
      const dtFiles = await this.filterExistingDates(allDtFiles);
      
      if (dtFiles.length === 0) {
        console.log(`✅ All DT files already have broker breakdown output - nothing to process`);
        return {
          success: true,
          message: `All DT files already processed - skipped broker breakdown generation`,
          data: { skipped: true, reason: 'All files already exist', totalFiles: allDtFiles.length }
        };
      }
      
      console.log(`📊 Processing ${dtFiles.length} DT files (out of ${allDtFiles.length} total)...`);
      
      // Set active processing dates HANYA untuk tanggal yang benar-benar akan diproses
      dtFiles.forEach(file => {
        const dateMatch = file.match(/done-summary\/(\d{8})\//);
        if (dateMatch && dateMatch[1]) {
          datesToProcess.add(dateMatch[1]);
        }
      });
      
      // Set active dates di cache
      datesToProcess.forEach(date => {
        doneSummaryCache.addActiveProcessingDate(date);
      });
      console.log(`📅 Set ${datesToProcess.size} active processing dates in cache: ${Array.from(datesToProcess).slice(0, 10).join(', ')}${datesToProcess.size > 10 ? '...' : ''}`);
      
      // Pre-count total stocks for accurate progress tracking
      const totalStocks = await this.preCountTotalStocks(dtFiles);
      
      // Create progress tracker for thread-safe stock counting
      const progressTracker: ProgressTracker = {
        totalStocks,
        processedStocks: 0,
        logId: logId || null,
        updateProgress: async () => {
          if (progressTracker.logId) {
            const percentage = totalStocks > 0 
              ? Math.round((progressTracker.processedStocks / totalStocks) * 100)
              : 0;
            await SchedulerLogService.updateLog(progressTracker.logId, {
              progress_percentage: percentage,
              current_processing: `Processing stocks: ${progressTracker.processedStocks.toLocaleString()}/${totalStocks.toLocaleString()} stocks processed`
            });
          }
        }
      };
      
      // Process files in batches (Phase 7: 4 files at a time)
      const BATCH_SIZE = BATCH_SIZE_PHASE_7; // Phase 7: 4 files
      const MAX_CONCURRENT = MAX_CONCURRENT_REQUESTS_PHASE_7; // Phase 7: 4 concurrent
      const allResults: { success: boolean; dateSuffix: string; files: string[] }[] = [];
      let processed = 0;
      let successful = 0;
      
      for (let i = 0; i < dtFiles.length; i += BATCH_SIZE) {
        const batch = dtFiles.slice(i, i + BATCH_SIZE);
        const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(dtFiles.length / BATCH_SIZE);
        
        // Extract dates for logging
        const batchDates = batch.map(f => f.split('/')[1]).filter(Boolean);
        console.log(`\n📦 Batch ${batchNumber}/${totalBatches}: Processing dates ${batchDates.join(', ')}`);
        
        // Update progress before batch (showing DT file progress)
        if (logId) {
          await SchedulerLogService.updateLog(logId, {
            progress_percentage: totalStocks > 0 
              ? Math.round((progressTracker.processedStocks / totalStocks) * 100)
              : Math.round((processed / dtFiles.length) * 100),
            current_processing: `Processing batch ${batchNumber}/${totalBatches} (${processed}/${dtFiles.length} dates, ${progressTracker.processedStocks.toLocaleString()}/${totalStocks.toLocaleString()} stocks)`
          });
        }
        
        // Memory check before batch (silent unless high)
        if (global.gc) {
          const memBefore = process.memoryUsage();
          const heapUsedMB = memBefore.heapUsed / 1024 / 1024;
          if (heapUsedMB > 10240) { // 10GB threshold
            console.log(`⚠️ High memory usage before batch ${batchNumber}: ${heapUsedMB.toFixed(2)}MB, forcing GC...`);
            global.gc();
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
        
        // Process batch in parallel with concurrency limit, pass progress tracker
        const batchPromises = batch.map(blobName => this.processSingleDtFile(blobName, progressTracker));
        const batchResults = await limitConcurrency(batchPromises, MAX_CONCURRENT);
        
        // Memory cleanup after batch (silent)
        if (global.gc) {
          global.gc();
        }
        
        // Collect results
        let batchSkipped = 0;
        let batchFailed = 0;
        batchResults.forEach((result, index) => {
          if (result && result.success !== undefined) {
            allResults.push(result);
            processed++;
            if (result.success) {
              successful++;
              if (result.skipped) {
                batchSkipped++;
              }
            } else {
              batchFailed++;
              // Log failed file for debugging
              const failedFile = batch[index];
              if (failedFile) {
                console.warn(`⚠️ Failed to process file: ${failedFile}`);
              }
            }
          } else {
            // Handle case where result is null/undefined (promise rejected but not caught)
            batchFailed++;
            const failedFile = batch[index];
            if (failedFile) {
              console.error(`❌ File processing returned invalid result: ${failedFile}`);
            }
          }
        });
        
        const batchFilesCreated = allResults
          .slice(processed - batchResults.length, processed)
          .reduce((sum, r) => sum + (r.files?.length || 0), 0);
        
        console.log(`✅ Batch ${batchNumber}/${totalBatches} complete: ${successful}/${batch.length} dates processed, ${batchFilesCreated.toLocaleString()} files created, ${progressTracker.processedStocks.toLocaleString()}/${totalStocks.toLocaleString()} stocks processed`);
        
        // Update progress after batch (based on stocks processed)
        if (logId) {
          await SchedulerLogService.updateLog(logId, {
            progress_percentage: totalStocks > 0 
              ? Math.round((progressTracker.processedStocks / totalStocks) * 100)
              : Math.round((processed / dtFiles.length) * 100),
            current_processing: `Completed batch ${batchNumber}/${totalBatches} (${processed}/${dtFiles.length} dates, ${progressTracker.processedStocks.toLocaleString()}/${totalStocks.toLocaleString()} stocks processed)`
          });
        }
        
        // Small delay between batches
        if (i + BATCH_SIZE < dtFiles.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      const totalFiles = allResults.reduce((sum, result) => sum + result.files.length, 0);
      const totalDuration = Math.round((Date.now() - startTime) / 1000);
      
      console.log(`✅ Broker breakdown analysis completed!`);
      console.log(`📊 Processed: ${processed}/${dtFiles.length} DT files`);
      console.log(`📊 Successful: ${successful}/${processed} files`);
      console.log(`📊 Total output files: ${totalFiles}`);
      console.log(`✅ Broker Breakdown calculation completed successfully`);
      console.log(`✅ Broker Breakdown completed in ${totalDuration}s`);
      
      return {
        success: true,
        message: `Broker breakdown data generated successfully for ${successful}/${processed} DT files`,
        data: {
          totalDtFiles: dtFiles.length,
          processedFiles: processed,
          successfulFiles: successful,
          totalOutputFiles: totalFiles,
          duration: totalDuration,
          results: allResults.filter(r => r.success)
        }
      };
      
    } catch (error) {
      console.error('Error generating broker breakdown data:', error);
      return {
        success: false,
        message: `Failed to generate broker breakdown data: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    } finally {
      // Cleanup: Remove active processing dates setelah selesai
      if (datesToProcess && datesToProcess.size > 0) {
        datesToProcess.forEach(date => {
          doneSummaryCache.removeActiveProcessingDate(date);
        });
        console.log(`🧹 Cleaned up ${datesToProcess.size} active processing dates from cache`);
      }
    }
  }
}

export default BrokerBreakdownCalculator;
