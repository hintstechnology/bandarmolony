import { uploadText, listPaths, downloadText } from '../../utils/azureBlob';
import { BATCH_SIZE_PHASE_6, MAX_CONCURRENT_REQUESTS_PHASE_6 } from '../../services/dataUpdateService';
import { SchedulerLogService } from '../../services/schedulerLogService';
import { doneSummaryCache } from '../../cache/doneSummaryCacheService';

// Progress tracker interface for thread-safe stock counting
interface ProgressTracker {
  totalStocks: number;
  processedStocks: number;
  logId: string | null;
  updateProgress: () => Promise<void>;
}

// Helper function to limit concurrency for Phase 5-6
async function limitConcurrency<T>(promises: Promise<T>[], maxConcurrency: number): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < promises.length; i += maxConcurrency) {
    const batch = promises.slice(i, i + maxConcurrency);
    const batchResults = await Promise.allSettled(batch);
    batchResults.forEach((result) => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      }
    });
  }
  return results;
}

// Type definitions
type TransactionType = 'RG' | 'TN' | 'NG';
interface TransactionData {
  STK_CODE: string;
  BRK_COD1: string; // Buyer broker
  BRK_COD2: string; // Seller broker
  STK_VOLM: number;
  STK_PRIC: number;
  TRX_CODE: string;
  TRX_TYPE: string; // field tambahan
  TRX_TIME: string; // Transaction time (HH:MM:SS or HHMMSS)
  TRX_ORD1: number; // Order reference 1 (buyer)
  TRX_ORD2: number; // Order reference 2 (seller)
}

interface BrokerTransactionData {
  Broker: string; // Changed from Emiten - now we list brokers for each stock
  // Buy side (when broker is buyer - BRK_COD1)
  BuyerVol: number;
  BuyerValue: number;
  BuyerAvg: number;
  BuyerFreq: number; // Count of unique TRX_CODE
  OldBuyerOrdNum: number; // Unique count of TRX_ORD1
  BuyerOrdNum: number; // Unique count after grouping by time after 08:58:00
  BLot: number; // Buyer Lot (BuyerVol / 100)
  BLotPerFreq: number; // Buyer Lot per Frequency (BLot / BuyerFreq)
  BLotPerOrdNum: number; // Buyer Lot per Order Number (BLot / BuyerOrdNum)
  // Sell side (when broker is seller - BRK_COD2)
  SellerVol: number;
  SellerValue: number;
  SellerAvg: number;
  SellerFreq: number; // Count of unique TRX_CODE
  OldSellerOrdNum: number; // Unique count of TRX_ORD2
  SellerOrdNum: number; // Unique count after grouping by time after 08:58:00
  SLot: number; // Seller Lot (SellerVol / 100)
  SLotPerFreq: number; // Seller Lot per Frequency (SLot / SellerFreq)
  SLotPerOrdNum: number; // Seller Lot per Order Number (SLot / SellerOrdNum)
  // Net Buy
  NetBuyVol: number;
  NetBuyValue: number;
  NetBuyAvg: number;
  NetBuyFreq: number; // BuyerFreq - SellerFreq (can be negative)
  NetBuyOrdNum: number; // BuyerOrdNum - SellerOrdNum (can be negative)
  NBLot: number; // Net Buy Lot (NetBuyVol / 100)
  NBLotPerFreq: number; // Net Buy Lot per Frequency (NBLot / |NetBuyFreq|)
  NBLotPerOrdNum: number; // Net Buy Lot per Order Number (NBLot / |NetBuyOrdNum|)
  // Net Sell
  NetSellVol: number;
  NetSellValue: number;
  NetSellAvg: number;
  NetSellFreq: number; // SellerFreq - BuyerFreq (can be negative)
  NetSellOrdNum: number; // SellerOrdNum - BuyerOrdNum (can be negative)
  NSLot: number; // Net Sell Lot (NetSellVol / 100)
  NSLotPerFreq: number; // Net Sell Lot per Frequency (NSLot / |NetSellFreq|)
  NSLotPerOrdNum: number; // Net Sell Lot per Order Number (NSLot / |NetSellOrdNum|)
}

export class BrokerTransactionStockRGTNNGCalculator {
  private readonly OPEN_TIME = '08:58:00'; // Market open time
  
  constructor() { }

  /**
   * Check if transaction time is after market open (08:58:00)
   */
  private isAfterOpen(timeStr: string): boolean {
    if (!timeStr || timeStr.trim() === '') return false;
    
    // Normalize time format (handle HH:MM:SS or HHMMSS)
    let normalizedTime = timeStr.trim().replace(/:/g, '');
    if (normalizedTime.length === 6) {
      // Format: HHMMSS
      normalizedTime = normalizedTime.substring(0, 4); // HHMM
    } else if (normalizedTime.length >= 4) {
      normalizedTime = normalizedTime.substring(0, 4);
    } else {
      return false;
    }
    
    // Extract HHMM from OPEN_TIME (08:58:00 -> 0858)
    const openTime = this.OPEN_TIME.replace(/:/g, '').substring(0, 4);
    return normalizedTime >= openTime;
  }

  /**
   * Extract time key for grouping (HH:MM:SS format)
   */
  private getTimeKey(timeStr: string): string {
    if (!timeStr || timeStr.trim() === '') return '';
    
    // Normalize to HH:MM:SS format
    let normalized = timeStr.trim().replace(/:/g, '');
    if (normalized.length === 6) {
      // HHMMSS -> HH:MM:SS
      return `${normalized.substring(0, 2)}:${normalized.substring(2, 4)}:${normalized.substring(4, 6)}`;
    } else if (normalized.length === 4) {
      // HHMM -> HH:MM:00
      return `${normalized.substring(0, 2)}:${normalized.substring(2, 4)}:00`;
    }
    return timeStr;
  }

  /**
   * Calculate BuyerOrdNum and SellerOrdNum by grouping transactions
   * by time (HH:MM:SS) after market open for same broker and emiten
   */
  private calculateNewOrderNumbers(
    buyerTransactions: TransactionData[],
    sellerTransactions: TransactionData[],
    broker: string,
    emiten: string
  ): { newBuyerOrdNum: number; newSellerOrdNum: number } {
    // === BUYER CALCULATION ===
    
    // Step 1: Group buyer transactions by time after open
    const buyerTimeGroups = new Map<string, TransactionData[]>();
    buyerTransactions.forEach(t => {
      if (this.isAfterOpen(t.TRX_TIME)) {
        const timeKey = this.getTimeKey(t.TRX_TIME);
        if (timeKey) {
          const groupKey = `${broker}_${emiten}_${timeKey}`;
          if (!buyerTimeGroups.has(groupKey)) {
            buyerTimeGroups.set(groupKey, []);
          }
          buyerTimeGroups.get(groupKey)!.push(t);
        }
      }
    });
    
    // Step 2: Extract one representative order number from each time group
    // Each time group contributes at most 1 order number (first transaction's TRX_ORD1)
    // If same order number appears in different time groups, it will be deduplicated in the Set
    const buyerOrdNumsFromTimeGroups = new Set<number>();
    buyerTimeGroups.forEach((groupTransactions) => {
      // Take first transaction's order number from each time group
      const firstTransaction = groupTransactions[0];
      if (firstTransaction && firstTransaction.TRX_ORD1 > 0) {
        buyerOrdNumsFromTimeGroups.add(firstTransaction.TRX_ORD1);
      }
    });
    
    // Step 3: Count unique orders before open
    const buyerOrdNumsBeforeOpen = new Set<number>();
    buyerTransactions.forEach(t => {
      if (!this.isAfterOpen(t.TRX_TIME) && t.TRX_ORD1 > 0) {
        buyerOrdNumsBeforeOpen.add(t.TRX_ORD1);
      }
    });
    
    // Step 4: Combine - deduplicate if order number appears in both periods
    // NewBuyerOrdNum should be ≤ time groups count (since we take 1 order per time group)
    const allBuyerOrdNums = new Set<number>();
    buyerOrdNumsFromTimeGroups.forEach(ord => allBuyerOrdNums.add(ord));
    buyerOrdNumsBeforeOpen.forEach(ord => {
      // Only add if not already in time groups
      if (!buyerOrdNumsFromTimeGroups.has(ord)) {
        allBuyerOrdNums.add(ord);
      }
    });
    
    const newBuyerOrdNum = allBuyerOrdNums.size;
    
    // === SELLER CALCULATION ===
    
    // Step 1: Group seller transactions by time after open
    const sellerTimeGroups = new Map<string, TransactionData[]>();
    sellerTransactions.forEach(t => {
      if (this.isAfterOpen(t.TRX_TIME)) {
        const timeKey = this.getTimeKey(t.TRX_TIME);
        if (timeKey) {
          const groupKey = `${broker}_${emiten}_${timeKey}`;
          if (!sellerTimeGroups.has(groupKey)) {
            sellerTimeGroups.set(groupKey, []);
          }
          sellerTimeGroups.get(groupKey)!.push(t);
        }
      }
    });
    
    // Step 2: Extract one representative order number from each time group
    // Each time group contributes at most 1 order number (first transaction's TRX_ORD2)
    // If same order number appears in different time groups, it will be deduplicated in the Set
    const sellerOrdNumsFromTimeGroups = new Set<number>();
    sellerTimeGroups.forEach((groupTransactions) => {
      // Take first transaction's order number from each time group
      const firstTransaction = groupTransactions[0];
      if (firstTransaction && firstTransaction.TRX_ORD2 > 0) {
        sellerOrdNumsFromTimeGroups.add(firstTransaction.TRX_ORD2);
      }
    });
    
    // Step 3: Count unique orders before open
    const sellerOrdNumsBeforeOpen = new Set<number>();
    sellerTransactions.forEach(t => {
      if (!this.isAfterOpen(t.TRX_TIME) && t.TRX_ORD2 > 0) {
        sellerOrdNumsBeforeOpen.add(t.TRX_ORD2);
      }
    });
    
    // Step 4: Combine - deduplicate if order number appears in both periods
    const allSellerOrdNums = new Set<number>();
    sellerOrdNumsFromTimeGroups.forEach(ord => allSellerOrdNums.add(ord));
    sellerOrdNumsBeforeOpen.forEach(ord => {
      // Only add if not already in time groups
      if (!sellerOrdNumsFromTimeGroups.has(ord)) {
        allSellerOrdNums.add(ord);
      }
    });
    
    const newSellerOrdNum = allSellerOrdNums.size;
    
    return { newBuyerOrdNum, newSellerOrdNum };
  }

  /**
   * Check if broker transaction stock folder for specific date and type already exists
   */
  private async checkBrokerTransactionStockRGTNNGExists(dateSuffix: string, type: TransactionType): Promise<boolean> {
    try {
      const name = type.toLowerCase();
      const prefix = `broker_transaction_stock_${name}/broker_transaction_stock_${name}_${dateSuffix}/`;
      const existingFiles = await listPaths({ prefix, maxResults: 1 });
      return existingFiles.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if all types (RG, TN, NG) already exist for a date
   */
  private async checkAllTypesExist(dateSuffix: string): Promise<boolean> {
    const types: TransactionType[] = ['RG', 'TN', 'NG'];
    for (const type of types) {
      const exists = await this.checkBrokerTransactionStockRGTNNGExists(dateSuffix, type);
      if (!exists) {
        return false; // At least one type is missing
      }
    }
    return true; // All types exist
  }

  /**
   * Find all DT files in done-summary folder
   * OPTIMIZED: Uses shared cache to avoid repeated listPaths calls
   */
  private async findAllDtFiles(): Promise<string[]> {
    console.log('🔍 Scanning for DT files in done-summary folder...');
    try {
      // Use shared cache for DT files list
      // Type assertion needed due to TypeScript type inference issue
      const allDtFiles = await (doneSummaryCache as any).getDtFilesList();
      console.log(`📁 Found ${allDtFiles.length} DT files from cache`);
      
      // Sort by date descending (newest first)
      const sortedFiles = allDtFiles.sort((a: string, b: string) => {
        const dateA = a.split('/')[1] || '';
        const dateB = b.split('/')[1] || '';
        return dateB.localeCompare(dateA); // Descending order
      });
      
      // OPTIMIZATION: Check which dates already have all broker_transaction_stock_rg/tn/ng outputs
      console.log("🔍 Checking existing broker_transaction_stock_rg/tn/ng folders to skip...");
      const filesToProcess: string[] = [];
      let skippedCount = 0;
      
      for (const file of sortedFiles) {
        const dateFolder = file.split('/')[1] || '';
        const allExist = await this.checkAllTypesExist(dateFolder);
        
        if (allExist) {
          skippedCount++;
          console.log(`⏭️ Skipping ${file} - broker_transaction_stock_rg/tn/ng folders already exist for ${dateFolder}`);
        } else {
          filesToProcess.push(file);
        }
      }
      
      console.log(`📊 Found ${sortedFiles.length} DT files: ${filesToProcess.length} to process, ${skippedCount} skipped (already processed)`);
      
      if (filesToProcess.length > 0) {
        console.log(`📋 Processing order (newest first):`);
        const dates = filesToProcess.map((f: string) => f.split('/')[1]).filter((v: string | undefined, i: number, arr: (string | undefined)[]) => v !== undefined && arr.indexOf(v) === i) as string[];
        dates.slice(0, 10).forEach((date: string, idx: number) => {
          console.log(`   ${idx + 1}. ${date}`);
        });
        if (dates.length > 10) {
          console.log(`   ... and ${dates.length - 10} more dates`);
        }
      }
      
      return filesToProcess;
    } catch (error: any) {
      console.error('❌ Error finding DT files:', error.message);
      return [];
    }
  }

  /**
   * Process a single DT file with broker transaction analysis (RG/TN/NG split, pivoted by stock)
   * OPTIMIZED: Double-check folders don't exist before processing (race condition protection)
   */
  private async processSingleDtFile(blobName: string, progressTracker?: ProgressTracker): Promise<{ success: boolean; dateSuffix: string; files: string[]; timing?: any; stockCount?: number }> {
    // Extract date before loading to check early
    const pathParts = blobName.split('/');
    const dateFolder = pathParts[1] || 'unknown';
    const dateSuffix = dateFolder;
    
    // OPTIMIZATION: Double-check all types don't exist (race condition protection)
    const allExist = await this.checkAllTypesExist(dateFolder);
    if (allExist) {
      console.log(`⏭️ Skipping ${blobName} - broker_transaction_stock_rg/tn/ng folders already exist for ${dateFolder} (race condition check)`);
      return { success: false, dateSuffix: dateFolder, files: [] };
    }
    
    try {
      console.log(`📥 Loading file: ${blobName}`);
      
      // Use shared cache for raw content (will cache automatically if not exists)
      const content = await doneSummaryCache.getRawContent(blobName);
      if (!content || content.trim().length === 0) {
        console.warn(`⚠️ Empty file or no content: ${blobName}`);
        return { success: false, dateSuffix, files: [] };
      }
      console.log(`✅ Loaded ${blobName} (${content.length} characters)`);
      console.log(`📅 Extracted date suffix: ${dateSuffix} from ${blobName}`);
      
      const data = this.parseTransactionData(content);
      console.log(`✅ Parsed ${data.length} transactions from ${blobName}`);
      
      if (data.length === 0) {
        console.log(`⚠️ No transaction data in ${blobName} - skipping`);
        return { success: false, dateSuffix, files: [] };
      }
      
      console.log(`🔄 Processing ${blobName} (${data.length} transactions) for RG/TN/NG (pivoted by stock)...`);
      
      // Track timing
      const timing = {
        brokerTransactionStockRG: 0,
        brokerTransactionStockTN: 0,
        brokerTransactionStockNG: 0
      };
      
      const allFiles: string[] = [];
      let totalStockCount = 0;
      
      // Process each type (RG, TN, NG)
      for (const type of ['RG', 'TN', 'NG'] as const) {
        // OPTIMIZATION: Check if folder for this type already exists before processing
        const typeExists = await this.checkBrokerTransactionStockRGTNNGExists(dateSuffix, type);
        if (typeExists) {
          console.log(`⏭️ Skipping ${dateSuffix} (${type}) - broker_transaction_stock_${type.toLowerCase()} folder already exists`);
          continue;
        }
        
        const filtered = this.filterByType(data, type);
        if (filtered.length === 0) {
          console.log(`⏭️ Skipping ${dateSuffix} (${type}) - no ${type} transactions found`);
          continue;
        }
        
        const startTime = Date.now();
        const result = await this.createBrokerTransactionPerStock(filtered, dateSuffix, type, progressTracker);
        const duration = Math.round((Date.now() - startTime) / 1000);
        
        if (type === 'RG') timing.brokerTransactionStockRG = duration;
        else if (type === 'TN') timing.brokerTransactionStockTN = duration;
        else if (type === 'NG') timing.brokerTransactionStockNG = duration;
        
        allFiles.push(...result.files);
        totalStockCount += result.stockCount;
        console.log(`✅ Created ${result.files.length} broker transaction stock files for ${dateSuffix} (${type}), ${result.stockCount} stocks processed`);
      }
      
      console.log(`✅ Completed processing ${blobName} - ${allFiles.length} files created, ${totalStockCount} stocks processed`);
      return { success: true, dateSuffix, files: allFiles, timing, stockCount: totalStockCount };
      
    } catch (error: any) {
      console.error(`❌ Error processing file ${blobName}:`, error.message);
      return { success: false, dateSuffix, files: [] };
    }
  }

  private parseTransactionData(content: string): TransactionData[] {
    const lines = content.trim().split('\n');
    const header = lines[0]?.split(';') || [];
    const getIdx = (col: string) => header.findIndex(h => h.trim() === col);
    const iSTK_CODE = getIdx('STK_CODE');
    const iBRK_COD1 = getIdx('BRK_COD1');
    const iBRK_COD2 = getIdx('BRK_COD2');
    const iSTK_VOLM = getIdx('STK_VOLM');
    const iSTK_PRIC = getIdx('STK_PRIC');
    const iTRX_CODE = getIdx('TRX_CODE');
    const iTRX_TYPE = getIdx('TRX_TYPE');
    const iTRX_TIME = getIdx('TRX_TIME');
    const iTRX_ORD1 = getIdx('TRX_ORD1');
    const iTRX_ORD2 = getIdx('TRX_ORD2');
    if ([iSTK_CODE, iBRK_COD1, iBRK_COD2, iSTK_VOLM, iSTK_PRIC, iTRX_CODE, iTRX_TYPE, iTRX_TIME, iTRX_ORD1, iTRX_ORD2].some(k => k === -1)) return [];
    const data: TransactionData[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line || line.trim().length === 0) continue;
      const values = line.split(';');
      const stockCode = values[iSTK_CODE]?.trim() || '';
      if (stockCode.length === 4) {
        const base: TransactionData = {
          STK_CODE: stockCode,
          BRK_COD1: values[iBRK_COD1]?.trim() || '',
          BRK_COD2: values[iBRK_COD2]?.trim() || '',
          STK_VOLM: parseFloat(values[iSTK_VOLM]?.trim() || '0') || 0,
          STK_PRIC: parseFloat(values[iSTK_PRIC]?.trim() || '0') || 0,
          TRX_CODE: values[iTRX_CODE]?.trim() || '',
          TRX_TYPE: values[iTRX_TYPE]?.trim() || '',
          TRX_TIME: values[iTRX_TIME]?.trim() || '',
          TRX_ORD1: parseInt(values[iTRX_ORD1]?.trim() || '0', 10) || 0,
          TRX_ORD2: parseInt(values[iTRX_ORD2]?.trim() || '0', 10) || 0,
        };
        data.push(base);
      }
    }
      return data;
    }
    
  private filterByType(data: TransactionData[], type: TransactionType): TransactionData[] {
    return data.filter(row => row.TRX_TYPE === type);
  }

  private getTransactionPaths(type: TransactionType, dateSuffix: string) {
    // Use lowercase type directly (RG -> rg, TN -> tn, NG -> ng)
    const name = type.toLowerCase();
    return {
      brokerTransaction: `broker_transaction_stock_${name}/broker_transaction_stock_${name}_${dateSuffix}`
    };
  }

  private async createBrokerTransactionPerStock(data: TransactionData[], dateSuffix: string, type: TransactionType, progressTracker?: ProgressTracker): Promise<{ files: string[]; stockCount: number }> {
    const paths = this.getTransactionPaths(type, dateSuffix);
    // Get unique stock codes (pivoted - group by stock)
    const uniqueStocks = [...new Set(data.map(r => r.STK_CODE))];
    const createdFiles: string[] = [];
    
    for (let i = 0; i < uniqueStocks.length; i++) {
      const stock = uniqueStocks[i];
      if (!stock) continue; // Skip if undefined
      const filename = `${paths.brokerTransaction}/${stock}.csv`;
      
      console.log(`Processing stock: ${stock} (${type})`);
      
      // Filter data for this stock
      const stockData = data.filter(row => row.STK_CODE === stock);
      
      // Get unique broker codes (both buyer and seller brokers) for this stock
      const uniqueBrokers = [...new Set([
        ...stockData.map(row => row.BRK_COD1), // buyer brokers
        ...stockData.map(row => row.BRK_COD2)  // seller brokers
      ])];
      
      const brokerSummary: BrokerTransactionData[] = [];
      
      for (const broker of uniqueBrokers) {
        // Filter transactions for this broker (both as buyer and seller)
        const brokerTransactions = stockData.filter(row => row.BRK_COD1 === broker || row.BRK_COD2 === broker);
        
        // Separate buyer and seller transactions
        const buyerTxs = brokerTransactions.filter(t => t.BRK_COD1 === broker);
        const sellerTxs = brokerTransactions.filter(t => t.BRK_COD2 === broker);
        
        const buyerVol = buyerTxs.reduce((s, t) => s + t.STK_VOLM, 0);
        const buyerValue = buyerTxs.reduce((s, t) => s + (t.STK_VOLM * t.STK_PRIC), 0);
        const buyerAvg = buyerVol > 0 ? buyerValue / buyerVol : 0;
        const sellerVol = sellerTxs.reduce((s, t) => s + t.STK_VOLM, 0);
        const sellerValue = sellerTxs.reduce((s, t) => s + (t.STK_VOLM * t.STK_PRIC), 0);
        const sellerAvg = sellerVol > 0 ? sellerValue / sellerVol : 0;
        
        // Calculate frequencies and order numbers
        const buyerTxCodes = new Set<string>();
        const sellerTxCodes = new Set<string>();
        const buyerOrdNums = new Set<number>();
        const sellerOrdNums = new Set<number>();
        
        buyerTxs.forEach(t => {
          if (t.TRX_CODE) buyerTxCodes.add(t.TRX_CODE);
          if (t.TRX_ORD1 > 0) buyerOrdNums.add(t.TRX_ORD1);
        });
        
        sellerTxs.forEach(t => {
          if (t.TRX_CODE) sellerTxCodes.add(t.TRX_CODE);
          if (t.TRX_ORD2 > 0) sellerOrdNums.add(t.TRX_ORD2);
        });
        
        const buyerFreq = buyerTxCodes.size;
        const sellerFreq = sellerTxCodes.size;
        const oldBuyerOrdNum = buyerOrdNums.size;
        const oldSellerOrdNum = sellerOrdNums.size;
        
        // Calculate BuyerOrdNum and SellerOrdNum (grouping by time after 08:58:00)
        const { newBuyerOrdNum, newSellerOrdNum } = this.calculateNewOrderNumbers(
          buyerTxs,
          sellerTxs,
          broker,
          stock
        );
        
        // Calculate net values
        const rawNetBuyVol = buyerVol - sellerVol;
        const rawNetBuyValue = buyerValue - sellerValue;
        const netBuyFreq = buyerFreq - sellerFreq; // Can be negative
        const netBuyOrdNum = newBuyerOrdNum - newSellerOrdNum; // Use New values, can be negative
        const netSellFreq = sellerFreq - buyerFreq; // Can be negative
        const netSellOrdNum = newSellerOrdNum - newBuyerOrdNum; // Use New values, can be negative
        
        let netBuyVol = 0;
        let netBuyValue = 0;
        let netSellVol = 0;
        let netSellValue = 0;
        
        // If NetBuy is negative, it becomes NetSell (and NetBuy is set to 0)
        // If NetBuy is positive, NetSell is 0 (and NetBuy keeps the value)
        if (rawNetBuyVol >= 0) {
          // NetBuy is positive or zero, keep it and NetSell is 0
          netBuyVol = rawNetBuyVol;
          netBuyValue = rawNetBuyValue;
          netSellVol = 0;
          netSellValue = 0;
        } else {
          // NetBuy is negative, so it becomes NetSell
          netSellVol = Math.abs(rawNetBuyVol);
          netSellValue = Math.abs(rawNetBuyValue);
          netBuyVol = 0;
          netBuyValue = 0;
        }
        
        // Calculate net averages
        const netBuyAvg = netBuyVol > 0 ? netBuyValue / netBuyVol : 0;
        const netSellAvg = netSellVol > 0 ? netSellValue / netSellVol : 0;

        // Calculate Lot values (Vol / 100)
        const buyerLot = buyerVol / 100;
        const sellerLot = sellerVol / 100;
        const netBuyLot = netBuyVol / 100;
        const netSellLot = netSellVol / 100;

        // Calculate Lot/F (Lot per Frequency)
        const buyerLotPerFreq = buyerFreq > 0 ? buyerLot / buyerFreq : 0;
        const sellerLotPerFreq = sellerFreq > 0 ? sellerLot / sellerFreq : 0;
        const netBuyLotPerFreq = netBuyFreq !== 0 ? netBuyLot / netBuyFreq : 0;
        const netSellLotPerFreq = netSellFreq !== 0 ? netSellLot / netSellFreq : 0;

        // Calculate Lot/ON (Lot per Order Number) - use New values
        const buyerLotPerOrdNum = newBuyerOrdNum > 0 ? buyerLot / newBuyerOrdNum : 0;
        const sellerLotPerOrdNum = newSellerOrdNum > 0 ? sellerLot / newSellerOrdNum : 0;
        const netBuyLotPerOrdNum = netBuyOrdNum !== 0 ? netBuyLot / netBuyOrdNum : 0;
        const netSellLotPerOrdNum = netSellOrdNum !== 0 ? netSellLot / netSellOrdNum : 0;
        
        brokerSummary.push({
          Broker: broker,
          BuyerVol: buyerVol,
          BuyerValue: buyerValue,
          BuyerAvg: buyerAvg,
          BuyerFreq: buyerFreq,
          OldBuyerOrdNum: oldBuyerOrdNum,
          BuyerOrdNum: newBuyerOrdNum,
          BLot: buyerLot,
          BLotPerFreq: buyerLotPerFreq,
          BLotPerOrdNum: buyerLotPerOrdNum,
          SellerVol: sellerVol,
          SellerValue: sellerValue,
          SellerAvg: sellerAvg,
          SellerFreq: sellerFreq,
          OldSellerOrdNum: oldSellerOrdNum,
          SellerOrdNum: newSellerOrdNum,
          SLot: sellerLot,
          SLotPerFreq: sellerLotPerFreq,
          SLotPerOrdNum: sellerLotPerOrdNum,
          NetBuyVol: netBuyVol,
          NetBuyValue: netBuyValue,
          NetBuyAvg: netBuyAvg,
          NetBuyFreq: netBuyFreq, // Can be negative
          NetBuyOrdNum: netBuyOrdNum, // Uses New values, can be negative
          NBLot: netBuyLot,
          NBLotPerFreq: netBuyLotPerFreq,
          NBLotPerOrdNum: netBuyLotPerOrdNum,
          NetSellVol: netSellVol,
          NetSellValue: netSellValue,
          NetSellAvg: netSellAvg,
          NetSellFreq: netSellFreq, // Can be negative
          NetSellOrdNum: netSellOrdNum, // Uses New values, can be negative
          NSLot: netSellLot,
          NSLotPerFreq: netSellLotPerFreq,
          NSLotPerOrdNum: netSellLotPerOrdNum,
        });
      }
      // Sort by net buy value descending
      brokerSummary.sort((a, b) => b.NetBuyValue - a.NetBuyValue);
      await this.saveToAzure(filename, brokerSummary);
      createdFiles.push(filename);
      
      // Update progress tracker after each stock
      if (progressTracker) {
        progressTracker.processedStocks++;
        await progressTracker.updateProgress();
      }
    }
    
    return { files: createdFiles, stockCount: uniqueStocks.length };
  }

  private async saveToAzure(filename: string, data: any[]): Promise<string> {
    if (!data || data.length === 0) {
      console.warn(`⚠️ No data to save for ${filename}, skipping upload`);
      return filename;
    }
    try {
      const headers = Object.keys(data[0]);
      const csvContent = [headers.join(','), ...data.map(row => headers.map(header => row[header]).join(','))].join('\n');
      console.log(`📤 Uploading ${filename} (${data.length} rows, ${csvContent.length} bytes)...`);
      await uploadText(filename, csvContent, 'text/csv');
      console.log(`✅ Successfully uploaded ${filename}`);
      return filename;
    } catch (error: any) {
      console.error(`❌ Failed to upload ${filename}:`, error.message);
      throw error;
    }
  }

  /**
   * Pre-count total unique stocks from all DT files that need processing
   * CRITICAL: Loads files DIRECTLY from Azure WITHOUT cache to avoid caching files during pre-count
   * This is used for accurate progress tracking (per stock per type)
   */
  private async preCountTotalStocks(dtFiles: string[]): Promise<number> {
    console.log(`🔍 Pre-counting total stocks from ${dtFiles.length} DT files (loading WITHOUT cache)...`);
    const allStocks = new Set<string>();
    let processedFiles = 0;
    
    // Process files in small batches to avoid memory issues
    const PRE_COUNT_BATCH_SIZE = 10;
    for (let i = 0; i < dtFiles.length; i += PRE_COUNT_BATCH_SIZE) {
      const batch = dtFiles.slice(i, i + PRE_COUNT_BATCH_SIZE);
      const batchPromises = batch.map(async (blobName) => {
        try {
          // CRITICAL: Load file DIRECTLY from Azure WITHOUT cache for pre-count
          const content = await downloadText(blobName);
          if (!content || content.trim().length === 0) {
            return;
          }
          
          const data = this.parseTransactionData(content);
          const validTransactions = data.filter(t => 
            t.STK_CODE && t.STK_CODE.length === 4
          );
          validTransactions.forEach(t => allStocks.add(t.STK_CODE));
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
    // Estimate: stocks per type (RG/TN/NG) = unique stocks * 3 types * 1.5x for overlap
    return Math.round(allStocks.size * 3 * 1.5);
  }

  /**
   * Main function to generate broker transaction data for all DT files (RG/TN/NG split, pivoted by stock)
   * OPTIMIZED: Batch processing with skip logic
   */
  public async generateBrokerTransactionData(_dateSuffix?: string, logId?: string | null): Promise<{ success: boolean; message: string; data?: any }> {
    let datesToProcess: Set<string> = new Set();
    
    try {
      console.log(`🔄 Starting Broker Transaction Stock RG/TN/NG calculation...`);
      const dtFiles = await this.findAllDtFiles();
      
      if (dtFiles.length === 0) {
        console.log(`✅ No DT files to process - skipped broker transaction stock RG/TN/NG data generation`);
        return { success: true, message: `No DT files found - skipped broker transaction stock RG/TN/NG data generation` };
      }
      
      console.log(`📊 Processing ${dtFiles.length} DT files in batches of ${BATCH_SIZE_PHASE_6}...`);
      
      // CRITICAL: Pre-count FIRST before setting active dates to avoid caching during pre-count
      // Pre-count loads files WITHOUT cache
      const estimatedTotalStocks = await this.preCountTotalStocks(dtFiles);
      
      // Set active processing dates HANYA setelah pre-count selesai
      dtFiles.forEach(file => {
        const dateMatch = file.match(/done-summary\/(\d{8})\//);
        if (dateMatch && dateMatch[1]) {
          datesToProcess.add(dateMatch[1]);
        }
      });
      
      // Set active dates di cache SETELAH pre-count selesai
      datesToProcess.forEach(date => {
        doneSummaryCache.addActiveProcessingDate(date);
      });
      console.log(`📅 Set ${datesToProcess.size} active processing dates in cache: ${Array.from(datesToProcess).slice(0, 10).join(', ')}${datesToProcess.size > 10 ? '...' : ''}`);
      
      // Create progress tracker for thread-safe stock counting
      const progressTracker: ProgressTracker = {
        totalStocks: estimatedTotalStocks,
        processedStocks: 0,
        logId: logId || null,
        updateProgress: async () => {
          if (progressTracker.logId) {
            const percentage = estimatedTotalStocks > 0 
              ? Math.min(100, Math.round((progressTracker.processedStocks / estimatedTotalStocks) * 100))
              : 0;
            await SchedulerLogService.updateLog(progressTracker.logId, {
              progress_percentage: percentage,
              current_processing: `Processing stocks: ${progressTracker.processedStocks.toLocaleString()}/${estimatedTotalStocks.toLocaleString()} stocks processed`
            });
          }
        }
      };
      
      let totalProcessed = 0;
      let totalSkipped = 0;
      let totalFilesCreated = 0;
      let totalErrors = 0;
      
      // Process in batches to manage memory (Phase 6: 6 files at a time)
      const BATCH_SIZE = BATCH_SIZE_PHASE_6; // Phase 6: 6 files
      const MAX_CONCURRENT = MAX_CONCURRENT_REQUESTS_PHASE_6; // Phase 6: 3 concurrent
      for (let i = 0; i < dtFiles.length; i += BATCH_SIZE) {
        const batch = dtFiles.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(dtFiles.length / BATCH_SIZE);
        
        console.log(`\n📦 Processing batch ${batchNum}/${totalBatches} (${batch.length} files)...`);
        
        // Update progress before batch (showing DT file progress)
        if (logId) {
          await SchedulerLogService.updateLog(logId, {
            progress_percentage: estimatedTotalStocks > 0 
              ? Math.round((progressTracker.processedStocks / estimatedTotalStocks) * 100)
              : Math.round((totalProcessed / dtFiles.length) * 100),
            current_processing: `Processing batch ${batchNum}/${totalBatches} (${totalProcessed}/${dtFiles.length} dates, ${progressTracker.processedStocks.toLocaleString()}/${estimatedTotalStocks.toLocaleString()} stocks)`
          });
        }
        
        // Memory check before batch
        if (global.gc) {
          const memBefore = process.memoryUsage();
          const heapUsedMB = memBefore.heapUsed / 1024 / 1024;
          if (heapUsedMB > 10240) { // 10GB threshold
            console.log(`⚠️ High memory usage detected: ${heapUsedMB.toFixed(2)}MB, forcing GC...`);
            global.gc();
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
        
        // Process batch in parallel with concurrency limit, pass progress tracker
        const batchPromises = batch.map(blobName => this.processSingleDtFile(blobName, progressTracker));
        const batchResults = await limitConcurrency(batchPromises, MAX_CONCURRENT);
        
        // Memory cleanup after batch
        if (global.gc) {
          global.gc();
          const memAfter = process.memoryUsage();
          const heapUsedMB = memAfter.heapUsed / 1024 / 1024;
          console.log(`📊 Batch ${batchNum} complete - Memory: ${heapUsedMB.toFixed(2)}MB`);
        }
        
        // Collect results
        let batchStockCount = 0;
        for (const result of batchResults) {
          if (result && result.success !== undefined) {
            const { success, files, dateSuffix, stockCount } = result;
            if (success) {
              totalProcessed++;
              totalFilesCreated += files ? files.length : 0;
              batchStockCount += stockCount || 0;
              console.log(`✅ ${dateSuffix}: ${files ? files.length : 0} files created, ${stockCount || 0} stocks processed`);
            } else {
              totalSkipped++;
              console.log(`⏭️ ${dateSuffix}: Skipped (already exists or no data)`);
            }
          }
        }
        
        console.log(`📊 Batch ${batchNum}/${totalBatches} complete: ${totalProcessed} processed, ${totalSkipped} skipped, ${totalErrors} errors, ${batchStockCount} stocks processed, ${progressTracker.processedStocks.toLocaleString()}/${estimatedTotalStocks.toLocaleString()} total stocks processed`);
        
        // Update progress after batch (based on stocks processed)
        if (logId) {
          await SchedulerLogService.updateLog(logId, {
            progress_percentage: estimatedTotalStocks > 0 
              ? Math.round((progressTracker.processedStocks / estimatedTotalStocks) * 100)
              : Math.round((totalProcessed / dtFiles.length) * 100),
            current_processing: `Completed batch ${batchNum}/${totalBatches} (${totalProcessed}/${dtFiles.length} dates, ${progressTracker.processedStocks.toLocaleString()}/${estimatedTotalStocks.toLocaleString()} stocks processed)`
          });
        }
        
        // Small delay between batches
        if (i + BATCH_SIZE < dtFiles.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      const message = `Broker Transaction Stock RG/TN/NG data generated: ${totalProcessed} dates processed, ${totalFilesCreated} files created, ${totalSkipped} skipped, ${totalErrors} errors`;
      console.log(`✅ ${message}`);
      return { 
        success: true, 
        message,
        data: {
          processed: totalProcessed,
          filesCreated: totalFilesCreated,
          skipped: totalSkipped,
          errors: totalErrors
        }
      };
    } catch (e) {
      const error = e as Error;
      console.error(`❌ Error in generateBrokerTransactionData:`, error.message);
      return { success: false, message: error.message };
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

export default BrokerTransactionStockRGTNNGCalculator;

