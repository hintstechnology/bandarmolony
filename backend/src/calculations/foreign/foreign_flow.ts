import { downloadText, uploadText, listPaths } from '../../utils/azureBlob';
import { BATCH_SIZE_PHASE_3, MAX_CONCURRENT_REQUESTS_PHASE_3 } from '../../services/dataUpdateService';
import { SchedulerLogService } from '../../services/schedulerLogService';
import { doneSummaryCache } from '../../cache/doneSummaryCacheService';

// Progress tracker interface for thread-safe stock counting
interface ProgressTracker {
  totalStocks: number;
  processedStocks: number;
  logId: string | null;
  updateProgress: () => Promise<void>;
}

// Helper function to limit concurrency for Phase 3
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

// Type definitions untuk Foreign Flow
interface TransactionData {
  STK_CODE: string;
  BRK_COD1: string;  // Seller broker
  BRK_COD2: string;  // Buyer broker
  STK_VOLM: number;
  STK_PRIC: number;
  TRX_DATE: string;
  TRX_TIME: string;
  INV_TYP1: string;  // Investor type seller: 'A' = Foreign, 'D' = Domestic
  INV_TYP2: string;  // Investor type buyer: 'A' = Foreign, 'D' = Domestic
}

interface ForeignFlowData {
  Date: string;
  BuyVol: number;      // Volume beli foreign
  SellVol: number;    // Volume jual foreign
  NetBuyVol: number;  // Net volume beli foreign (BuyVol - SellVol)
}

export class ForeignFlowCalculator {
  constructor() {
    // No need for Azure client initialization - using azureBlob utility
  }

  /**
   * Find all DT files in done-summary folder
   * OPTIMIZED: Uses shared cache to avoid repeated listPaths calls
   * CRITICAL: Untuk foreign_flow, outputnya per-stock, jadi kita tidak bisa filter di sini
   * Filtering akan dilakukan di processSingleDtFile setelah load file
   */
  private async findAllDtFiles(_existingDatesByStock: Map<string, Set<string>>): Promise<string[]> {
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
      
      // OPTIMIZATION: Filter file yang SEMUA stock-nya sudah memiliki tanggal tersebut di output
      // Untuk foreign_flow, outputnya per-stock, jadi kita perlu cek apakah SEMUA stock sudah punya tanggal tersebut
      // Tapi karena kita belum tahu stock apa saja yang ada di file tanpa load, kita akan skip filtering di sini
      // dan lakukan di processSingleDtFile. Tapi kita bisa skip file yang TIDAK ADA stock sama sekali yang perlu diproses
      // dengan cara cek apakah ada minimal 1 stock yang belum punya tanggal tersebut
      
      // Untuk sekarang, kita return semua file dan filtering dilakukan di processSingleDtFile
      // Tapi kita akan skip pre-count untuk file yang sudah pasti tidak perlu
      console.log(`Found ${sortedFiles.length} DT files (filtering will be done per-file based on existing dates)`);
      return sortedFiles;
    } catch (error) {
      console.error('Error scanning DT files:', error);
      return [];
    }
  }

  /**
   * Pre-check file to see if it needs processing (loads file WITHOUT cache)
   * Returns true if file needs processing, false if all dates already exist
   */
  private async preCheckFileNeedsProcessing(blobName: string, existingDatesByStock: Map<string, Set<string>>): Promise<boolean> {
    try {
      // Load file DIRECTLY from Azure WITHOUT using cache service
      const content = await downloadText(blobName);
      
      if (!content || content.trim().length === 0) {
        return false;
      }
      
      const lines = content.trim().split('\n');
      if (lines.length < 2) return false;
      
      // Parse header
      const header = lines[0]?.split(';') || [];
      const stkCodeIndex = header.findIndex(col => col.trim() === 'STK_CODE');
      const trxDateIndex = header.findIndex(col => col.trim() === 'TRX_DATE');
      
      if (stkCodeIndex === -1 || trxDateIndex === -1) {
        return true; // If we can't parse, assume needs processing
      }
      
      // Check first 1000 lines to see if any stock+date combination needs processing
      // This is a quick check without loading entire file
      const checkLimit = Math.min(1000, lines.length - 1);
      for (let i = 1; i <= checkLimit; i++) {
        const line = lines[i];
        if (!line || line.trim().length === 0) continue;
        
        const values = line.split(';');
        if (values.length < header.length) continue;
        
        const stockCode = values[stkCodeIndex]?.trim() || '';
        const trxDate = values[trxDateIndex]?.trim() || '';
        
        // Only check 4-character stocks
        if (stockCode.length === 4 && trxDate) {
          const existingDates = existingDatesByStock.get(stockCode);
          if (!existingDates || !existingDates.has(trxDate)) {
            // Found at least one transaction that needs processing
            return true;
          }
        }
      }
      
      // If we checked all lines in the sample and all exist, check if file is small
      // If file is larger than sample, we need to process it to be safe
      if (lines.length - 1 > checkLimit) {
        // File is larger than sample, need to process to check all
        return true;
      }
      
      // All checked transactions already exist
      return false;
    } catch (error) {
      // If error, assume needs processing
      return true;
    }
  }

  /**
   * Load and process a single DT file
   * OPTIMIZED: Uses shared cache to avoid repeated downloads
   * CRITICAL: Only loads file if it needs processing (after pre-check)
   */
  private async loadAndProcessSingleDtFile(blobName: string): Promise<{ data: TransactionData[], dateSuffix: string } | null> {
    try {
      // Extract date from blob name (done-summary/20251021/DT251021.csv)
      const pathParts = blobName.split('/');
      const dateFolder = pathParts[1] || 'unknown'; // 20251021
      const dateSuffix = dateFolder; // Use full date as suffix
      
      // Use shared cache for raw content (will cache automatically if not exists)
      // CRITICAL: Only call this if file needs processing (after pre-check)
      const content = await doneSummaryCache.getRawContent(blobName);
      
      if (!content || content.trim().length === 0) {
        console.log(`⚠️ Empty file: ${blobName}`);
        return null;
      }
      
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
    const trxDateIndex = getColumnIndex('TRX_DATE');
    const trxTimeIndex = getColumnIndex('TRX_TIME');
    const invTyp1Index = getColumnIndex('INV_TYP1');
    const invTyp2Index = getColumnIndex('INV_TYP2');
    
    // Validate required columns exist
    if (stkCodeIndex === -1 || brkCod1Index === -1 || brkCod2Index === -1 || 
        stkVolmIndex === -1 || stkPricIndex === -1) {
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
          TRX_DATE: trxDateIndex !== -1 ? values[trxDateIndex]?.trim() || '' : '',
          TRX_TIME: trxTimeIndex !== -1 ? values[trxTimeIndex]?.trim() || '' : '',
          INV_TYP1: invTyp1Index !== -1 ? values[invTyp1Index]?.trim() || '' : '',
          INV_TYP2: invTyp2Index !== -1 ? values[invTyp2Index]?.trim() || '' : ''
        };
        
        data.push(transaction);
      }
    }
    
    console.log(`📊 Loaded ${data.length} transaction records from Azure (4-character stocks only)`);
    return data;
  }

  /**
   * Check if transaction involves foreign investors
   */
  // private isForeignTransaction(transaction: TransactionData): boolean {
  //   return transaction.INV_TYP1 === 'A' || transaction.INV_TYP2 === 'A';
  // }

  /**
   * Extract existing dates from existing CSV data
   */
  private extractExistingDates(existingData: ForeignFlowData[]): Set<string> {
    const dates = new Set<string>();
    existingData.forEach(item => dates.add(item.Date));
    return dates;
  }

  /**
   * Create foreign flow data for each stock
   * OPTIMIZED: Filter out dates that already exist in output
   */
  private createForeignFlowData(data: TransactionData[], existingDatesByStock: Map<string, Set<string>>): Map<string, ForeignFlowData[]> {
    console.log("\nCreating foreign flow data (filtering existing dates)...");
    
    // Group by stock code and date
    const stockDateGroups = new Map<string, Map<string, TransactionData[]>>();
    
    data.forEach(row => {
      const stock = row.STK_CODE;
      const date = row.TRX_DATE;
      
      // OPTIMIZATION: Skip if date already exists in output for this stock
      const existingDates = existingDatesByStock.get(stock);
      if (existingDates && existingDates.has(date)) {
        return; // Skip this transaction - date already processed
      }
      
      if (!stockDateGroups.has(stock)) {
        stockDateGroups.set(stock, new Map());
      }
      
      const dateGroups = stockDateGroups.get(stock)!;
      if (!dateGroups.has(date)) {
        dateGroups.set(date, []);
      }
      
      dateGroups.get(date)!.push(row);
    });
    
    const foreignFlowData = new Map<string, ForeignFlowData[]>();
    
    stockDateGroups.forEach((dateGroups, stock) => {
      const stockForeignFlow: ForeignFlowData[] = [];
      
      dateGroups.forEach((transactions, date) => {
        let buyVol = 0;
        let sellVol = 0;
        
        transactions.forEach(transaction => {
          const volume = transaction.STK_VOLM;
          
          // Check if foreign is buyer (INV_TYP2 = 'A')
          if (transaction.INV_TYP2 === 'A') {
            buyVol += volume;
          }
          
          // Check if foreign is seller (INV_TYP1 = 'A')
          if (transaction.INV_TYP1 === 'A') {
            sellVol += volume;
          }
        });
        
        const netBuyVol = buyVol - sellVol;
        
        stockForeignFlow.push({
          Date: date,
          BuyVol: buyVol,
          SellVol: sellVol,
          NetBuyVol: netBuyVol
        });
      });
      
      // Sort by date in descending order (newest first)
      stockForeignFlow.sort((a, b) => {
        const dateA = a.Date || '';
        const dateB = b.Date || '';
        return dateB.localeCompare(dateA);
      });
      
      if (stockForeignFlow.length > 0) {
        foreignFlowData.set(stock, stockForeignFlow);
      }
    });
    
    const filteredCount = Array.from(stockDateGroups.values()).reduce((sum, dates) => sum + dates.size, 0);
    console.log(`Foreign flow data created for ${foreignFlowData.size} stocks (${filteredCount} new dates)`);
    return foreignFlowData;
  }

  /**
   * Read existing CSV data from Azure
   */
  private async readExistingCsvDataFromAzure(filename: string): Promise<ForeignFlowData[]> {
    try {
      const content = await downloadText(filename);
    
    const lines = content.trim().split('\n');
    const data: ForeignFlowData[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      
      const values = line.split(',');
      if (values.length >= 4) {
        data.push({
          Date: values[0]?.trim() || '',
          BuyVol: parseFloat(values[1]?.trim() || '0'),
          SellVol: parseFloat(values[2]?.trim() || '0'),
          NetBuyVol: parseFloat(values[3]?.trim() || '0')
        });
      }
    }
    
    return data;
    } catch (error) {
      // File not found is normal for new files - just return empty array
      if (error instanceof Error && error.message.includes('Blob not found')) {
        return [];
      }
      console.error(`Error reading existing CSV data from ${filename}:`, error);
      return [];
    }
  }

  /**
   * Merge existing data with new data and sort by date
   */
  private mergeForeignFlowData(existingData: ForeignFlowData[], newData: ForeignFlowData[]): ForeignFlowData[] {
    // Create a map to avoid duplicates
    const dataMap = new Map<string, ForeignFlowData>();
    
    // Add existing data
    existingData.forEach(item => {
      dataMap.set(item.Date, item);
    });
    
    // Add/update with new data
    newData.forEach(item => {
      dataMap.set(item.Date, item);
    });
    
    // Convert back to array and sort by date in descending order (newest first)
    const mergedData = Array.from(dataMap.values());
    mergedData.sort((a, b) => {
      const dateA = a.Date || '';
      const dateB = b.Date || '';
      return dateB.localeCompare(dateA);
    });
    
    return mergedData;
  }

  /**
   * Save data to Azure Blob Storage
   */
  private async saveToAzure(filename: string, data: ForeignFlowData[]): Promise<void> {
    if (data.length === 0) {
      console.log(`No data to save for ${filename}`);
      return;
    }
    
    // Convert to CSV format
    const headers = ['Date', 'BuyVol', 'SellVol', 'NetBuyVol'];
    const csvContent = [
      headers.join(','),
      ...data.map(row => [row.Date, row.BuyVol, row.SellVol, row.NetBuyVol].join(','))
    ].join('\n');
    
    await uploadText(filename, csvContent, 'text/csv');
    console.log(`Saved ${data.length} records to ${filename}`);
  }


  /**
   * Create or update individual CSV files for each stock's foreign flow data
   */
  private async createForeignFlowCsvFiles(
    foreignFlowData: Map<string, ForeignFlowData[]>, 
    _dateSuffix: string,
    progressTracker?: ProgressTracker
  ): Promise<string[]> {
    console.log("\nCreating/updating individual CSV files for each stock's foreign flow...");
    
    const createdFiles: string[] = [];
    const stocks = Array.from(foreignFlowData.keys());
    
    for (let i = 0; i < stocks.length; i++) {
      const stockCode = stocks[i];
      if (!stockCode) continue; // Skip if undefined
      const flowData = foreignFlowData.get(stockCode);
      if (!flowData) continue; // Skip if no data
      const filename = `foreign_flow/${stockCode}.csv`;
      
      // Check if file already exists
      const existingData = await this.readExistingCsvDataFromAzure(filename);
      
      if (existingData.length > 0) {
        console.log(`Updating existing file: ${filename}`);
        
        // Merge with new data
        const mergedData = this.mergeForeignFlowData(existingData, flowData);
        
        // Save merged and sorted data
        await this.saveToAzure(filename, mergedData);
        console.log(`Updated ${filename} with ${mergedData.length} total trading days`);
      } else {
        console.log(`Creating new file: ${filename}`);
        await this.saveToAzure(filename, flowData);
        console.log(`Created ${filename} with ${flowData.length} trading days`);
      }
      
      createdFiles.push(filename);
      
      // Update progress tracker after each stock
      if (progressTracker) {
        progressTracker.processedStocks++;
        await progressTracker.updateProgress();
      }
    }
    
    console.log(`\nProcessed ${createdFiles.length} foreign flow CSV files`);
    return createdFiles;
  }

  /**
   * Load existing dates for all stocks from output files
   * OPTIMIZED: Pre-load all existing dates to avoid filtering later
   */
  private async loadExistingDatesByStock(): Promise<Map<string, Set<string>>> {
    console.log("📋 Loading existing dates from foreign_flow output files...");
    const existingDatesByStock = new Map<string, Set<string>>();
    
    try {
      // List all foreign flow files
      const allFiles = await listPaths({ prefix: 'foreign_flow/' });
      const csvFiles = allFiles.filter(f => f.endsWith('.csv') && f.startsWith('foreign_flow/'));
      
      console.log(`Found ${csvFiles.length} existing foreign flow files`);
      
      // Load each file and extract dates (in batches to avoid memory issues)
      const BATCH_SIZE = BATCH_SIZE_PHASE_3;
      for (let i = 0; i < csvFiles.length; i += BATCH_SIZE) {
        const batch = csvFiles.slice(i, i + BATCH_SIZE);
        
        await Promise.allSettled(
          batch.map(async (filename) => {
            try {
              const stockCode = filename.replace('foreign_flow/', '').replace('.csv', '');
              const existingData = await this.readExistingCsvDataFromAzure(filename);
              const dates = this.extractExistingDates(existingData);
              if (dates.size > 0) {
                existingDatesByStock.set(stockCode, dates);
              }
            } catch (error) {
              // Skip files that can't be read
            }
          })
        );
        
        if ((i + BATCH_SIZE) % 200 === 0) {
          console.log(`📋 Loaded existing dates for ${existingDatesByStock.size} stocks...`);
        }
      }
      
      console.log(`✅ Loaded existing dates for ${existingDatesByStock.size} stocks`);
      return existingDatesByStock;
    } catch (error) {
      console.error('Error loading existing dates:', error);
      return existingDatesByStock; // Return empty map if error
    }
  }

  /**
   * Process a single DT file with all foreign flow analysis
   * OPTIMIZED: Pre-check file before loading to skip files that don't need processing
   * CRITICAL: Pre-check loads file WITHOUT cache to determine if processing is needed
   * Only loads file with cache if it actually needs processing
   */
  private async processSingleDtFile(blobName: string, existingDatesByStock: Map<string, Set<string>>, progressTracker?: ProgressTracker): Promise<{ success: boolean; dateSuffix: string; files: string[] }> {
    // Extract date from blob name first
    const pathParts = blobName.split('/');
    const dateFolder = pathParts[1] || 'unknown';
    const dateSuffix = dateFolder;
    
    // CRITICAL: Pre-check file BEFORE loading to see if it needs processing
    // This loads file WITHOUT cache to avoid caching files that don't need processing
    const needsProcessing = await this.preCheckFileNeedsProcessing(blobName, existingDatesByStock);
    
    if (!needsProcessing) {
      console.log(`⏭️  Skipping ${blobName} - all dates already exist in output (pre-check passed, file NOT loaded)`);
      return { success: false, dateSuffix, files: [] };
    }
    
    // File needs processing, now load it WITH cache
    console.log(`Loading DT file: ${blobName}`);
    const result = await this.loadAndProcessSingleDtFile(blobName);
    
    if (!result) {
      return { success: false, dateSuffix, files: [] };
    }
    
    const { data } = result;
    
    if (data.length === 0) {
      console.log(`⚠️ No transaction data in ${blobName} - skipping`);
      return { success: false, dateSuffix, files: [] };
    }
    
    // OPTIMIZATION: Filter out transactions for dates that already exist
    const filteredData = data.filter(row => {
      const existingDates = existingDatesByStock.get(row.STK_CODE);
      return !existingDates || !existingDates.has(row.TRX_DATE);
    });
    
    if (filteredData.length === 0) {
      console.log(`⏭️  Skipping ${blobName} - all dates already exist in output (after detailed check)`);
      // Remove from cache since we don't need it
      doneSummaryCache.clearDate(dateSuffix);
      return { success: false, dateSuffix, files: [] };
    }
    
    // Set active processing date HANYA saat file benar-benar akan diproses (setelah filter)
    doneSummaryCache.addActiveProcessingDate(dateSuffix);
    
    const skippedCount = data.length - filteredData.length;
    if (skippedCount > 0) {
      console.log(`🔍 Filtered ${skippedCount} transactions (dates already exist), processing ${filteredData.length} new transactions`);
    }
    
    console.log(`🔄 Processing ${blobName} (${filteredData.length} new transactions)...`);
    
    try {
      // Create foreign flow data (will only include new dates)
      const foreignFlowData = this.createForeignFlowData(filteredData, existingDatesByStock);
      
      if (foreignFlowData.size === 0) {
        console.log(`⏭️  Skipping ${blobName} - no new dates to process`);
        doneSummaryCache.removeActiveProcessingDate(dateSuffix);
        return { success: false, dateSuffix, files: [] };
      }
      
      // Create or update individual CSV files for each stock
      const createdFiles = await this.createForeignFlowCsvFiles(foreignFlowData, dateSuffix, progressTracker);
      
      console.log(`✅ Completed processing ${blobName} - ${createdFiles.length} files updated`);
      return { success: true, dateSuffix, files: createdFiles };
      
    } catch (error) {
      console.error(`Error processing ${blobName}:`, error);
      doneSummaryCache.removeActiveProcessingDate(dateSuffix);
      return { success: false, dateSuffix, files: [] };
    }
  }

  /**
   * Main function to generate foreign flow data for all DT files
   * OPTIMIZED: Pre-load existing dates to skip already processed dates
   */
  public async generateForeignFlowData(_dateSuffix: string, logId?: string | null): Promise<{ success: boolean; message: string; data?: any }> {
    let dtFiles: string[] = [];
    
    try {
      console.log(`Starting foreign flow data extraction for all DT files...`);
      
      // OPTIMIZATION: Pre-load existing dates from output files
      const existingDatesByStock = await this.loadExistingDatesByStock();
      
      // Find all DT files (filtering akan dilakukan per file di processSingleDtFile)
      dtFiles = await this.findAllDtFiles(existingDatesByStock);
      
      if (dtFiles.length === 0) {
        console.log(`⚠️ No DT files found in done-summary folder`);
        return {
          success: true,
          message: `No DT files found - skipped foreign flow calculation`,
          data: { skipped: true, reason: 'No DT files found' }
        };
      }
      
      console.log(`📊 Processing ${dtFiles.length} DT files...`);
      
      // Skip pre-count untuk foreign_flow (output per-stock, tidak bisa determine stocks tanpa load)
      // Progress tracking akan berdasarkan file yang diproses
      const progressTracker: ProgressTracker = {
        totalStocks: 0, // No pre-count for foreign_flow
        processedStocks: 0,
        logId: logId || null,
        updateProgress: async () => {
          if (progressTracker.logId) {
            // Progress based on files processed, not stocks
            await SchedulerLogService.updateLog(progressTracker.logId, {
              progress_percentage: 0, // Will be updated based on files
              current_processing: `Processing foreign flow files...`
            });
          }
        }
      };
      
      // Process files in batches for speed (Phase 3: 6 files at a time)
      const BATCH_SIZE = BATCH_SIZE_PHASE_3;
      const MAX_CONCURRENT = MAX_CONCURRENT_REQUESTS_PHASE_3; // Phase 3: 3 concurrent
      const allResults: { success: boolean; dateSuffix: string; files: string[] }[] = [];
      let processed = 0;
      let successful = 0;
      let skippedCount = 0;
      
      for (let i = 0; i < dtFiles.length; i += BATCH_SIZE) {
        const batch = dtFiles.slice(i, i + BATCH_SIZE);
        const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
        console.log(`📦 Processing batch ${batchNumber}/${Math.ceil(dtFiles.length / BATCH_SIZE)} (${batch.length} files)`);
        
        // Update progress before batch (showing DT file progress)
        if (logId) {
          await SchedulerLogService.updateLog(logId, {
            progress_percentage: Math.round((processed / dtFiles.length) * 100),
            current_processing: `Processing batch ${batchNumber}/${Math.ceil(dtFiles.length / BATCH_SIZE)} (${processed}/${dtFiles.length} files)`
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
        const batchPromises = batch.map(blobName => this.processSingleDtFile(blobName, existingDatesByStock, progressTracker));
        const batchResults = await limitConcurrency(batchPromises, MAX_CONCURRENT);
        
        // Memory cleanup after batch
        if (global.gc) {
          global.gc();
          const memAfter = process.memoryUsage();
          const heapUsedMB = memAfter.heapUsed / 1024 / 1024;
          console.log(`📊 Batch ${batchNumber} complete - Memory: ${heapUsedMB.toFixed(2)}MB`);
        }
        
        // Collect results
        batchResults.forEach((result: any) => {
          if (result && result.success !== undefined) {
            allResults.push(result);
            processed++;
            if (result.success) {
              successful++;
            } else if (result.files && result.files.length === 0) {
              skippedCount++;
            }
          }
        });
        
        console.log(`📊 Batch complete: ${successful}/${processed} successful, ${skippedCount} skipped (no new dates)`);
        
        // Update progress after batch (based on files processed)
        if (logId) {
          await SchedulerLogService.updateLog(logId, {
            progress_percentage: Math.round((processed / dtFiles.length) * 100),
            current_processing: `Completed batch ${batchNumber}/${Math.ceil(dtFiles.length / BATCH_SIZE)} (${processed}/${dtFiles.length} files processed)`
          });
        }
        
        // Small delay between batches
        if (i + BATCH_SIZE < dtFiles.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      const totalFiles = allResults.reduce((sum, result) => sum + result.files.length, 0);
      
      console.log(`✅ Foreign flow data extraction completed!`);
      console.log(`📊 Processed: ${processed}/${dtFiles.length} DT files`);
      console.log(`📊 Successful: ${successful}/${processed} files`);
      console.log(`📊 Skipped: ${skippedCount} files (no new dates)`);
      console.log(`📊 Total output files updated: ${totalFiles}`);
      
      return {
        success: true,
        message: `Foreign flow data generated successfully for ${successful}/${processed} DT files (${skippedCount} skipped - no new dates)`,
        data: {
          totalDtFiles: dtFiles.length,
          processedFiles: processed,
          successfulFiles: successful,
          skippedFiles: skippedCount,
          totalOutputFiles: totalFiles,
          results: allResults.filter(r => r.success)
        }
      };
      
    } catch (error) {
      console.error('Error generating foreign flow data:', error);
      return {
        success: false,
        message: `Failed to generate foreign flow data: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    } finally {
      // Cleanup: Remove active processing dates setelah selesai
      // NOTE: Untuk foreign_flow, active dates ditambahkan per file di processSingleDtFile()
      // Jadi kita perlu cleanup semua tanggal yang mungkin sudah ditambahkan
      // Kita bisa cleanup berdasarkan dtFiles yang diproses
      if (dtFiles && dtFiles.length > 0) {
        dtFiles.forEach(file => {
          const dateMatch = file.match(/done-summary\/(\d{8})\//);
          if (dateMatch && dateMatch[1]) {
            doneSummaryCache.removeActiveProcessingDate(dateMatch[1]);
          }
        });
        console.log(`🧹 Cleaned up active processing dates from cache`);
      }
    }
  }
}

export default ForeignFlowCalculator;
