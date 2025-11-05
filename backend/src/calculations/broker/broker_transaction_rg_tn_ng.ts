import { downloadText, uploadText, listPaths, exists } from '../../utils/azureBlob';
import { BATCH_SIZE_PHASE_6 } from '../../services/dataUpdateService';

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
  BuyerOrdNum: number; // Unique count of TRX_ORD1
  // Sell side (when broker is seller - BRK_COD2)
  SellerVol: number;
  SellerValue: number;
  SellerAvg: number;
  SellerFreq: number; // Count of unique TRX_CODE
  SellerOrdNum: number; // Unique count of TRX_ORD2
  // Net Buy
  NetBuyVol: number;
  NetBuyValue: number;
  NetBuyAvg: number;
  NetBuyFreq: number; // BuyerFreq - SellerFreq (can be negative)
  NetBuyOrdNum: number; // BuyerOrdNum - SellerOrdNum (can be negative)
  // Net Sell
  NetSellVol: number;
  NetSellValue: number;
  NetSellAvg: number;
  NetSellFreq: number; // SellerFreq - BuyerFreq (can be negative)
  NetSellOrdNum: number; // SellerOrdNum - BuyerOrdNum (can be negative)
}

export class BrokerTransactionRGTNNGCalculator {
  constructor() { }

  /**
   * Check if broker transaction folder for specific date and type already exists
   */
  private async checkBrokerTransactionRGTNNGExists(dateSuffix: string, type: TransactionType): Promise<boolean> {
    try {
      const name = type.toLowerCase();
      const prefix = `broker_transaction_${name}/broker_transaction_${name}_${dateSuffix}/`;
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
      const exists = await this.checkBrokerTransactionRGTNNGExists(dateSuffix, type);
      if (!exists) {
        return false; // At least one type is missing
      }
    }
    return true; // All types exist
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
      
      // OPTIMIZATION: Check which dates already have all broker_transaction_rg_tn_ng outputs
      console.log("🔍 Checking existing broker_transaction_rg/tn/ng folders to skip...");
      const filesToProcess: string[] = [];
      let skippedCount = 0;
      
      for (const file of sortedFiles) {
        const dateFolder = file.split('/')[1] || '';
        const allExist = await this.checkAllTypesExist(dateFolder);
        
        if (allExist) {
          skippedCount++;
          console.log(`⏭️ Skipping ${file} - broker_transaction_rg/tn/ng folders already exist for ${dateFolder}`);
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
   * Process a single DT file with broker transaction analysis (RG/TN/NG split)
   * OPTIMIZED: Double-check folders don't exist before processing (race condition protection)
   */
  private async processSingleDtFile(blobName: string): Promise<{ success: boolean; dateSuffix: string; files: string[]; timing?: any }> {
    // Extract date before loading to check early
    const pathParts = blobName.split('/');
    const dateFolder = pathParts[1] || 'unknown';
    const dateSuffix = dateFolder;
    
    // OPTIMIZATION: Double-check all types don't exist (race condition protection)
    const allExist = await this.checkAllTypesExist(dateFolder);
    if (allExist) {
      console.log(`⏭️ Skipping ${blobName} - broker_transaction_rg/tn/ng folders already exist for ${dateFolder} (race condition check)`);
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
      
      console.log(`🔄 Processing ${blobName} (${data.length} transactions) for RG/TN/NG...`);
      
      // Track timing
      const timing = {
        brokerTransactionRG: 0,
        brokerTransactionTN: 0,
        brokerTransactionNG: 0
      };
      
      const allFiles: string[] = [];
      
      // Process each type (RG, TN, NG)
      for (const type of ['RG', 'TN', 'NG'] as const) {
        const filtered = this.filterByType(data, type);
        if (filtered.length === 0) {
          console.log(`⏭️ Skipping ${dateSuffix} (${type}) - no ${type} transactions found`);
          continue;
        }
        
        const startTime = Date.now();
        const transactionFiles = await this.createBrokerTransactionPerBroker(filtered, dateSuffix, type);
        const duration = Math.round((Date.now() - startTime) / 1000);
        
        if (type === 'RG') timing.brokerTransactionRG = duration;
        else if (type === 'TN') timing.brokerTransactionTN = duration;
        else if (type === 'NG') timing.brokerTransactionNG = duration;
        
        allFiles.push(...transactionFiles);
        console.log(`✅ Created ${transactionFiles.length} broker transaction files for ${dateSuffix} (${type})`);
      }
      
      console.log(`✅ Completed processing ${blobName} - ${allFiles.length} files created`);
      return { success: true, dateSuffix, files: allFiles, timing };
      
    } catch (error: any) {
      console.error(`❌ Error processing file ${blobName}:`, error.message);
      return { success: false, dateSuffix, files: [] };
    }
  }

  private async loadAndProcessSingleDtFile(blobName: string): Promise<{ data: TransactionData[], dateSuffix: string } | null> {
    try {
      console.log(`📥 Downloading file: ${blobName}`);
      const content = await downloadText(blobName);
      if (!content || content.trim().length === 0) {
        console.warn(`⚠️ Empty file or no content: ${blobName}`);
        return null;
      }
      console.log(`✅ Downloaded ${blobName} (${content.length} characters)`);
      const pathParts = blobName.split('/');
      const dateFolder = pathParts[1] || 'unknown';
      const dateSuffix = dateFolder;
      console.log(`📅 Extracted date suffix: ${dateSuffix} from ${blobName}`);
      const data = this.parseTransactionData(content);
      console.log(`✅ Parsed ${data.length} transactions from ${blobName}`);
      return { data, dateSuffix };
    } catch (error: any) {
      console.error(`❌ Error loading file ${blobName}:`, error.message);
      return null;
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
    const iTRX_ORD1 = getIdx('TRX_ORD1');
    const iTRX_ORD2 = getIdx('TRX_ORD2');
    if ([iSTK_CODE, iBRK_COD1, iBRK_COD2, iSTK_VOLM, iSTK_PRIC, iTRX_CODE, iTRX_TYPE, iTRX_ORD1, iTRX_ORD2].some(k => k === -1)) return [];
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
      brokerTransaction: `broker_transaction_${name}/broker_transaction_${name}_${dateSuffix}`
    };
  }

  private async createBrokerTransactionPerBroker(data: TransactionData[], dateSuffix: string, type: TransactionType): Promise<string[]> {
    const paths = this.getTransactionPaths(type, dateSuffix);
    const uniqueBrokers = [...new Set([ ...data.map(r => r.BRK_COD1), ...data.map(r => r.BRK_COD2)])];
    const createdFiles: string[] = [];
    const skippedFiles: string[] = [];
    
    for (const broker of uniqueBrokers) {
      const filename = `${paths.brokerTransaction}/${broker}.csv`;
      
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
      
      const brokerData = data.filter(row => row.BRK_COD1 === broker || row.BRK_COD2 === broker);
      const stockGroups = new Map<string, TransactionData[]>();
      brokerData.forEach(row => {
        const stock = row.STK_CODE;
        if (!stockGroups.has(stock)) stockGroups.set(stock, []);
        stockGroups.get(stock)!.push(row);
      });
      const stockSummary: BrokerTransactionData[] = [];
      stockGroups.forEach((txs, stock) => {
        const buyerTxs = txs.filter(t => t.BRK_COD1 === broker);
        const sellerTxs = txs.filter(t => t.BRK_COD2 === broker);
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
        const buyerOrdNum = buyerOrdNums.size;
        const sellerOrdNum = sellerOrdNums.size;
        
        // Calculate net values
        const rawNetBuyVol = buyerVol - sellerVol;
        const rawNetBuyValue = buyerValue - sellerValue;
        const netBuyFreq = buyerFreq - sellerFreq; // Can be negative
        const netBuyOrdNum = buyerOrdNum - sellerOrdNum; // Can be negative
        const netSellFreq = sellerFreq - buyerFreq; // Can be negative
        const netSellOrdNum = sellerOrdNum - buyerOrdNum; // Can be negative
        
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
        
        stockSummary.push({
          Emiten: stock,
          BuyerVol: buyerVol,
          BuyerValue: buyerValue,
          BuyerAvg: buyerAvg,
          BuyerFreq: buyerFreq,
          BuyerOrdNum: buyerOrdNum,
          SellerVol: sellerVol,
          SellerValue: sellerValue,
          SellerAvg: sellerAvg,
          SellerFreq: sellerFreq,
          SellerOrdNum: sellerOrdNum,
          NetBuyVol: netBuyVol,
          NetBuyValue: netBuyValue,
          NetBuyAvg: netBuyAvg,
          NetBuyFreq: netBuyFreq, // Can be negative
          NetBuyOrdNum: netBuyOrdNum, // Can be negative
          NetSellVol: netSellVol,
          NetSellValue: netSellValue,
          NetSellAvg: netSellAvg,
          NetSellFreq: netSellFreq, // Can be negative
          NetSellOrdNum: netSellOrdNum, // Can be negative
        });
      });
      // Sort by net buy value descending (same as generateBrokerTransactionTest.ts)
      stockSummary.sort((a, b) => b.NetBuyValue - a.NetBuyValue);
      await this.saveToAzure(filename, stockSummary);
      createdFiles.push(filename);
    }
    
    if (skippedFiles.length > 0) {
      console.log(`⏭️ Skipped ${skippedFiles.length} broker transaction files that already exist`);
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
   * Main function to generate broker transaction data for all DT files (RG/TN/NG split)
   * OPTIMIZED: Batch processing with skip logic
   */
  public async generateBrokerTransactionData(_dateSuffix?: string): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      console.log(`🔄 Starting Broker Transaction RG/TN/NG calculation...`);
      const dtFiles = await this.findAllDtFiles();
      
      if (dtFiles.length === 0) {
        console.log(`✅ No DT files to process - skipped broker transaction RG/TN/NG data generation`);
        return { success: true, message: `No DT files found - skipped broker transaction RG/TN/NG data generation` };
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
      
      const message = `Broker Transaction RG/TN/NG data generated: ${totalProcessed} dates processed, ${totalFilesCreated} files created, ${totalSkipped} skipped, ${totalErrors} errors`;
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

  // Generate broker transaction data for specific type only (RG, TN, or NG)
  public async generateBrokerTransactionDataForType(type: 'RG' | 'TN' | 'NG'): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      console.log(`🔄 Starting Broker Transaction ${type} data generation...`);
      const dtFiles = await this.findAllDtFiles();
      console.log(`📊 Found ${dtFiles.length} DT files to process`);
      
      if (dtFiles.length === 0) {
        console.warn(`⚠️ No DT files found - skipped broker transaction data generation for ${type}`);
        return { success: true, message: `No DT files found - skipped broker transaction data generation for ${type}` };
      }
      
      let processedDates = 0;
      let totalFilesCreated = 0;
      
      for (const blobName of dtFiles) {
        try {
          console.log(`📂 Processing file: ${blobName}`);
          const result = await this.loadAndProcessSingleDtFile(blobName);
          if (!result) {
            console.warn(`⚠️ Failed to load file: ${blobName}`);
            continue;
          }
          
          const { data, dateSuffix: date } = result;
          console.log(`📊 Loaded ${data.length} transactions from ${date}`);
          
          const filtered = this.filterByType(data, type);
          console.log(`🔍 Filtered to ${filtered.length} transactions for type ${type}`);
          
          if (filtered.length === 0) {
            console.log(`⏭️ Skipping ${date} - no ${type} transactions found`);
            continue;
          }
          
          console.log(`📝 Creating broker transactions for ${date} (${type})...`);
          const transactionFiles = await this.createBrokerTransactionPerBroker(filtered, date, type);
          console.log(`✅ Created ${transactionFiles.length} broker transaction files for ${date} (skipped files that already exist)`);
          
          processedDates++;
          totalFilesCreated += transactionFiles.length;
        } catch (error: any) {
          console.error(`❌ Error processing file ${blobName}:`, error.message);
          continue;
        }
      }
      
      const message = `Broker Transaction ${type} data generated for ${processedDates} dates (${totalFilesCreated} files created)`;
      console.log(`✅ ${message}`);
      return { success: true, message };
    } catch (e) {
      const error = e as Error;
      console.error(`❌ Error in generateBrokerTransactionDataForType (${type}):`, error.message);
      return { success: false, message: error.message };
    }
  }
}

export default BrokerTransactionRGTNNGCalculator;
