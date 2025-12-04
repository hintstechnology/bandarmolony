import { uploadText, listPaths, downloadText } from '../../utils/azureBlob';
import { BATCH_SIZE_PHASE_7, MAX_CONCURRENT_REQUESTS_PHASE_7 } from '../../services/dataUpdateService';
import { SchedulerLogService } from '../../services/schedulerLogService';
import { doneSummaryCache } from '../../cache/doneSummaryCacheService';

// Progress tracker interface for thread-safe stock counting
interface ProgressTracker {
  totalStocks: number;
  processedStocks: number;
  logId: string | null;
  updateProgress: () => Promise<void>;
}

// Helper function to limit concurrency for Phase 7-8
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

// Type definitions for bid/ask footprint data
interface TransactionData {
  STK_CODE: string;
  BRK_COD1: string; // Seller broker (bid side)
  BRK_COD2: string; // Buyer broker (ask side)
  STK_VOLM: number;
  STK_PRIC: number;
  TRX_CODE: string;
  TRX_TIME: string;
  TRX_ORD1: number; // Order reference 1
  TRX_ORD2: number; // Order reference 2
}

interface PriceLevelData {
  Price: number;
  BidVolume: number;  // Volume dari BRK_COD1 (seller)
  AskVolume: number;  // Volume dari BRK_COD2 (buyer)
  NetVolume: number;  // AskVolume - BidVolume
  TotalVolume: number; // BidVolume + AskVolume
  BidCount: number;   // Jumlah transaksi bid
  AskCount: number;   // Jumlah transaksi ask
  TotalCount: number; // BidCount + AskCount
  UniqueBidBrokers: number; // Jumlah broker unik yang bid
  UniqueAskBrokers: number; // Jumlah broker unik yang ask
}


interface StockFootprintData {
  StockCode: string;
  Price: number;
  BidVolume: number;  // Total volume bid di level harga ini
  AskVolume: number;  // Total volume ask di level harga ini
  NetVolume: number;  // AskVolume - BidVolume
  TotalVolume: number;
  BidCount: number;
  AskCount: number;
  TotalCount: number; // BidCount + AskCount
  UniqueBidBrokers: number; // Jumlah broker unik yang bid
  UniqueAskBrokers: number; // Jumlah broker unik yang ask
}

export class BidAskCalculator {
  constructor() {
    // No need for Azure client initialization - using azureBlob utility
  }

  /**
   * Find all DT files in done-summary folder
   * OPTIMIZED: Uses shared cache to avoid repeated listPaths calls
   */
  private async findAllDtFiles(): Promise<string[]> {
    console.log("Scanning all DT files in done-summary folder...");
    
    try {
      // Use shared cache for DT files list
      // Type assertion needed due to TypeScript type inference issue
      const allDtFiles = await (doneSummaryCache as any).getDtFilesList();
      
      // Sort by date descending (newest first) - process from newest to oldest
      const sortedFiles = allDtFiles.sort((a: string, b: string) => {
        const dateA = a.split('/')[1] || '';
        const dateB = b.split('/')[1] || '';
        return dateB.localeCompare(dateA); // Descending order (newest first)
      });
      
      // OPTIMIZATION: Pre-check which dates already have bid_ask output (BATCH CHECKING for speed)
      console.log("🔍 Pre-checking existing bid_ask outputs (batch checking)...");
      const filesToProcess: string[] = [];
      let skippedCount = 0;
      
      // Process in batches for parallel checking (faster than sequential)
      const CHECK_BATCH_SIZE = 20; // Check 20 files in parallel
      const MAX_CONCURRENT_CHECKS = 10; // Max 10 concurrent checks
      
      for (let i = 0; i < sortedFiles.length; i += CHECK_BATCH_SIZE) {
        const batch = sortedFiles.slice(i, i + CHECK_BATCH_SIZE);
        const batchNumber = Math.floor(i / CHECK_BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(sortedFiles.length / CHECK_BATCH_SIZE);
        
        // Process batch checks in parallel with concurrency limit
        const checkPromises = batch.map(async (file: string) => {
          const dateFolder = file.split('/')[1] || '';
          const dateSuffix = dateFolder;
          const outputPrefix = `bid_ask/bid_ask_${dateSuffix}/`;
          
          try {
            const existingFiles = await listPaths({ prefix: outputPrefix, maxResults: 1 });
            return { file, dateSuffix, exists: existingFiles.length > 0, error: null };
          } catch (error) {
            return { file, dateSuffix, exists: false, error: error instanceof Error ? error.message : String(error) };
          }
        });
        
        // Limit concurrency for checks
        const checkResults: { file: string; dateSuffix: string; exists: boolean; error: string | null }[] = [];
        for (let j = 0; j < checkPromises.length; j += MAX_CONCURRENT_CHECKS) {
          const concurrentChecks = checkPromises.slice(j, j + MAX_CONCURRENT_CHECKS);
          const results = await Promise.all(concurrentChecks);
          checkResults.push(...results);
        }
        
        // Process results
        for (const result of checkResults) {
          if (result.exists) {
            skippedCount++;
            // Only log first few and last few to avoid spam
            if (skippedCount <= 5 || skippedCount > sortedFiles.length - 5) {
              console.log(`⏭️ Bid/Ask already exists for date ${result.dateSuffix} - skipping`);
            }
          } else {
            if (result.error) {
              console.warn(`⚠️ Could not check existence for ${result.dateSuffix}, will process:`, result.error);
            } else {
              // Only log first few to avoid spam
              if (filesToProcess.length < 5) {
                console.log(`✅ Date ${result.dateSuffix} needs processing`);
              }
            }
            filesToProcess.push(result.file);
          }
        }
        
        // Progress update for large batches
        if (totalBatches > 1 && batchNumber % 5 === 0) {
          console.log(`📊 Checked ${Math.min(i + CHECK_BATCH_SIZE, sortedFiles.length)}/${sortedFiles.length} files (${skippedCount} skipped, ${filesToProcess.length} to process)...`);
        }
      }
      
      // Summary log
      if (skippedCount > 5) {
        console.log(`⏭️  ... and ${skippedCount - 5} more dates skipped`);
      }
      if (filesToProcess.length > 5) {
        console.log(`✅ ... and ${filesToProcess.length - 5} more dates need processing`);
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
    } catch (error) {
      console.error('Error scanning DT files:', error);
      return [];
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
    const trxOrd1Index = getColumnIndex('TRX_ORD1');
    const trxOrd2Index = getColumnIndex('TRX_ORD2');
    
    // Validate required columns exist
    if (stkCodeIndex === -1 || brkCod1Index === -1 || brkCod2Index === -1 || 
        stkVolmIndex === -1 || stkPricIndex === -1 || trxCodeIndex === -1) {
      console.error('❌ Required columns not found in CSV header');
      return data;
    }
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line || line.trim().length === 0) continue;
      
      const values = line.split(';');
      if (values.length < header.length) continue;
      
      const stockCode = values[stkCodeIndex]?.trim() || '';
      
      // Filter only 4-character stock codes (regular stocks) - same as original file
      if (stockCode && stockCode.length === 4) {
        const transaction: TransactionData = {
          STK_CODE: stockCode,
          BRK_COD1: values[brkCod1Index]?.trim() || '',
          BRK_COD2: values[brkCod2Index]?.trim() || '',
          STK_VOLM: parseFloat(values[stkVolmIndex]?.trim() || '0') || 0,
          STK_PRIC: parseFloat(values[stkPricIndex]?.trim() || '0') || 0,
          TRX_CODE: values[trxCodeIndex]?.trim() || '',
          TRX_TIME: trxTimeIndex !== -1 ? values[trxTimeIndex]?.trim() || '' : '',
          TRX_ORD1: trxOrd1Index !== -1 ? parseFloat(values[trxOrd1Index]?.trim() || '0') || 0 : 0,
          TRX_ORD2: trxOrd2Index !== -1 ? parseFloat(values[trxOrd2Index]?.trim() || '0') || 0 : 0
        };
        
        data.push(transaction);
      }
    }
    
    console.log(`📊 Loaded ${data.length} transaction records from Azure (4-character stocks only)`);
    return data;
  }


  /**
   * Create bid/ask footprint data by stock
   */
  private createStockFootprintData(data: TransactionData[]): StockFootprintData[] {
    console.log("\nCreating stock footprint data...");
    
    // Group data by stock and price level
    const stockPriceMap = new Map<string, Map<number, {
      bidVolume: number;
      askVolume: number;
      bidCount: number;
      askCount: number;
      bidBrokers: Set<string>;
      askBrokers: Set<string>;
    }>>();
    
    data.forEach(row => {
      const stock = row.STK_CODE;
      const price = row.STK_PRIC;
      const volume = row.STK_VOLM;
      const isBid = row.TRX_ORD1 > row.TRX_ORD2; // HAKA -> BID, HAKI -> ASK
      
      if (!stockPriceMap.has(stock)) {
        stockPriceMap.set(stock, new Map());
      }
      const stockMap = stockPriceMap.get(stock)!;
      if (!stockMap.has(price)) {
        stockMap.set(price, {
          bidVolume: 0,
          askVolume: 0,
          bidCount: 0,
          askCount: 0,
          bidBrokers: new Set(),
          askBrokers: new Set()
        });
      }
      const priceData = stockMap.get(price)!;
      
      // Klasifikasi BID/ASK berdasarkan HAKA/HAKI
      if (isBid) {
        priceData.bidVolume += volume;
        priceData.bidCount += 1;
        if (row.BRK_COD1) priceData.bidBrokers.add(row.BRK_COD1);
      } else {
        priceData.askVolume += volume;
        priceData.askCount += 1;
        if (row.BRK_COD2) priceData.askBrokers.add(row.BRK_COD2);
      }
    });
    
    // Convert to array format
    const stockFootprintData: StockFootprintData[] = [];
    
    stockPriceMap.forEach((priceMap, stock) => {
      priceMap.forEach((priceData, price) => {
        stockFootprintData.push({
          StockCode: stock,
          Price: price,
          BidVolume: priceData.bidVolume,
          AskVolume: priceData.askVolume,
          NetVolume: priceData.askVolume - priceData.bidVolume,
          TotalVolume: priceData.bidVolume + priceData.askVolume,
          BidCount: priceData.bidCount,
          AskCount: priceData.askCount,
          TotalCount: priceData.bidCount + priceData.askCount,
          UniqueBidBrokers: priceData.bidBrokers.size,
          UniqueAskBrokers: priceData.askBrokers.size
        });
      });
    });
    
    // Sort by stock code, then by price
    stockFootprintData.sort((a, b) => {
      if (a.StockCode !== b.StockCode) {
        return a.StockCode.localeCompare(b.StockCode);
      }
      return a.Price - b.Price;
    });
    
    console.log(`Stock footprint data created with ${stockFootprintData.length} records`);
    return stockFootprintData;
  }


  /**
   * Save data to Azure Blob Storage
   */
  private async saveToAzure(filename: string, data: any[]): Promise<void> {
    if (data.length === 0) {
      console.log(`No data to save for ${filename}`);
      return;
    }
    
    // Convert to CSV format
    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row => headers.map(header => row[header]).join(','))
    ].join('\n');
    
    await uploadText(filename, csvContent, 'text/csv');
    console.log(`Saved ${data.length} records to ${filename}`);
  }


  /**
   * Create price level data grouped by stock code (for individual files)
   */
  private createPriceLevelData(data: TransactionData[]): Map<string, PriceLevelData[]> {
    console.log("Creating price level data by stock...");
    
    const stockPriceMap = new Map<string, Map<number, {
      bidVolume: number;
      askVolume: number;
      bidCount: number;
      askCount: number;
      uniqueBidBrokers: Set<string>;
      uniqueAskBrokers: Set<string>;
    }>>();
    
    data.forEach(row => {
      const stock = row.STK_CODE;
      const price = row.STK_PRIC;
      const volume = row.STK_VOLM;
      const isBid = row.TRX_ORD1 > row.TRX_ORD2; // HAKA -> BID, HAKI -> ASK
      
      if (!stockPriceMap.has(stock)) {
        stockPriceMap.set(stock, new Map());
      }
      const stockMap = stockPriceMap.get(stock)!;
      if (!stockMap.has(price)) {
        stockMap.set(price, {
          bidVolume: 0,
          askVolume: 0,
          bidCount: 0,
          askCount: 0,
          uniqueBidBrokers: new Set(),
          uniqueAskBrokers: new Set()
        });
      }
      const rec = stockMap.get(price)!;
      
      // Klasifikasi BID/ASK berdasarkan HAKA/HAKI (per tes.py)
      if (isBid) {
        rec.bidVolume += volume;
        rec.bidCount += 1;
        if (row.BRK_COD1) rec.uniqueBidBrokers.add(row.BRK_COD1);
      } else {
        rec.askVolume += volume;
        rec.askCount += 1;
        if (row.BRK_COD2) rec.uniqueAskBrokers.add(row.BRK_COD2);
      }
    });
    
    // Convert to array format
    const priceLevelData = new Map<string, PriceLevelData[]>();
    
    stockPriceMap.forEach((priceMap, stock) => {
      const stockData: PriceLevelData[] = [];
      priceMap.forEach((priceData, price) => {
        stockData.push({
          Price: price,
          BidVolume: priceData.bidVolume,
          AskVolume: priceData.askVolume,
          NetVolume: priceData.askVolume - priceData.bidVolume,
          TotalVolume: priceData.bidVolume + priceData.askVolume,
          BidCount: priceData.bidCount,
          AskCount: priceData.askCount,
          TotalCount: priceData.bidCount + priceData.askCount,
          UniqueBidBrokers: priceData.uniqueBidBrokers.size,
          UniqueAskBrokers: priceData.uniqueAskBrokers.size
        });
      });
      
      // Sort by price ascending (low to high) - same as original file
      stockData.sort((a, b) => a.Price - b.Price);
      priceLevelData.set(stock, stockData);
    });
    
    console.log(`Created price level data for ${priceLevelData.size} stocks`);
    return priceLevelData;
  }

  /**
   * Process a single DT file with all bid/ask analysis
   */
  private async processSingleDtFile(blobName: string, progressTracker?: ProgressTracker): Promise<{ success: boolean; dateSuffix: string; files: string[]; stockCount?: number }> {
    const result = await this.loadAndProcessSingleDtFile(blobName);
    
    if (!result) {
      return { success: false, dateSuffix: '', files: [] };
    }
    
    const { data, dateSuffix } = result;
    
    if (data.length === 0) {
      console.log(`⚠️ No transaction data in ${blobName} - skipping`);
      return { success: false, dateSuffix, files: [] };
    }
    
    console.log(`🔄 Processing ${blobName} (${data.length} transactions)...`);
    
    try {
      // Create price level data by stock (for individual files) - same as original file
      const priceLevelData = this.createPriceLevelData(data);
      
      // Create stock footprint data (for ALL_STOCK.csv) - same as original file
      const stockFootprintData = this.createStockFootprintData(data);
      
      // Save individual CSV files for each stock - same as original file
      const basePath = `bid_ask/bid_ask_${dateSuffix}`;
      const allFiles: string[] = [];
      
      // Save individual stock files
      const stockCount = priceLevelData.size;
      for (const [stockCode, stockData] of priceLevelData) {
        const filename = `${basePath}/${stockCode}.csv`;
        
        // Add StockCode column to each row - same as original file
        const dataWithStockCode = stockData.map(row => ({
          StockCode: stockCode,
          Price: row.Price,
          BidVolume: row.BidVolume,
          AskVolume: row.AskVolume,
          NetVolume: row.NetVolume,
          TotalVolume: row.TotalVolume,
          BidCount: row.BidCount,
          AskCount: row.AskCount,
          TotalCount: row.TotalCount,
          UniqueBidBrokers: row.UniqueBidBrokers,
          UniqueAskBrokers: row.UniqueAskBrokers
        }));
        
        await this.saveToAzure(filename, dataWithStockCode);
        allFiles.push(filename);
        
        // Update progress tracker after each stock
        if (progressTracker) {
          progressTracker.processedStocks++;
          await progressTracker.updateProgress();
        }
      }
      
      // Save ALL_STOCK.csv file - same as original file
      const allStockFilename = `${basePath}/ALL_STOCK.csv`;
      await this.saveToAzure(allStockFilename, stockFootprintData);
      allFiles.push(allStockFilename);
      
      console.log(`✅ Completed processing ${blobName} - ${allFiles.length} files created, ${stockCount} stocks processed`);
      return { success: true, dateSuffix, files: allFiles, stockCount };
      
    } catch (error) {
      console.error(`Error processing ${blobName}:`, error);
      return { success: false, dateSuffix, files: [] };
    }
  }

  /**
   * Pre-count total unique stocks from all DT files that need processing
   * CRITICAL: Loads files DIRECTLY from Azure WITHOUT cache to avoid caching files during pre-count
   * This is used for accurate progress tracking
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
          if (data.length > 0) {
            const validTransactions = data.filter(t => 
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
    return allStocks.size;
  }

  /**
   * Main function to generate bid/ask footprint data for all DT files
   */
  public async generateBidAskData(_dateSuffix: string, logId?: string | null): Promise<{ success: boolean; message: string; data?: any }> {
    const startTime = Date.now();
    let datesToProcess: Set<string> = new Set();
    
    try {
      console.log(`Starting bid/ask footprint analysis for all DT files...`);
      
      // Find all DT files (sudah filter yang belum ada output)
      const dtFiles = await this.findAllDtFiles();
      
      if (dtFiles.length === 0) {
        console.log(`⚠️ No DT files found in done-summary folder`);
        return {
          success: true,
          message: `No DT files found - skipped bid/ask calculation`,
          data: { skipped: true, reason: 'No DT files found' }
        };
      }
      
      console.log(`📊 Processing ${dtFiles.length} DT files...`);
      
      // CRITICAL: Pre-count FIRST before setting active dates to avoid caching during pre-count
      // Pre-count loads files WITHOUT cache
      const totalStocks = await this.preCountTotalStocks(dtFiles);
      
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
      
      // Process files in batches (Phase 7: 6 files at a time)
      const BATCH_SIZE = BATCH_SIZE_PHASE_7; // Phase 7: 6 files
      const MAX_CONCURRENT = MAX_CONCURRENT_REQUESTS_PHASE_7; // Phase 7: 3 concurrent
      const allResults: { success: boolean; dateSuffix: string; files: string[]; stockCount?: number }[] = [];
      let processed = 0;
      let successful = 0;
      
      for (let i = 0; i < dtFiles.length; i += BATCH_SIZE) {
        const batch = dtFiles.slice(i, i + BATCH_SIZE);
        const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
        console.log(`📦 Processing batch ${batchNumber}/${Math.ceil(dtFiles.length / BATCH_SIZE)} (${batch.length} files)`);
        
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
        
        // Update progress before batch (showing DT file progress)
        if (logId) {
          await SchedulerLogService.updateLog(logId, {
            progress_percentage: totalStocks > 0 
              ? Math.round((progressTracker.processedStocks / totalStocks) * 100)
              : Math.round((processed / dtFiles.length) * 100),
            current_processing: `Processing batch ${batchNumber}/${Math.ceil(dtFiles.length / BATCH_SIZE)} (${processed}/${dtFiles.length} dates, ${progressTracker.processedStocks.toLocaleString()}/${totalStocks.toLocaleString()} stocks)`
          });
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
        console.log(`📊 Batch ${batchNumber} complete: ✅ ${successful}/${processed} successful, ${batchStockCount} stocks processed, ${progressTracker.processedStocks.toLocaleString()}/${totalStocks.toLocaleString()} total stocks processed`);
        
        // Update progress after batch (based on stocks processed)
        if (logId) {
          await SchedulerLogService.updateLog(logId, {
            progress_percentage: totalStocks > 0 
              ? Math.round((progressTracker.processedStocks / totalStocks) * 100)
              : Math.round((processed / dtFiles.length) * 100),
            current_processing: `Completed batch ${batchNumber}/${Math.ceil(dtFiles.length / BATCH_SIZE)} (${processed}/${dtFiles.length} dates, ${progressTracker.processedStocks.toLocaleString()}/${totalStocks.toLocaleString()} stocks processed)`
          });
        }
        
        // Small delay between batches
        if (i + BATCH_SIZE < dtFiles.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      const totalFiles = allResults.reduce((sum, result) => sum + result.files.length, 0);
      const totalDuration = Math.round((Date.now() - startTime) / 1000);
      
      console.log(`✅ Bid/Ask footprint analysis completed!`);
      console.log(`📊 Processed: ${processed}/${dtFiles.length} DT files`);
      console.log(`📊 Successful: ${successful}/${processed} files`);
      console.log(`📊 Total output files: ${totalFiles}`);
      console.log(`✅ Bid/Ask Footprint calculation completed successfully`);
      console.log(`✅ Bid/Ask Footprint completed in ${totalDuration}s`);
      
      return {
        success: true,
        message: `Bid/ask footprint data generated successfully for ${successful}/${processed} DT files`,
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
      console.error('Error generating bid/ask footprint data:', error);
      return {
        success: false,
        message: `Failed to generate bid/ask footprint data: ${error instanceof Error ? error.message : 'Unknown error'}`
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

export default BidAskCalculator;
