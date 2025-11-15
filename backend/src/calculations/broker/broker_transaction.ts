import { downloadText, uploadText, listPaths, exists } from '../../utils/azureBlob';
import { BATCH_SIZE_PHASE_6 } from '../../services/dataUpdateService';

// Type definitions
interface TransactionData {
  STK_CODE: string;
  BRK_COD1: string; // Buyer broker
  BRK_COD2: string; // Seller broker
  STK_VOLM: number;
  STK_PRIC: number;
  TRX_CODE: string;
  TRX_TIME: string; // Transaction time (HH:MM:SS or HHMMSS)
  TRX_ORD1: number; // Order reference 1 (buyer)
  TRX_ORD2: number; // Order reference 2 (seller)
}

interface BrokerTransactionData {
  Emiten: string;
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

export class BrokerTransactionCalculator {
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
   * Find all DT files in done-summary folder
   * OPTIMIZED: Skip files where broker_transaction folder already exists
   */
  private async findAllDtFiles(): Promise<string[]> {
    console.log("Scanning all DT files in done-summary folder...");
    
    try {
      const allFiles = await listPaths({ prefix: 'done-summary/' });
      const dtFiles = allFiles.filter(file => 
        file.includes('/DT') && file.endsWith('.csv')
      );
      
      // Sort by date descending (newest first)
      const sortedFiles = dtFiles.sort((a, b) => {
        const dateA = a.split('/')[1] || '';
        const dateB = b.split('/')[1] || '';
        return dateB.localeCompare(dateA); // Descending order (newest first)
      });
      
      // OPTIMIZATION: Check which dates already have broker_transaction output
      console.log("🔍 Checking existing broker_transaction folders to skip...");
      const filesToProcess: string[] = [];
      let skippedCount = 0;
      
      for (const file of sortedFiles) {
        const dateFolder = file.split('/')[1] || '';
        const exists = await this.checkBrokerTransactionExists(dateFolder);
        
        if (exists) {
          skippedCount++;
          console.log(`⏭️ Skipping ${file} - broker_transaction/broker_transaction_${dateFolder}/ already exists`);
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
   * Load and process a single DT file
   */
  private async loadAndProcessSingleDtFile(blobName: string): Promise<{ data: TransactionData[], dateSuffix: string } | null> {
    try {
      console.log(`Loading DT file: ${blobName}`);
      const content = await downloadText(blobName);
      
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
    const trxOrd1Index = getColumnIndex('TRX_ORD1');
    const trxOrd2Index = getColumnIndex('TRX_ORD2');
    
    // Validate required columns exist
    if (stkCodeIndex === -1 || brkCod1Index === -1 || brkCod2Index === -1 || 
        stkVolmIndex === -1 || stkPricIndex === -1 || trxCodeIndex === -1 ||
        trxTimeIndex === -1 || trxOrd1Index === -1 || trxOrd2Index === -1) {
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
   * Check if broker transaction folder for specific date already exists
   */
  private async checkBrokerTransactionExists(dateSuffix: string): Promise<boolean> {
    try {
      const prefix = `broker_transaction/broker_transaction_${dateSuffix}/`;
      const existingFiles = await listPaths({ prefix, maxResults: 1 });
      return existingFiles.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Create broker transaction files for each broker
   * OPTIMIZED: Skip files that already exist
   */
  private async createBrokerTransactionPerBroker(
    data: TransactionData[], 
    dateSuffix: string
  ): Promise<string[]> {
    console.log("\nCreating broker transaction files per broker...");
    
    // Get unique broker codes (both buyer and seller brokers)
    const uniqueBrokers = [...new Set([
      ...data.map(row => row.BRK_COD1), // buyer brokers
      ...data.map(row => row.BRK_COD2)  // seller brokers
    ])];
    console.log(`Found ${uniqueBrokers.length} unique brokers`);
    
    const createdFiles: string[] = [];
    const skippedFiles: string[] = [];
    
    for (const broker of uniqueBrokers) {
      const filename = `broker_transaction/broker_transaction_${dateSuffix}/${broker}.csv`;
      
      // OPTIMIZATION: Check if file already exists - skip if exists
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
      
      console.log(`Processing broker: ${broker}`);
      
      // Filter data for this broker (both as buyer and seller)
      const brokerData = data.filter(row => row.BRK_COD1 === broker || row.BRK_COD2 === broker);
      
      // Group by stock code for this broker
      const stockGroups = new Map<string, TransactionData[]>();
      brokerData.forEach(row => {
        const stock = row.STK_CODE;
        if (!stockGroups.has(stock)) {
          stockGroups.set(stock, []);
        }
        stockGroups.get(stock)!.push(row);
      });
      
      // Calculate summary for each stock
      const stockSummary: BrokerTransactionData[] = [];
      
      stockGroups.forEach((transactions, stock) => {
        // Separate buyer and seller transactions
        const buyerTransactions = transactions.filter(t => t.BRK_COD1 === broker);
        const sellerTransactions = transactions.filter(t => t.BRK_COD2 === broker);
        
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
        // const netBuyLotPerFreq = netBuyFreq !== 0 ? netBuyLot / Math.abs(netBuyFreq) : 0;
        // const netSellLotPerFreq = netSellFreq !== 0 ? netSellLot / Math.abs(netSellFreq) : 0;
        const netBuyLotPerFreq = netBuyFreq !== 0 ? netBuyLot / netBuyFreq : 0;
        const netSellLotPerFreq = netSellFreq !== 0 ? netSellLot / netSellFreq : 0;
        
        // Calculate Lot/ON (Lot per Order Number) - use New values
        const buyerLotPerOrdNum = newBuyerOrdNum > 0 ? buyerLot / newBuyerOrdNum : 0;
        const sellerLotPerOrdNum = newSellerOrdNum > 0 ? sellerLot / newSellerOrdNum : 0;
        // const netBuyLotPerOrdNum = netBuyOrdNum !== 0 ? netBuyLot / Math.abs(netBuyOrdNum) : 0;
        // const netSellLotPerOrdNum = netSellOrdNum !== 0 ? netSellLot / Math.abs(netSellOrdNum) : 0;
        const netBuyLotPerOrdNum = netBuyOrdNum !== 0 ? netBuyLot / netBuyOrdNum : 0;
        const netSellLotPerOrdNum = netSellOrdNum !== 0 ? netSellLot / netSellOrdNum : 0;
        
        stockSummary.push({
          Emiten: stock,
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
      });
      
      // Sort by net buy value descending (same as generateBrokerTransactionTest.ts)
      stockSummary.sort((a, b) => b.NetBuyValue - a.NetBuyValue);
      
      // Save to Azure
      await this.saveToAzure(filename, stockSummary);
      createdFiles.push(filename);
      
      console.log(`Created ${filename} with ${stockSummary.length} stocks`);
    }
    
    if (skippedFiles.length > 0) {
      console.log(`⏭️ Skipped ${skippedFiles.length} broker transaction files that already exist`);
    }
    
    console.log(`Created ${createdFiles.length} broker transaction files`);
    return createdFiles;
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
   * Process a single DT file with broker transaction analysis
   * OPTIMIZED: Double-check folder doesn't exist before processing (race condition protection)
   */
  private async processSingleDtFile(blobName: string): Promise<{ success: boolean; dateSuffix: string; files: string[]; timing?: any }> {
    // Extract date before loading to check early
    const pathParts = blobName.split('/');
    const dateFolder = pathParts[1] || 'unknown';
    
    // OPTIMIZATION: Double-check folder doesn't exist (race condition protection)
    const exists = await this.checkBrokerTransactionExists(dateFolder);
    if (exists) {
      console.log(`⏭️ Skipping ${blobName} - broker_transaction/broker_transaction_${dateFolder}/ already exists (race condition check)`);
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
        brokerTransaction: 0
      };
      
      // Create broker transaction files
      const startTime = Date.now();
      const brokerTransactionFiles = await this.createBrokerTransactionPerBroker(data, dateSuffix);
      timing.brokerTransaction = Math.round((Date.now() - startTime) / 1000);
      
      const allFiles = [
        ...brokerTransactionFiles
      ];
      
      console.log(`✅ Completed processing ${blobName} - ${allFiles.length} files created`);
      return { success: true, dateSuffix, files: allFiles, timing };
      
    } catch (error) {
      console.error(`Error processing ${blobName}:`, error);
      return { success: false, dateSuffix, files: [] };
    }
  }

  /**
   * Main function to generate broker transaction data for all DT files
   */
  public async generateBrokerTransactionData(_dateSuffix: string): Promise<{ success: boolean; message: string; data?: any }> {
    const startTime = Date.now();
    try {
      console.log(`Starting broker transaction data analysis for all DT files...`);
      
      // Find all DT files
      const dtFiles = await this.findAllDtFiles();
      
      if (dtFiles.length === 0) {
        console.log(`⚠️ No DT files found in done-summary folder`);
        return {
          success: true,
          message: `No DT files found - skipped broker transaction data generation`,
          data: { skipped: true, reason: 'No DT files found' }
        };
      }
      
      console.log(`📊 Processing ${dtFiles.length} DT files...`);
      
      // Process files in batches for speed (1 file at a time to prevent OOM)
      const BATCH_SIZE = BATCH_SIZE_PHASE_6; // Phase 6: 1 file at a time
      const allResults: { success: boolean; dateSuffix: string; files: string[]; timing?: any }[] = [];
      let processed = 0;
      let successful = 0;
      
      for (let i = 0; i < dtFiles.length; i += BATCH_SIZE) {
        const batch = dtFiles.slice(i, i + BATCH_SIZE);
        console.log(`📦 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(dtFiles.length / BATCH_SIZE)} (${batch.length} files)`);
        
        // Process batch in parallel
        const batchResults = await Promise.allSettled(
          batch.map(blobName => this.processSingleDtFile(blobName))
        );
        
        // Force garbage collection after each batch
        if (global.gc) {
          global.gc();
        }
        
        // Collect results
        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            allResults.push(result.value);
            processed++;
            if (result.value.success) {
              successful++;
            }
          } else {
            console.error(`Error processing ${batch[index]}:`, result.reason);
            processed++;
          }
        });
        
        console.log(`📊 Batch complete: ${successful}/${processed} successful`);
        
        // Small delay between batches
        if (i + BATCH_SIZE < dtFiles.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      const totalFiles = allResults.reduce((sum, result) => sum + result.files.length, 0);
      const totalDuration = Math.round((Date.now() - startTime) / 1000);
      
      // Calculate breakdown of output files by type and aggregate timing
      let brokerTransactionFiles = 0;
      
      const totalTiming = {
        brokerTransaction: 0
      };
      
      allResults.forEach(result => {
        if (result.success) {
          result.files.forEach(file => {
            if (file.includes('broker_transaction/') && !file.includes('ALLSUM')) {
              brokerTransactionFiles++;
            }
          });
          
          // Aggregate timing if available
          if (result.timing) {
            totalTiming.brokerTransaction += result.timing.brokerTransaction || 0;
          }
        }
      });
      
      console.log(`✅ Broker transaction data analysis completed!`);
      console.log(`📊 Processed: ${processed}/${dtFiles.length} DT files`);
      console.log(`📊 Successful: ${successful}/${processed} files`);
      console.log(`📊 Total output files: ${totalFiles}`);
      console.log(`📊 Output breakdown:`);
      console.log(`   📊 Broker Transaction files: ${brokerTransactionFiles} (${totalTiming.brokerTransaction}s)`);
      console.log(`✅ Broker Transaction Data calculation completed successfully`);
      console.log(`✅ Broker Transaction Data completed in ${totalDuration}s`);
      
      return {
        success: true,
        message: `Broker transaction data generated successfully for ${successful}/${processed} DT files`,
        data: {
          totalDtFiles: dtFiles.length,
          processedFiles: processed,
          successfulFiles: successful,
          totalOutputFiles: totalFiles,
          duration: totalDuration,
          outputBreakdown: {
            brokerTransactionFiles
          },
          timingBreakdown: totalTiming,
          results: allResults.filter(r => r.success)
        }
      };
      
    } catch (error) {
      console.error('Error generating broker transaction data:', error);
      return {
        success: false,
        message: `Failed to generate broker transaction data: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}

export default BrokerTransactionCalculator;
