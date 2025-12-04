import { uploadText, listPaths } from '../../utils/azureBlob';
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
interface TransactionData {
  STK_CODE: string;
  BRK_COD1: string; // Buyer broker
  BRK_COD2: string; // Seller broker
  STK_VOLM: number;
  STK_PRIC: number;
  TRX_CODE: string;
  TRX_TIME: string; // Transaction time (HH:MM:SS or HHMMSS)
  INV_TYP1: string; // Investor type 1 (buyer) - I = Indonesia, A = Asing
  INV_TYP2: string; // Investor type 2 (seller) - I = Indonesia, A = Asing
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

type InvestorType = 'D' | 'F'; // D = Domestik (I), F = Foreign (A)

export class BrokerTransactionStockFDCalculator {
  private readonly OPEN_TIME = '08:58:00'; // Market open time
  
  constructor() {
    // No need for Azure client initialization - using azureBlob utility
  }

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
   * Skip files where broker_transaction_stock folders already exist
   */
  private async findAllDtFiles(): Promise<string[]> {
    console.log("Scanning all DT files in done-summary folder...");
    
    try {
      // Use shared cache for DT files list
      const allDtFiles = await doneSummaryCache.getDtFilesList();
      
      // Sort by date descending (newest first)
      const sortedFiles = allDtFiles.sort((a, b) => {
        const dateA = a.split('/')[1] || '';
        const dateB = b.split('/')[1] || '';
        return dateB.localeCompare(dateA); // Descending order (newest first)
      });
      
      // OPTIMIZATION: Check which dates already have broker_transaction_stock_d and broker_transaction_stock_f outputs
      console.log("🔍 Checking existing broker_transaction_stock_d/f folders to skip...");
      const filesToProcess: string[] = [];
      let skippedCount = 0;
      
      for (const file of sortedFiles) {
        const dateFolder = file.split('/')[1] || '';
        const exists = await this.checkBrokerTransactionStockFDExists(dateFolder);
        
        if (exists) {
          skippedCount++;
          console.log(`⏭️ Skipping ${file} - broker_transaction_stock_d/f folders already exist for ${dateFolder}`);
        } else {
          filesToProcess.push(file);
        }
      }
      
      console.log(`📊 Found ${sortedFiles.length} DT files: ${filesToProcess.length} to process, ${skippedCount} skipped (already processed)`);
      return filesToProcess;
    } catch (error) {
      console.error('Error scanning DT files:', error);
      return [];
    }
  }

  /**
   * Check if broker transaction stock folders (d and f) for specific date already exist
   */
  private async checkBrokerTransactionStockFDExists(dateSuffix: string): Promise<boolean> {
    try {
      const prefixD = `broker_transaction_stock/broker_transaction_stock_d_${dateSuffix}/`;
      const prefixF = `broker_transaction_stock/broker_transaction_stock_f_${dateSuffix}/`;
      const existingFilesD = await listPaths({ prefix: prefixD, maxResults: 1 });
      const existingFilesF = await listPaths({ prefix: prefixF, maxResults: 1 });
      return existingFilesD.length > 0 && existingFilesF.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Load and process a single DT file
   * OPTIMIZED: Uses shared cache to avoid repeated downloads
   */
  private async loadAndProcessSingleDtFile(blobName: string): Promise<{ data: TransactionData[], dateSuffix: string } | null> {
    try {
      console.log(`Loading DT file: ${blobName}`);
      
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
      console.log(`✅ Loaded ${data.length} transactions from ${blobName}`);
      
      return { data, dateSuffix };
    } catch (error) {
      console.log(`📄 File not found, will create new: ${blobName}`);
      return null;
    }
  }

  private parseTransactionData(content: string): TransactionData[] {
    const lines = content.trim().split('\n');
    const data: TransactionData[] = [];
    
    if (lines.length < 2) return data;
    
    // Parse header to get column indices (using semicolon separator)
    const header = lines[0]?.split(';') || [];
    console.log(`📋 CSV Header: ${header.join(', ')}`);
    
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
    const invTyp1Index = getColumnIndex('INV_TYP1');
    const invTyp2Index = getColumnIndex('INV_TYP2');
    const trxOrd1Index = getColumnIndex('TRX_ORD1');
    const trxOrd2Index = getColumnIndex('TRX_ORD2');
    
    // Validate required columns exist
    if (stkCodeIndex === -1 || brkCod1Index === -1 || brkCod2Index === -1 || 
        stkVolmIndex === -1 || stkPricIndex === -1 || trxCodeIndex === -1 ||
        trxTimeIndex === -1 || invTyp1Index === -1 || invTyp2Index === -1 ||
        trxOrd1Index === -1 || trxOrd2Index === -1) {
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
          INV_TYP1: values[invTyp1Index]?.trim() || '',
          INV_TYP2: values[invTyp2Index]?.trim() || '',
          TRX_ORD1: parseInt(values[trxOrd1Index]?.trim() || '0', 10) || 0,
          TRX_ORD2: parseInt(values[trxOrd2Index]?.trim() || '0', 10) || 0,
        };
        
        data.push(transaction);
      }
    }
    
    console.log(`📊 Loaded ${data.length} transaction records from Azure (4-character stocks only)`);
    return data;
  }

  /**
   * Create broker transaction files for each stock, separated by investor type (D/F) (pivoted - group by stock, list brokers)
   * OPTIMIZED: Skip files that already exist
   */
  private async createBrokerTransactionPerStock(
    data: TransactionData[], 
    dateSuffix: string,
    progressTracker?: ProgressTracker
  ): Promise<{ files: string[]; stockCount: number }> {
    console.log("\nCreating broker transaction stock files per stock (D/F split, pivoted)...");
    
    // Get unique stock codes
    const uniqueStocks = [...new Set(data.map(row => row.STK_CODE))];
    console.log(`Found ${uniqueStocks.length} unique stocks`);
    
    const createdFiles: string[] = [];
    let processedStockCount = 0;
    
    for (let i = 0; i < uniqueStocks.length; i++) {
      const stock = uniqueStocks[i];
      if (!stock) continue; // Skip if undefined
      let stockProcessed = false;
      
      // Process for both D (Domestik) and F (Foreign)
      for (const invType of ['D', 'F'] as const) {
        const folderPrefix = invType === 'D' ? 'd' : 'f';
        const filename = `broker_transaction_stock/broker_transaction_stock_${folderPrefix}_${dateSuffix}/${stock}.csv`;
        
        console.log(`Processing stock: ${stock} (${invType === 'D' ? 'Domestik' : 'Foreign'})`);
        
        // Filter data for this stock
        const stockData = data.filter(row => row.STK_CODE === stock);
        
        // Filter by investor type
        // For buyer side: check INV_TYP1
        // For seller side: check INV_TYP2
        const filteredStockData = stockData.filter(row => {
          const isBuyer = row.BRK_COD1 !== '';
          const isSeller = row.BRK_COD2 !== '';
          
          if (isBuyer) {
            const buyerInvType = this.getInvestorType(row.INV_TYP1);
            if (buyerInvType === invType) return true;
          }
          if (isSeller) {
            const sellerInvType = this.getInvestorType(row.INV_TYP2);
            if (sellerInvType === invType) return true;
          }
          return false;
        });
        
        if (filteredStockData.length === 0) {
          continue; // Skip if no data for this stock and investor type
        }
        
        // Get unique broker codes (both buyer and seller brokers) for this stock
        const uniqueBrokers = [...new Set([
          ...filteredStockData.map(row => row.BRK_COD1), // buyer brokers
          ...filteredStockData.map(row => row.BRK_COD2)  // seller brokers
        ])];
        
        // Calculate summary for each broker
        const brokerSummary: BrokerTransactionData[] = [];
        
        for (const broker of uniqueBrokers) {
          // Filter transactions for this broker (both as buyer and seller)
          // Also filter by investor type
          const brokerTransactions = filteredStockData.filter(row => {
            const isBuyer = row.BRK_COD1 === broker;
            const isSeller = row.BRK_COD2 === broker;
            
            if (isBuyer) {
              const buyerInvType = this.getInvestorType(row.INV_TYP1);
              return buyerInvType === invType;
            }
            if (isSeller) {
              const sellerInvType = this.getInvestorType(row.INV_TYP2);
              return sellerInvType === invType;
            }
            return false;
          });
          
          if (brokerTransactions.length === 0) {
            continue; // Skip if no data for this broker and investor type
          }
          
          // Separate buyer and seller transactions
          const buyerTransactions = brokerTransactions.filter(t => t.BRK_COD1 === broker);
          const sellerTransactions = brokerTransactions.filter(t => t.BRK_COD2 === broker);
          
          // Calculate buyer data
          const buyerVol = buyerTransactions.reduce((sum, t) => sum + t.STK_VOLM, 0);
          const buyerValue = buyerTransactions.reduce((sum, t) => sum + (t.STK_VOLM * t.STK_PRIC), 0);
          const buyerAvg = buyerVol > 0 ? buyerValue / buyerVol : 0;

          // Calculate seller data
          const sellerVol = sellerTransactions.reduce((sum, t) => sum + t.STK_VOLM, 0);
          const sellerValue = sellerTransactions.reduce((sum, t) => sum + (t.STK_VOLM * t.STK_PRIC), 0);
          const sellerAvg = sellerVol > 0 ? sellerValue / sellerVol : 0;
          
          // Calculate frequencies and order numbers
          const buyerTxCodes = new Set<string>();
          const sellerTxCodes = new Set<string>();
          const buyerOrdNums = new Set<number>();
          const sellerOrdNums = new Set<number>();
          
          buyerTransactions.forEach(t => {
            if (t.TRX_CODE) buyerTxCodes.add(t.TRX_CODE);
            if (t.TRX_ORD1 > 0) buyerOrdNums.add(t.TRX_ORD1);
          });
          
          sellerTransactions.forEach(t => {
            if (t.TRX_CODE) sellerTxCodes.add(t.TRX_CODE);
            if (t.TRX_ORD2 > 0) sellerOrdNums.add(t.TRX_ORD2);
          });
          
        const buyerFreq = buyerTxCodes.size;
        const sellerFreq = sellerTxCodes.size;
        const oldBuyerOrdNum = buyerOrdNums.size;
        const oldSellerOrdNum = sellerOrdNums.size;
        
        // Calculate BuyerOrdNum and SellerOrdNum (grouping by time after 08:58:00)
        const { newBuyerOrdNum, newSellerOrdNum } = this.calculateNewOrderNumbers(
          buyerTransactions,
          sellerTransactions,
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
        
        // Save to Azure
        await this.saveToAzure(filename, brokerSummary);
        createdFiles.push(filename);
        
        console.log(`Created ${filename} with ${brokerSummary.length} brokers`);
        
        // Mark stock as processed if at least one investor type has data
        if (!stockProcessed && brokerSummary.length > 0) {
          stockProcessed = true;
        }
      }
      
      // Update progress tracker after each stock (count once per stock, not per investor type)
      if (stockProcessed && progressTracker) {
        progressTracker.processedStocks++;
        await progressTracker.updateProgress();
        processedStockCount++;
      }
    }
    
    console.log(`Created ${createdFiles.length} broker transaction stock files`);
    return { files: createdFiles, stockCount: processedStockCount };
  }

  /**
   * Save data to Azure Blob Storage
   */
  private async saveToAzure(filename: string, data: any[]): Promise<string> {
    if (data.length === 0) {
      console.log(`No data to save for ${filename}`);
      return filename;
    }
    
    // Convert to CSV format
    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row => headers.map(header => row[header]).join(','))
    ].join('\n');
    
    await uploadText(filename, csvContent, 'text/csv');
    console.log(`Saved ${data.length} records to ${filename}`);
    return filename;
  }

  /**
   * Process a single DT file with broker transaction analysis (pivoted by stock, D/F split)
   * OPTIMIZED: Double-check folders don't exist before processing (race condition protection)
   */
  private async processSingleDtFile(blobName: string, progressTracker?: ProgressTracker): Promise<{ success: boolean; dateSuffix: string; files: string[]; timing?: any; stockCount?: number }> {
    // Extract date before loading to check early
    const pathParts = blobName.split('/');
    const dateFolder = pathParts[1] || 'unknown';
    
    // OPTIMIZATION: Double-check folders don't exist (race condition protection)
    const exists = await this.checkBrokerTransactionStockFDExists(dateFolder);
    if (exists) {
      console.log(`⏭️ Skipping ${blobName} - broker_transaction_stock_d/f folders already exist for ${dateFolder} (race condition check)`);
      return { success: false, dateSuffix: dateFolder, files: [] };
    }
    
    const result = await this.loadAndProcessSingleDtFile(blobName);
    
    if (!result) {
      return { success: false, dateSuffix: dateFolder, files: [] };
    }
    
    const { data, dateSuffix } = result;
    
    if (data.length === 0) {
      console.log(`⚠️ No transaction data in ${blobName} - skipping`);
      return { success: false, dateSuffix, files: [] };
    }
    
    console.log(`🔄 Processing ${blobName} (${data.length} transactions)...`);
    
    try {
      // Track timing
      const timing = {
        brokerTransactionStock: 0
      };
      
      // Create broker transaction stock files
      const startTime = Date.now();
      const result = await this.createBrokerTransactionPerStock(data, dateSuffix, progressTracker);
      timing.brokerTransactionStock = Math.round((Date.now() - startTime) / 1000);
      
      const allFiles = result.files;
      const stockCount = result.stockCount;
      
      console.log(`✅ Completed processing ${blobName} - ${allFiles.length} files created, ${stockCount} stocks processed`);
      return { success: true, dateSuffix, files: allFiles, timing, stockCount };
      
    } catch (error) {
      console.error(`Error processing ${blobName}:`, error);
      return { success: false, dateSuffix, files: [] };
    }
  }

  /**
   * Main function to generate broker transaction data for all DT files (D/F split, pivoted by stock)
   */
  /**
   * Pre-count total unique stocks from all DT files that need processing
   * This is used for accurate progress tracking (per stock per investor type)
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
              t.STK_CODE && t.STK_CODE.length === 4
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
    // Estimate: stocks per investor type (D/F) = unique stocks * 2 types * 1.5x for overlap
    return Math.round(allStocks.size * 2 * 1.5);
  }

  public async generateBrokerTransactionData(_dateSuffix: string, logId?: string | null): Promise<{ success: boolean; message: string; data?: any }> {
    const startTime = Date.now();
    let datesToProcess: Set<string> = new Set();
    
    try {
      console.log(`Starting broker transaction stock data analysis (D/F split, pivoted by stock) for all DT files...`);
      
      // Find all DT files (sudah filter yang belum ada output)
      const dtFiles = await this.findAllDtFiles();
      
      if (dtFiles.length === 0) {
        console.log(`⚠️ No DT files found in done-summary folder`);
        return {
          success: true,
          message: `No DT files found - skipped broker transaction stock data generation`,
          data: { skipped: true, reason: 'No DT files found' }
        };
      }
      
      console.log(`📊 Processing ${dtFiles.length} DT files...`);
      
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
      const estimatedTotalStocks = await this.preCountTotalStocks(dtFiles);
      
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
      
      // Process files in batches (Phase 6: 6 files at a time)
      const BATCH_SIZE = BATCH_SIZE_PHASE_6; // Phase 6: 6 files
      const MAX_CONCURRENT = MAX_CONCURRENT_REQUESTS_PHASE_6; // Phase 6: 3 concurrent
      const allResults: { success: boolean; dateSuffix: string; files: string[]; timing?: any; stockCount?: number }[] = [];
      let processed = 0;
      let successful = 0;
      
      for (let i = 0; i < dtFiles.length; i += BATCH_SIZE) {
        const batch = dtFiles.slice(i, i + BATCH_SIZE);
        const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
        console.log(`📦 Processing batch ${batchNumber}/${Math.ceil(dtFiles.length / BATCH_SIZE)} (${batch.length} files)`);
        
        // Update progress before batch (showing DT file progress)
        if (logId) {
          await SchedulerLogService.updateLog(logId, {
            progress_percentage: estimatedTotalStocks > 0 
              ? Math.round((progressTracker.processedStocks / estimatedTotalStocks) * 100)
              : Math.round((processed / dtFiles.length) * 100),
            current_processing: `Processing batch ${batchNumber}/${Math.ceil(dtFiles.length / BATCH_SIZE)} (${processed}/${dtFiles.length} dates, ${progressTracker.processedStocks.toLocaleString()}/${estimatedTotalStocks.toLocaleString()} stocks)`
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
          console.log(`📊 Batch ${batchNumber} complete - Memory: ${heapUsedMB.toFixed(2)}MB`);
        }
        
        // Collect results
        batchResults.forEach((result) => {
          if (result && result.success !== undefined) {
            allResults.push(result);
            processed++;
            if (result.success) {
              successful++;
            }
          }
        });
        
        const batchStockCount = batchResults.reduce((sum, r: any) => sum + (r?.stockCount || 0), 0);
        console.log(`📊 Batch ${batchNumber} complete: ✅ ${successful}/${processed} successful, ${batchStockCount} stocks processed, ${progressTracker.processedStocks.toLocaleString()}/${estimatedTotalStocks.toLocaleString()} total stocks processed`);
        
        // Update progress after batch (based on stocks processed)
        if (logId) {
          await SchedulerLogService.updateLog(logId, {
            progress_percentage: estimatedTotalStocks > 0 
              ? Math.round((progressTracker.processedStocks / estimatedTotalStocks) * 100)
              : Math.round((processed / dtFiles.length) * 100),
            current_processing: `Completed batch ${batchNumber}/${Math.ceil(dtFiles.length / BATCH_SIZE)} (${processed}/${dtFiles.length} dates, ${progressTracker.processedStocks.toLocaleString()}/${estimatedTotalStocks.toLocaleString()} stocks processed)`
          });
        }
        
        // Small delay between batches
        if (i + BATCH_SIZE < dtFiles.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      const totalFiles = allResults.reduce((sum, result) => sum + result.files.length, 0);
      const totalDuration = Math.round((Date.now() - startTime) / 1000);
      
      // Calculate breakdown of output files by type and aggregate timing
      let brokerTransactionStockFiles = 0;
      
      const totalTiming = {
        brokerTransactionStock: 0
      };
      
      allResults.forEach(result => {
        if (result.success) {
          result.files.forEach(file => {
            if (file.includes('broker_transaction_stock/') && !file.includes('ALLSUM')) {
              brokerTransactionStockFiles++;
            }
          });
          
          // Aggregate timing if available
          if (result.timing) {
            totalTiming.brokerTransactionStock += result.timing.brokerTransactionStock || 0;
          }
        }
      });
      
      console.log(`✅ Broker transaction stock data analysis (D/F split) completed!`);
      console.log(`📊 Processed: ${processed}/${dtFiles.length} DT files`);
      console.log(`📊 Successful: ${successful}/${processed} files`);
      console.log(`📊 Total output files: ${totalFiles}`);
      console.log(`📊 Output breakdown:`);
      console.log(`   📊 Broker Transaction Stock files (D/F): ${brokerTransactionStockFiles} (${totalTiming.brokerTransactionStock}s)`);
      console.log(`✅ Broker Transaction Stock Data (D/F) calculation completed successfully`);
      console.log(`✅ Broker Transaction Stock Data (D/F) completed in ${totalDuration}s`);
      
      return {
        success: true,
        message: `Broker transaction stock data (D/F split) generated successfully for ${successful}/${processed} DT files`,
        data: {
          totalDtFiles: dtFiles.length,
          processedFiles: processed,
          successfulFiles: successful,
          totalOutputFiles: totalFiles,
          duration: totalDuration,
          outputBreakdown: {
            brokerTransactionStockFiles
          },
          timingBreakdown: totalTiming,
          results: allResults.filter(r => r.success)
        }
      };
      
    } catch (error) {
      console.error('Error generating broker transaction stock data (D/F):', error);
      return {
        success: false,
        message: `Failed to generate broker transaction stock data (D/F): ${error instanceof Error ? error.message : 'Unknown error'}`
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

export default BrokerTransactionStockFDCalculator;

