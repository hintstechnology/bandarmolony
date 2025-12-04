import { uploadText, exists, downloadText } from '../../utils/azureBlob';
import { BATCH_SIZE_PHASE_4, MAX_CONCURRENT_REQUESTS_PHASE_4 } from '../../services/dataUpdateService';
import { SchedulerLogService } from '../../services/schedulerLogService';
import { doneSummaryCache } from '../../cache/doneSummaryCacheService';

// Progress tracker interface for thread-safe broker counting
interface ProgressTracker {
  totalBrokers: number;
  processedBrokers: number;
  logId: string | null;
  updateProgress: () => Promise<void>;
}

// Helper function to limit concurrency for Phase 4
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
  BRK_COD1: string;
  BRK_COD2: string;
  STK_VOLM: number;
  STK_PRIC: number;
  TRX_CODE: string;
}

interface TopBrokerData {
  BrokerCode: string;
  Emiten: string;
  TotalVolume: number;
  AvgPrice: number;
  TransactionCount: number;
  TotalValue: number;
}

interface ComprehensiveBrokerData {
  BrokerCode: string;
  TotalBrokerVol: number;
  TotalBrokerValue: number;
  TotalBrokerFreq: number;
  NetBuyVol: number;
  NetBuyValue: number;
  NetBuyFreq: number;
  SellerVol: number;
  SellerValue: number;
  SellerFreq: number;
  BuyerVol: number;
  BuyerValue: number;
  BuyerFreq: number;
}

export class TopBrokerCalculator {
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
      
      // OPTIMIZATION: Pre-check which dates already have top_broker output (BATCH CHECKING for speed)
      console.log("🔍 Pre-checking existing top_broker outputs (batch checking)...");
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
          const keyOutputFile = `top_broker/top_broker_${dateSuffix}/top_broker.csv`;
          
          try {
            const outputExists = await exists(keyOutputFile);
            return { file, dateSuffix, exists: outputExists, error: null };
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
              console.log(`⏭️ Top broker already exists for date ${result.dateSuffix} - skipping`);
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
        const dates = filesToProcess.map((f: string) => f.split('/')[1]).filter((v: string | undefined, i: number, arr: (string | undefined)[]) => v !== undefined && arr.indexOf(v) === i) as string[];
        dates.slice(0, 10).forEach((date: string, idx: number) => {
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
      
      // Filter hanya kode emiten 4 huruf - same as original file
      if (stockCode.length === 4) {
        const transaction: TransactionData = {
          STK_CODE: stockCode,
          BRK_COD1: values[brkCod1Index]?.trim() || '',
          BRK_COD2: values[brkCod2Index]?.trim() || '',
          STK_VOLM: parseFloat(values[stkVolmIndex]?.trim() || '0') || 0,
          STK_PRIC: parseFloat(values[stkPricIndex]?.trim() || '0') || 0,
          TRX_CODE: values[trxCodeIndex]?.trim() || ''
        };
        
        data.push(transaction);
      }
    }
    
    console.log(`📊 Loaded ${data.length} transaction records from Azure (4-character stocks only)`);
    return data;
  }

  /**
   * Create top broker analysis: For each broker, show what stocks they bought
   * Same as original file - only processes buyer brokers (BRK_COD2)
   */
  private createTopBroker(data: TransactionData[]): TopBrokerData[] {
    console.log("\nCreating top broker analysis...");
    
    // Group by buyer broker and stock code - same as original file
    const groups = new Map<string, Map<string, TransactionData[]>>();
    
    data.forEach(row => {
      const broker = row.BRK_COD2; // Only buyer brokers - same as original file
      const stock = row.STK_CODE;
      
      if (!groups.has(broker)) {
        groups.set(broker, new Map());
      }
      
      const brokerGroups = groups.get(broker)!;
      if (!brokerGroups.has(stock)) {
        brokerGroups.set(stock, []);
      }
      
      brokerGroups.get(stock)!.push(row);
    });
    
    const topBroker: TopBrokerData[] = [];
    
    groups.forEach((stockGroups, broker) => {
      stockGroups.forEach((transactions, stock) => {
        const totalVolume = transactions.reduce((sum, t) => sum + t.STK_VOLM, 0);
        const totalValue = transactions.reduce((sum, t) => sum + (t.STK_VOLM * t.STK_PRIC), 0);
        const avgPrice = totalVolume > 0 ? totalValue / totalVolume : 0;
        
        topBroker.push({
          BrokerCode: broker,
          Emiten: stock,
          TotalVolume: totalVolume,
          AvgPrice: avgPrice,
          TransactionCount: transactions.length,
          TotalValue: totalValue
        });
      });
    });
    
    // Sort by broker and then by total volume descending - same as original file
    topBroker.sort((a, b) => {
      if (a.BrokerCode !== b.BrokerCode) {
        return a.BrokerCode.localeCompare(b.BrokerCode);
      }
      return b.TotalVolume - a.TotalVolume;
    });
    
    console.log(`Top broker analysis created with ${topBroker.length} records`);
    return topBroker;
  }

  /**
   * Create comprehensive top broker analysis with all metrics
   */
  private createComprehensiveTopBroker(data: TransactionData[]): ComprehensiveBrokerData[] {
    console.log("\nCreating comprehensive top broker analysis...");
    
    // Get all unique brokers
    const allBrokers = new Set([
      ...data.map(row => row.BRK_COD2),
      ...data.map(row => row.BRK_COD1)
    ]);
    
    const comprehensiveData: ComprehensiveBrokerData[] = [];
    
    allBrokers.forEach(broker => {
      // Buyer transactions
      const buyerTransactions = data.filter(row => row.BRK_COD2 === broker);
      const buyerVol = buyerTransactions.reduce((sum, t) => sum + t.STK_VOLM, 0);
      const buyerValue = buyerTransactions.reduce((sum, t) => sum + (t.STK_VOLM * t.STK_PRIC), 0);
      const buyerFreq = buyerTransactions.length;
      
      // Seller transactions
      const sellerTransactions = data.filter(row => row.BRK_COD1 === broker);
      const sellerVol = sellerTransactions.reduce((sum, t) => sum + t.STK_VOLM, 0);
      const sellerValue = sellerTransactions.reduce((sum, t) => sum + (t.STK_VOLM * t.STK_PRIC), 0);
      const sellerFreq = sellerTransactions.length;
      
      // Total broker activity
      const totalVol = buyerVol + sellerVol;
      const totalValue = buyerValue + sellerValue;
      const totalFreq = buyerFreq + sellerFreq;
      
      // Net values
      const netBuyVol = buyerVol - sellerVol;
      const netBuyValue = buyerValue - sellerValue;
      const netBuyFreq = buyerFreq - sellerFreq;
      
      // SWAPPED: Kolom Buyer isinya data Seller, kolom Seller isinya data Buyer
      // Ini agar frontend tidak perlu swap lagi (sesuai dengan CSV yang kolomnya tertukar)
      comprehensiveData.push({
        BrokerCode: broker,
        TotalBrokerVol: totalVol,
        TotalBrokerValue: totalValue,
        TotalBrokerFreq: totalFreq,
        NetBuyVol: netBuyVol,
        NetBuyValue: netBuyValue,
        NetBuyFreq: netBuyFreq,
        SellerVol: buyerVol,        // SWAPPED: Kolom Seller = data Buyer
        SellerValue: buyerValue,    // SWAPPED: Kolom Seller = data Buyer
        SellerFreq: buyerFreq,      // SWAPPED: Kolom Seller = data Buyer
        BuyerVol: sellerVol,        // SWAPPED: Kolom Buyer = data Seller
        BuyerValue: sellerValue,    // SWAPPED: Kolom Buyer = data Seller
        BuyerFreq: sellerFreq       // SWAPPED: Kolom Buyer = data Seller
      });
    });
    
    // Sort by total broker value descending
    comprehensiveData.sort((a, b) => b.TotalBrokerValue - a.TotalBrokerValue);
    
    console.log(`Comprehensive top broker analysis created with ${comprehensiveData.length} brokers`);
    return comprehensiveData;
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
   * Process a single DT file with top broker analysis
   */
  private async processSingleDtFile(blobName: string, progressTracker?: ProgressTracker): Promise<{ success: boolean; dateSuffix: string; files: string[]; timing?: any; skipped?: boolean; brokerCount?: number }> {
    // Extract date from blob name first (before loading input)
    const pathParts = blobName.split('/');
    const dateFolder = pathParts[1] || 'unknown'; // 20251021
    const dateSuffix = dateFolder;
    
    // Note: Pre-checking is done in findAllDtFiles() before batch processing
    // This function only processes files that are confirmed to need processing
    
    // Load input and process
    const result = await this.loadAndProcessSingleDtFile(blobName);
    
    if (!result) {
      return { success: false, dateSuffix, files: [] };
    }
    
    const { data } = result;
    
    if (data.length === 0) {
      console.log(`⚠️ No transaction data in ${blobName} - skipping`);
      return { success: false, dateSuffix, files: [] };
    }
    
    console.log(`🔄 Processing ${blobName} (${data.length} transactions)...`);
    
    try {
      // Track timing
      const timing = {
        topBroker: 0,
        comprehensive: 0
      };
      
      // Create top broker and comprehensive analysis in parallel
      const startTime = Date.now();
      const [topBroker, comprehensiveSummary] = await Promise.all([
        Promise.resolve(this.createTopBroker(data)),
        Promise.resolve(this.createComprehensiveTopBroker(data))
      ]);
      timing.topBroker = Math.round((Date.now() - startTime) / 1000);
      
      // Count unique brokers processed in this DT file
      const uniqueBrokers = new Set([
        ...data.map(row => row.BRK_COD1),
        ...data.map(row => row.BRK_COD2)
      ]);
      const brokerCount = uniqueBrokers.size;
      
      // Save files
      const comprehensiveStartTime = Date.now();
      await Promise.all([
        this.saveToAzure(`top_broker/top_broker_${dateSuffix}/top_broker.csv`, comprehensiveSummary),
        this.saveToAzure(`top_broker/top_broker_${dateSuffix}/top_broker_by_stock.csv`, topBroker)
      ]);
      timing.comprehensive = Math.round((Date.now() - comprehensiveStartTime) / 1000);
      
      const allFiles = [
        `top_broker/top_broker_${dateSuffix}/top_broker.csv`,
        `top_broker/top_broker_${dateSuffix}/top_broker_by_stock.csv`
      ];
      
      console.log(`✅ Completed processing ${blobName} - ${allFiles.length} files created, ${brokerCount} brokers processed`);
      
      // Update progress tracker
      if (progressTracker) {
        progressTracker.processedBrokers += brokerCount;
        await progressTracker.updateProgress();
      }
      
      return { success: true, dateSuffix, files: allFiles, timing, brokerCount };
      
    } catch (error) {
      console.error(`Error processing ${blobName}:`, error);
      return { success: false, dateSuffix, files: [] };
    }
  }

  /**
   * Pre-count total unique brokers from all DT files that need processing
   * CRITICAL: Loads files DIRECTLY from Azure WITHOUT cache to avoid caching files during pre-count
   * This is used for accurate progress tracking
   */
  private async preCountTotalBrokers(dtFiles: string[]): Promise<number> {
    console.log(`🔍 Pre-counting total brokers from ${dtFiles.length} DT files (loading WITHOUT cache)...`);
    const allBrokers = new Set<string>();
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
            data.forEach(t => {
              if (t.BRK_COD1) allBrokers.add(t.BRK_COD1);
              if (t.BRK_COD2) allBrokers.add(t.BRK_COD2);
            });
          }
        } catch (error) {
          // Skip files that can't be read during pre-count
          console.warn(`⚠️ Could not pre-count brokers from ${blobName}:`, error instanceof Error ? error.message : error);
        }
      });
      
      await Promise.all(batchPromises);
      processedFiles += batch.length;
      
      if ((i + PRE_COUNT_BATCH_SIZE) % 50 === 0 || i + PRE_COUNT_BATCH_SIZE >= dtFiles.length) {
        console.log(`   Pre-counted ${processedFiles}/${dtFiles.length} files, found ${allBrokers.size} unique brokers so far...`);
      }
    }
    
    console.log(`✅ Pre-count complete: ${allBrokers.size} unique brokers found across ${dtFiles.length} DT files`);
    return allBrokers.size;
  }

  /**
   * Main function to generate top broker data for all DT files
   */
  public async generateTopBrokerData(_dateSuffix: string, logId?: string | null): Promise<{ success: boolean; message: string; data?: any }> {
    const startTime = Date.now();
    let datesToProcess: Set<string> = new Set();
    
    try {
      console.log(`Starting top broker analysis for all DT files...`);
      
      // Find all DT files (sudah filter yang belum ada output)
      const dtFiles = await this.findAllDtFiles();
      
      if (dtFiles.length === 0) {
        console.log(`⚠️ No DT files found in done-summary folder`);
        return {
          success: true,
          message: `No DT files found - skipped top broker generation`,
          data: { skipped: true, reason: 'No DT files found' }
        };
      }
      
      console.log(`📊 Processing ${dtFiles.length} DT files...`);
      
      // CRITICAL: Pre-count FIRST before setting active dates to avoid caching during pre-count
      // Pre-count loads files WITHOUT cache
      const totalUniqueBrokers = await this.preCountTotalBrokers(dtFiles);
      
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
      // Estimate total brokers processed = unique brokers * average files per broker (roughly 1.5x for overlap)
      const estimatedTotalBrokers = Math.round(totalUniqueBrokers * 1.5);
      
      // Create progress tracker for thread-safe broker counting
      const progressTracker: ProgressTracker = {
        totalBrokers: estimatedTotalBrokers,
        processedBrokers: 0,
        logId: logId || null,
        updateProgress: async () => {
          if (progressTracker.logId) {
            const percentage = estimatedTotalBrokers > 0 
              ? Math.min(100, Math.round((progressTracker.processedBrokers / estimatedTotalBrokers) * 100))
              : 0;
            await SchedulerLogService.updateLog(progressTracker.logId, {
              progress_percentage: percentage,
              current_processing: `Processing brokers: ${progressTracker.processedBrokers.toLocaleString()}/${estimatedTotalBrokers.toLocaleString()} brokers processed`
            });
          }
        }
      };
      
      // Process files in batches (Phase 4: 6 files at a time)
      const BATCH_SIZE = BATCH_SIZE_PHASE_4; // Phase 4: 6 files
      const MAX_CONCURRENT = MAX_CONCURRENT_REQUESTS_PHASE_4; // Phase 4: 3 concurrent
      const allResults: { success: boolean; dateSuffix: string; files: string[]; timing?: any; brokerCount?: number }[] = [];
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
            progress_percentage: estimatedTotalBrokers > 0 
              ? Math.min(100, Math.round((progressTracker.processedBrokers / estimatedTotalBrokers) * 100))
              : Math.round((processed / dtFiles.length) * 100),
            current_processing: `Processing batch ${batchNumber}/${Math.ceil(dtFiles.length / BATCH_SIZE)} (${processed}/${dtFiles.length} dates, ${progressTracker.processedBrokers.toLocaleString()}/${estimatedTotalBrokers.toLocaleString()} brokers)`
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
        
        const batchBrokerCount = batchResults.reduce((sum, r) => sum + (r?.brokerCount || 0), 0);
        console.log(`📊 Batch complete: ${successful}/${processed} successful, ${batchBrokerCount} brokers processed, ${progressTracker.processedBrokers.toLocaleString()}/${estimatedTotalBrokers.toLocaleString()} total brokers processed`);
        
        // Update progress after batch (based on brokers processed)
        if (logId) {
          await SchedulerLogService.updateLog(logId, {
            progress_percentage: estimatedTotalBrokers > 0 
              ? Math.min(100, Math.round((progressTracker.processedBrokers / estimatedTotalBrokers) * 100))
              : Math.round((processed / dtFiles.length) * 100),
            current_processing: `Completed batch ${batchNumber}/${Math.ceil(dtFiles.length / BATCH_SIZE)} (${processed}/${dtFiles.length} dates, ${progressTracker.processedBrokers.toLocaleString()}/${estimatedTotalBrokers.toLocaleString()} brokers processed)`
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
      let topBrokerFiles = 0;
      let comprehensiveFiles = 0;
      
      const totalTiming = {
        topBroker: 0,
        comprehensive: 0
      };
      
      allResults.forEach(result => {
        if (result.success) {
          result.files.forEach(file => {
            if (file.includes('top_broker_by_stock')) {
              topBrokerFiles++;
            } else if (file.includes('top_broker.csv')) {
              comprehensiveFiles++;
            }
          });
          
          // Aggregate timing if available
          if (result.timing) {
            totalTiming.topBroker += result.timing.topBroker || 0;
            totalTiming.comprehensive += result.timing.comprehensive || 0;
          }
        }
      });
      
      console.log(`✅ Top broker analysis completed!`);
      console.log(`📊 Processed: ${processed}/${dtFiles.length} DT files`);
      console.log(`📊 Successful: ${successful}/${processed} files`);
      console.log(`📊 Total output files: ${totalFiles}`);
      console.log(`📊 Output breakdown:`);
      console.log(`   🏆 Top Broker by Stock files: ${topBrokerFiles} (${totalTiming.topBroker}s)`);
      console.log(`   📊 Comprehensive Top Broker files: ${comprehensiveFiles} (${totalTiming.comprehensive}s)`);
      console.log(`✅ Top Broker calculation completed successfully`);
      console.log(`✅ Top Broker completed in ${totalDuration}s`);
      
      return {
        success: true,
        message: `Top broker generated successfully for ${successful}/${processed} DT files`,
        data: {
          totalDtFiles: dtFiles.length,
          processedFiles: processed,
          successfulFiles: successful,
          totalOutputFiles: totalFiles,
          duration: totalDuration,
          outputBreakdown: {
            topBrokerFiles,
            comprehensiveFiles
          },
          timingBreakdown: totalTiming,
          results: allResults.filter(r => r.success)
        }
      };
      
    } catch (error) {
      console.error('Error generating top broker:', error);
      return {
        success: false,
        message: `Failed to generate top broker: ${error instanceof Error ? error.message : 'Unknown error'}`
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

export default TopBrokerCalculator;

