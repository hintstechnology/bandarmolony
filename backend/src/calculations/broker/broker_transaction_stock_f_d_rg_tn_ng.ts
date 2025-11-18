import { downloadText, uploadText, listPaths, exists } from '../../utils/azureBlob';
import { BATCH_SIZE_PHASE_6 } from '../../services/dataUpdateService';

// Type definitions
type TransactionType = 'RG' | 'TN' | 'NG';
type InvestorType = 'D' | 'F';
interface TransactionData {
  STK_CODE: string;
  BRK_COD1: string; // Buyer broker
  BRK_COD2: string; // Seller broker
  STK_VOLM: number;
  STK_PRIC: number;
  TRX_CODE: string;
  TRX_TYPE: string; // field tambahan
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

export class BrokerTransactionStockFDRGTNNGCalculator {
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
   * Check if broker transaction stock folder for specific date, type, and investor type already exists
   */
  private async checkBrokerTransactionStockFDRGTNNGExists(dateSuffix: string, type: TransactionType, investorType: InvestorType): Promise<boolean> {
    try {
      const typeName = type.toLowerCase();
      const prefix = `broker_transaction_stock_${typeName}_${investorType.toLowerCase()}/broker_transaction_stock_${typeName}_${investorType.toLowerCase()}_${dateSuffix}/`;
      const existingFiles = await listPaths({ prefix, maxResults: 1 });
      return existingFiles.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if all combinations (RG/TN/NG x D/F) already exist for a date
   */
  private async checkAllCombinationsExist(dateSuffix: string): Promise<boolean> {
    const types: TransactionType[] = ['RG', 'TN', 'NG'];
    const investorTypes: InvestorType[] = ['D', 'F'];
    for (const type of types) {
      for (const investorType of investorTypes) {
        const exists = await this.checkBrokerTransactionStockFDRGTNNGExists(dateSuffix, type, investorType);
        if (!exists) {
          return false; // At least one combination is missing
        }
      }
    }
    return true; // All combinations exist
  }

  private async findAllDtFiles(): Promise<string[]> {
    console.log('🔍 Scanning for DT files in done-summary folder...');
    try {
      const allFiles = await listPaths({ prefix: 'done-summary/' });
      console.log(`📁 Found ${allFiles.length} total files in done-summary folder`);
      const dtFiles = allFiles.filter(file => file.includes('/DT') && file.endsWith('.csv'));
      
      // Sort by date descending (newest first)
      const sortedFiles = dtFiles.sort((a, b) => {
        const dateA = a.split('/')[1] || '';
        const dateB = b.split('/')[1] || '';
        return dateB.localeCompare(dateA); // Descending order
      });
      
      // OPTIMIZATION: Check which dates already have all broker_transaction_stock_rg/tn/ng_d/f outputs
      console.log("🔍 Checking existing broker_transaction_stock_rg/tn/ng_d/f folders to skip...");
      const filesToProcess: string[] = [];
      let skippedCount = 0;
      
      for (const file of sortedFiles) {
        const dateFolder = file.split('/')[1] || '';
        const allExist = await this.checkAllCombinationsExist(dateFolder);
        
        if (allExist) {
          skippedCount++;
          console.log(`⏭️ Skipping ${file} - broker_transaction_stock_rg/tn/ng_d/f folders already exist for ${dateFolder}`);
        } else {
          filesToProcess.push(file);
        }
      }
      
      console.log(`📊 Found ${sortedFiles.length} DT files: ${filesToProcess.length} to process, ${skippedCount} skipped (already processed)`);
      
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
    } catch (error: any) {
      console.error('❌ Error finding DT files:', error.message);
      return [];
    }
  }

  /**
   * Process a single DT file with broker transaction analysis (RG/TN/NG x D/F split, pivoted by stock)
   * OPTIMIZED: Double-check folders don't exist before processing (race condition protection)
   */
  private async processSingleDtFile(blobName: string): Promise<{ success: boolean; dateSuffix: string; files: string[]; timing?: any }> {
    // Extract date before loading to check early
    const pathParts = blobName.split('/');
    const dateFolder = pathParts[1] || 'unknown';
    const dateSuffix = dateFolder;
    
    // OPTIMIZATION: Double-check all combinations don't exist (race condition protection)
    const allExist = await this.checkAllCombinationsExist(dateFolder);
    if (allExist) {
      console.log(`⏭️ Skipping ${blobName} - broker_transaction_stock_rg/tn/ng_d/f folders already exist for ${dateFolder} (race condition check)`);
      return { success: false, dateSuffix: dateFolder, files: [] };
    }
    
    try {
      console.log(`📥 Downloading file: ${blobName}`);
      const content = await downloadText(blobName);
      if (!content || content.trim().length === 0) {
        console.warn(`⚠️ Empty file or no content: ${blobName}`);
        return { success: false, dateSuffix, files: [] };
      }
      console.log(`✅ Downloaded ${blobName} (${content.length} characters)`);
      console.log(`📅 Extracted date suffix: ${dateSuffix} from ${blobName}`);
      
      const data = this.parseTransactionData(content);
      console.log(`✅ Parsed ${data.length} transactions from ${blobName}`);
      
      if (data.length === 0) {
        console.log(`⚠️ No transaction data in ${blobName} - skipping`);
        return { success: false, dateSuffix, files: [] };
      }
      
      console.log(`🔄 Processing ${blobName} (${data.length} transactions) for RG/TN/NG x D/F (pivoted by stock)...`);
      
      // Track timing
      const timing = {
        brokerTransactionStockRG_D: 0,
        brokerTransactionStockRG_F: 0,
        brokerTransactionStockTN_D: 0,
        brokerTransactionStockTN_F: 0,
        brokerTransactionStockNG_D: 0,
        brokerTransactionStockNG_F: 0
      };
      
      const allFiles: string[] = [];
      
      // Process each combination (RG/TN/NG x D/F)
      const types: TransactionType[] = ['RG', 'TN', 'NG'];
      const investorTypes: InvestorType[] = ['D', 'F'];
      
      for (const type of types) {
        const typeFiltered = this.filterByType(data, type);
        if (typeFiltered.length === 0) {
          console.log(`⏭️ Skipping ${dateSuffix} (${type}) - no ${type} transactions found`);
          continue;
        }
        
        for (const investorType of investorTypes) {
          const filtered = this.filterByInvestorType(typeFiltered, investorType);
          if (filtered.length === 0) {
            console.log(`⏭️ Skipping ${dateSuffix} (${type}, ${investorType}) - no transactions found`);
            continue;
          }
          
          const startTime = Date.now();
          const transactionFiles = await this.createBrokerTransactionPerStock(filtered, dateSuffix, type, investorType);
          const duration = Math.round((Date.now() - startTime) / 1000);
          
          const key = `brokerTransactionStock${type}_${investorType}` as keyof typeof timing;
          if (key in timing) {
            timing[key] = duration;
          }
          
          allFiles.push(...transactionFiles);
          console.log(`✅ Created ${transactionFiles.length} broker transaction stock files for ${dateSuffix} (${type}, ${investorType})`);
        }
      }
      
      console.log(`✅ Completed processing ${blobName} - ${allFiles.length} files created`);
      return { success: true, dateSuffix, files: allFiles, timing };
      
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
    const iINV_TYP1 = getIdx('INV_TYP1');
    const iINV_TYP2 = getIdx('INV_TYP2');
    const iTRX_ORD1 = getIdx('TRX_ORD1');
    const iTRX_ORD2 = getIdx('TRX_ORD2');
    if ([iSTK_CODE, iBRK_COD1, iBRK_COD2, iSTK_VOLM, iSTK_PRIC, iTRX_CODE, iTRX_TYPE, iTRX_TIME, iINV_TYP1, iINV_TYP2, iTRX_ORD1, iTRX_ORD2].some(k => k === -1)) return [];
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
          INV_TYP1: values[iINV_TYP1]?.trim() || '',
          INV_TYP2: values[iINV_TYP2]?.trim() || '',
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

  private filterByInvestorType(data: TransactionData[], investorType: InvestorType): TransactionData[] {
    // Filter transactions where:
    // - For D (Domestik): INV_TYP1 = 'I' (buyer) OR INV_TYP2 = 'I' (seller)
    // - For F (Foreign): INV_TYP1 = 'A' (buyer) OR INV_TYP2 = 'A' (seller)
    // This means: if broker is buyer and INV_TYP1 matches, OR broker is seller and INV_TYP2 matches
    if (investorType === 'D') {
      return data.filter(row => row.INV_TYP1 === 'I' || row.INV_TYP2 === 'I');
    } else {
      return data.filter(row => row.INV_TYP1 === 'A' || row.INV_TYP2 === 'A');
    }
  }

  private getTransactionPaths(type: TransactionType, investorType: InvestorType, dateSuffix: string) {
    // Use lowercase type directly (RG -> rg, TN -> tn, NG -> ng)
    // Use lowercase investor type (D -> d, F -> f)
    const typeName = type.toLowerCase();
    const investorTypeName = investorType.toLowerCase();
    return {
      brokerTransaction: `broker_transaction_stock_${typeName}_${investorTypeName}/broker_transaction_stock_${typeName}_${investorTypeName}_${dateSuffix}`
    };
  }

  private async createBrokerTransactionPerStock(data: TransactionData[], dateSuffix: string, type: TransactionType, investorType: InvestorType): Promise<string[]> {
    const paths = this.getTransactionPaths(type, investorType, dateSuffix);
    // Get unique stock codes (pivoted - group by stock)
    const uniqueStocks = [...new Set(data.map(r => r.STK_CODE))];
    const createdFiles: string[] = [];
    const skippedFiles: string[] = [];
    
    for (const stock of uniqueStocks) {
      const filename = `${paths.brokerTransaction}/${stock}.csv`;
      
      // Check if file already exists - skip if exists
      try {
        const fileExists = await exists(filename);
        if (fileExists) {
          console.log(`⏭️ Skipping ${filename} - file already exists`);
          skippedFiles.push(filename);
          continue;
        }
      } catch (error: any) {
        // If check fails, continue with generation (might be folder not found yet)
        console.log(`ℹ️ Could not check existence of ${filename}, proceeding with generation`);
      }
      
      console.log(`Processing stock: ${stock} (${type}, ${investorType})`);
      
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
        // But also filter by investor type:
        // - For buyer: check INV_TYP1 matches investorType
        // - For seller: check INV_TYP2 matches investorType
        const brokerTransactions = stockData.filter(row => {
          if (row.BRK_COD1 === broker) {
            // Broker is buyer - check INV_TYP1
            return (investorType === 'D' && row.INV_TYP1 === 'I') || (investorType === 'F' && row.INV_TYP1 === 'A');
          } else if (row.BRK_COD2 === broker) {
            // Broker is seller - check INV_TYP2
            return (investorType === 'D' && row.INV_TYP2 === 'I') || (investorType === 'F' && row.INV_TYP2 === 'A');
          }
          return false;
        });
        
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
    }
    
    if (skippedFiles.length > 0) {
      console.log(`⏭️ Skipped ${skippedFiles.length} broker transaction stock files that already exist`);
    }
    
    return createdFiles;
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
   * Main function to generate broker transaction data for all DT files (RG/TN/NG x D/F split, pivoted by stock)
   * OPTIMIZED: Batch processing with skip logic
   */
  public async generateBrokerTransactionData(_dateSuffix?: string): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      console.log(`🔄 Starting Broker Transaction Stock RG/TN/NG x D/F calculation...`);
      const dtFiles = await this.findAllDtFiles();
      
      if (dtFiles.length === 0) {
        console.log(`✅ No DT files to process - skipped broker transaction stock RG/TN/NG x D/F data generation`);
        return { success: true, message: `No DT files found - skipped broker transaction stock RG/TN/NG x D/F data generation` };
      }
      
      console.log(`📊 Processing ${dtFiles.length} DT files in batches of ${BATCH_SIZE_PHASE_6}...`);
      
      let totalProcessed = 0;
      let totalSkipped = 0;
      let totalFilesCreated = 0;
      let totalErrors = 0;
      
      // Process in batches to manage memory
      for (let i = 0; i < dtFiles.length; i += BATCH_SIZE_PHASE_6) {
        const batch = dtFiles.slice(i, i + BATCH_SIZE_PHASE_6);
        const batchNum = Math.floor(i / BATCH_SIZE_PHASE_6) + 1;
        const totalBatches = Math.ceil(dtFiles.length / BATCH_SIZE_PHASE_6);
        
        console.log(`\n📦 Processing batch ${batchNum}/${totalBatches} (${batch.length} files)...`);
        
        const batchResults = await Promise.allSettled(
          batch.map(blobName => this.processSingleDtFile(blobName))
        );
        
        // Collect results
        for (const result of batchResults) {
          if (result.status === 'fulfilled') {
            const { success, files, dateSuffix } = result.value;
            if (success) {
              totalProcessed++;
              totalFilesCreated += files.length;
              console.log(`✅ ${dateSuffix}: ${files.length} files created`);
            } else {
              totalSkipped++;
              console.log(`⏭️ ${dateSuffix}: Skipped (already exists or no data)`);
            }
          } else {
            totalErrors++;
            console.error(`❌ Error in batch:`, result.reason);
          }
        }
        
        console.log(`📊 Batch ${batchNum}/${totalBatches} complete: ${totalProcessed} processed, ${totalSkipped} skipped, ${totalErrors} errors`);
      }
      
      const message = `Broker Transaction Stock RG/TN/NG x D/F data generated: ${totalProcessed} dates processed, ${totalFilesCreated} files created, ${totalSkipped} skipped, ${totalErrors} errors`;
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
    }
  }
}

export default BrokerTransactionStockFDRGTNNGCalculator;

