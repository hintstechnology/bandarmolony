import { uploadText, listPaths } from '../../utils/azureBlob';
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

// Type definitions untuk Done Trade Data
interface DoneTradeData {
  STK_CODE: string;
  BRK_COD1: string;  // Seller broker
  BRK_COD2: string;  // Buyer broker
  STK_VOLM: number;
  STK_PRIC: number;
  TRX_DATE: string;
  TRX_TIME: number;  // Changed to number for frontend compatibility
  INV_TYP1: string;  // Investor type seller
  INV_TYP2: string;  // Investor type buyer
  TYP: string;       // Transaction type
  TRX_CODE: number;  // Transaction code
  TRX_SESS: number;  // Transaction session
  TRX_ORD1: number;  // Order 1
  TRX_ORD2: number;  // Order 2
  HAKA_HAKI: number; // HAKA = 1 if TRX_ORD1 > TRX_ORD2, HAKI = 0 otherwise
  VALUE: number;     // Volume * Price / 100
  [key: string]: any; // Allow additional columns
}

export class BreakDoneTradeCalculator {
  constructor() {
    // No need for Azure client initialization - using azureBlob utility
  }

  /**
   * Monitor memory usage and log warnings
   */
  private logMemoryUsage(context: string): void {
    const used = process.memoryUsage();
    const usedMB = Math.round(used.heapUsed / 1024 / 1024);
    const totalMB = Math.round(used.heapTotal / 1024 / 1024);
    const rssMB = Math.round(used.rss / 1024 / 1024);
    const externalMB = Math.round(used.external / 1024 / 1024);
    
    console.log(`📊 Memory [${context}]:`);
    console.log(`   🟢 Heap: ${usedMB}MB/${totalMB}MB (${Math.round(usedMB/totalMB*100)}%)`);
    console.log(`   🔵 RSS: ${rssMB}MB (${Math.round(rssMB/1024*100)/100}GB)`);
    console.log(`   🟡 External: ${externalMB}MB`);
    
    // Warn if memory usage is high
    if (usedMB > 3000) { // Reduced threshold due to low system RAM
      console.warn(`⚠️ High memory usage detected: ${usedMB}MB - forcing garbage collection`);
      if (global.gc) {
        global.gc();
      }
    }
    
    // Critical warning if approaching limit
    if (usedMB > 6000) {
      console.error(`🚨 CRITICAL: Memory usage ${usedMB}MB approaching limit!`);
      console.error(`🚨 System RAM: 16GB total, only 0.6GB available!`);
      console.error(`🚨 Consider: 1) Close other apps, 2) Restart system, 3) Reduce batch size`);
    }
  }

  /**
   * Check if done_detail folder for specific date already exists and has files in STOCK subfolder
   */
  private async checkDoneDetailExists(dateSuffix: string): Promise<boolean> {
    try {
      const prefix = `done_detail/${dateSuffix}/STOCK/`;
      const existingFiles = await listPaths({ prefix, maxResults: 1 });
      return existingFiles.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Find all DT files in done-summary folder
   * OPTIMIZED: Uses shared cache to avoid repeated listPaths calls
   * Skip files where done_detail/{date}/ already exists
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
      
      // OPTIMIZATION: Check which dates already have done_detail output
      console.log("🔍 Checking existing done_detail folders to skip...");
      const filesToProcess: string[] = [];
      let skippedCount = 0;
      
      for (const file of sortedFiles) {
        const dateFolder = file.split('/')[1] || '';
        const exists = await this.checkDoneDetailExists(dateFolder);
        
        if (exists) {
          skippedCount++;
          console.log(`⏭️  Skipping ${file} - done_detail/${dateFolder}/ already exists`);
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
   * OPTIMIZED: Uses shared cache to avoid repeated downloads
   */
  private async loadAndProcessSingleDtFile(blobName: string): Promise<{ data: DoneTradeData[], dateSuffix: string } | null> {
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
      
      const data = this.parseDoneTradeData(content);
      console.log(`✅ Loaded ${data.length} done trade records from ${blobName}`);
      
      return { data, dateSuffix };
    } catch (error) {
      console.log(`📄 File not found, will create new: ${blobName}`);
      return null;
    }
  }

  private parseDoneTradeData(content: string): DoneTradeData[] {
    const lines = content.trim().split('\n');
    const data: DoneTradeData[] = [];
    
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
    const typIndex = getColumnIndex('TYP');
    const trxCodeIndex = getColumnIndex('TRX_CODE');
    const trxSessIndex = getColumnIndex('TRX_SESS');
    const trxOrd1Index = getColumnIndex('TRX_ORD1');
    const trxOrd2Index = getColumnIndex('TRX_ORD2');
    
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
      
      // Parse numeric fields
      const stkVolm = parseFloat(values[stkVolmIndex]?.trim() || '0') || 0;
      const stkPric = parseFloat(values[stkPricIndex]?.trim() || '0') || 0;
      const trxOrd1 = trxOrd1Index !== -1 ? parseInt(values[trxOrd1Index]?.trim() || '0') || 0 : 0;
      const trxOrd2 = trxOrd2Index !== -1 ? parseInt(values[trxOrd2Index]?.trim() || '0') || 0 : 0;
      
      // Calculate HAKA/HAKI: HAKA = 1 if TRX_ORD1 > TRX_ORD2, HAKI = 0 otherwise
      const hakaHaki = trxOrd1 > trxOrd2 ? 1 : 0;
      
      // Calculate VALUE: Volume * Price / 100
      const value = (stkVolm * stkPric) / 100;
      
      const doneTradeData: DoneTradeData = {
        STK_CODE: values[stkCodeIndex]?.trim() || '',
        BRK_COD1: values[brkCod1Index]?.trim() || '',
        BRK_COD2: values[brkCod2Index]?.trim() || '',
        STK_VOLM: stkVolm,
        STK_PRIC: stkPric,
        TRX_DATE: trxDateIndex !== -1 ? values[trxDateIndex]?.trim() || '' : '',
        TRX_TIME: trxTimeIndex !== -1 ? parseInt(values[trxTimeIndex]?.trim() || '0') || 0 : 0,
        INV_TYP1: invTyp1Index !== -1 ? values[invTyp1Index]?.trim() || '' : '',
        INV_TYP2: invTyp2Index !== -1 ? values[invTyp2Index]?.trim() || '' : '',
        TYP: typIndex !== -1 ? values[typIndex]?.trim() || '' : '',
        TRX_CODE: trxCodeIndex !== -1 ? parseInt(values[trxCodeIndex]?.trim() || '0') || 0 : 0,
        TRX_SESS: trxSessIndex !== -1 ? parseInt(values[trxSessIndex]?.trim() || '0') || 0 : 0,
        TRX_ORD1: trxOrd1,
        TRX_ORD2: trxOrd2,
        HAKA_HAKI: hakaHaki,
        VALUE: value
      };
      
      // Add any additional columns that might exist - same as original file
      header.forEach((colName, index) => {
        if (!doneTradeData.hasOwnProperty(colName.trim())) {
          doneTradeData[colName.trim()] = values[index]?.trim() || '';
        }
      });
      
      data.push(doneTradeData);
    }
    
    console.log(`📊 Loaded ${data.length} done trade records from Azure`);
    return data;
  }

  /**
   * Group data by stock code - only include stock codes with 4 characters
   */
  private groupDataByStockCode(data: DoneTradeData[]): Map<string, DoneTradeData[]> {
    console.log("Grouping data by stock code (4 characters only)...");
    
    const groupedData = new Map<string, DoneTradeData[]>();
    let filteredCount = 0;
    
    data.forEach(row => {
      const stockCode = row.STK_CODE;
      
      // Only include stock codes with exactly 4 characters
      if (stockCode && stockCode.length === 4) {
        if (!groupedData.has(stockCode)) {
          groupedData.set(stockCode, []);
        }
        
        groupedData.get(stockCode)!.push(row);
      } else {
        filteredCount++;
      }
    });
    
    console.log(`Grouped data into ${groupedData.size} stock codes (4 characters)`);
    if (filteredCount > 0) {
      console.log(`Filtered out ${filteredCount} records with non-4-character stock codes`);
    }
    return groupedData;
  }

  /**
   * Save data to Azure Blob Storage
   * Column order: TRX_CODE,TRX_SESS,TRX_TYPE,BRK_COD2,INV_TYP2,BRK_COD1,INV_TYP1,STK_VOLM,STK_PRIC,TRX_ORD2,TRX_ORD1,TRX_TIME,HAKA_HAKI,VALUE
   * (Same as DT251105.csv but without STK_CODE and TRX_DATE, with added HAKA_HAKI and VALUE)
   */
  private async saveToAzure(filename: string, data: DoneTradeData[]): Promise<void> {
    if (data.length === 0) {
      console.log(`No data to save for ${filename}`);
      return;
    }
    
    // Define column order: same as DT251105.csv but without STK_CODE and TRX_DATE, with added HAKA_HAKI and VALUE
    const columnOrder = [
      'TRX_CODE',
      'TRX_SESS',
      'TRX_TYPE',
      'BRK_COD2',
      'INV_TYP2',
      'BRK_COD1',
      'INV_TYP1',
      'STK_VOLM',
      'STK_PRIC',
      'TRX_ORD2',
      'TRX_ORD1',
      'TRX_TIME',
      'HAKA_HAKI',
      'VALUE'
    ];
    
    // Use TRX_TYPE from TYP field (mapping)
    const csvContent = [
      columnOrder.join(','),
      ...data.map(row => {
        return columnOrder.map(header => {
          // Map TYP to TRX_TYPE for output
          if (header === 'TRX_TYPE') {
            return row['TYP'] || '';
          }
          const value = row[header];
          // Handle values that might contain commas
          if (typeof value === 'string' && value.includes(',')) {
            return `"${value}"`;
          }
          return value !== undefined && value !== null ? String(value) : '';
        }).join(',');
      })
    ].join('\n');
    
    await uploadText(filename, csvContent, 'text/csv');
    console.log(`Saved ${data.length} records to ${filename}`);
  }

  /**
   * Process a single DT file with break done trade analysis
   * OPTIMIZED: Double-check folder doesn't exist before processing (race condition protection)
   */
  private async processSingleDtFile(blobName: string, progressTracker?: ProgressTracker): Promise<{ success: boolean; dateSuffix: string; files: string[] }> {
    // Extract date before loading to check early
    const pathParts = blobName.split('/');
    const dateFolder = pathParts[1] || 'unknown';
    
    // Double-check: Skip if folder already exists (race condition protection)
    const exists = await this.checkDoneDetailExists(dateFolder);
    if (exists) {
      console.log(`⏭️  Skipping ${blobName} - done_detail/${dateFolder}/ already exists (race condition check)`);
      return { success: false, dateSuffix: dateFolder, files: [] };
    }
    
    const result = await this.loadAndProcessSingleDtFile(blobName);
    
    if (!result) {
      return { success: false, dateSuffix: dateFolder, files: [] };
    }
    
    const { data, dateSuffix } = result;
    
    if (data.length === 0) {
      console.log(`⚠️ No done trade data in ${blobName} - skipping`);
      return { success: false, dateSuffix, files: [] };
    }
    
    console.log(`🔄 Processing ${blobName} (${data.length} done trade records)...`);
    
    try {
      // Group data by stock code - same as original file
      const groupedData = this.groupDataByStockCode(data);
      
      // Save each stock's data to separate CSV file in STOCK subfolder
      const createdFiles: string[] = [];
      let totalRecords = 0;
      const stocks = Array.from(groupedData.keys());
      
      for (let i = 0; i < stocks.length; i++) {
        const stockCode = stocks[i];
        if (!stockCode) continue; // Skip if undefined
        const stockData = groupedData.get(stockCode);
        if (!stockData) continue; // Skip if no data
        const filename = `done_detail/${dateSuffix}/STOCK/${stockCode}.csv`;
        await this.saveToAzure(filename, stockData);
        createdFiles.push(filename);
        totalRecords += stockData.length;
        
        console.log(`Created ${filename} with ${stockData.length} records`);
        
        // Update progress tracker after each stock
        if (progressTracker) {
          progressTracker.processedStocks++;
          await progressTracker.updateProgress();
        }
        
        // Memory cleanup after each stock (every 50 stocks)
        if (createdFiles.length % 50 === 0) {
          if (global.gc) {
            global.gc();
            console.log(`🧹 Memory cleanup after ${createdFiles.length} stocks`);
          }
        }
      }
      
      console.log(`✅ Completed processing ${blobName} - ${createdFiles.length} files created`);
      return { success: true, dateSuffix, files: createdFiles };
      
    } catch (error) {
      console.error(`Error processing ${blobName}:`, error);
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
   * Main function to generate break done trade data for all DT files
   * Note: dateSuffix parameter is kept for API compatibility but not used
   * This method processes ALL DT files regardless of date
   */
  public async generateBreakDoneTradeData(_dateSuffix?: string, logId?: string | null): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      console.log(`Starting break done trade data extraction for all DT files...`);
      
      // Find all DT files
      const dtFiles = await this.findAllDtFiles();
      
      if (dtFiles.length === 0) {
        console.log(`⚠️ No DT files found in done-summary folder`);
        return {
          success: true,
          message: `No DT files found - skipped break done trade calculation`,
          data: { skipped: true, reason: 'No DT files found' }
        };
      }
      
      console.log(`📊 Processing ${dtFiles.length} DT files...`);
      this.logMemoryUsage('Start processing');
      
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
      
      // Process files in batches for speed (Phase 3: 6 files at a time)
      const BATCH_SIZE = BATCH_SIZE_PHASE_3; // Phase 3: 6 files
      const MAX_CONCURRENT = MAX_CONCURRENT_REQUESTS_PHASE_3; // Phase 3: 3 concurrent
      const allResults: { success: boolean; dateSuffix: string; files: string[] }[] = [];
      let processed = 0;
      let successful = 0;
      
      for (let i = 0; i < dtFiles.length; i += BATCH_SIZE) {
        // Check memory before each batch
        const memUsage = process.memoryUsage();
        const usedMB = memUsage.heapUsed / 1024 / 1024;
        console.log(`🔍 Memory before batch ${Math.floor(i / BATCH_SIZE) + 1}: ${usedMB.toFixed(2)}MB`);
        
        // If memory usage is high, force cleanup
        if (usedMB > 10240) { // 10GB threshold (updated from 4GB for consistency)
          console.log(`⚠️ High memory usage detected: ${usedMB.toFixed(2)}MB, forcing cleanup before batch...`);
          if (global.gc) {
            for (let j = 0; j < 5; j++) {
              global.gc();
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
        }
        
        const batch = dtFiles.slice(i, i + BATCH_SIZE);
        const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
        console.log(`📦 Processing batch ${batchNumber}/${Math.ceil(dtFiles.length / BATCH_SIZE)} (${batch.length} files)`);
        
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
        
        // Additional memory cleanup
        await new Promise(resolve => setTimeout(resolve, 100)); // Give GC time to complete
        
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
        
        console.log(`📊 Batch complete: ${successful}/${processed} successful, ${progressTracker.processedStocks.toLocaleString()}/${totalStocks.toLocaleString()} stocks processed`);
        
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
      
      console.log(`✅ Break done trade data extraction completed!`);
      console.log(`📊 Processed: ${processed}/${dtFiles.length} DT files`);
      console.log(`📊 Successful: ${successful}/${processed} files`);
      console.log(`📊 Total output files: ${totalFiles}`);
      
      return {
        success: true,
        message: `Break done trade data generated successfully for ${successful}/${processed} DT files`,
        data: {
          totalDtFiles: dtFiles.length,
          processedFiles: processed,
          successfulFiles: successful,
          totalOutputFiles: totalFiles,
          results: allResults.filter(r => r.success)
        }
      };
      
    } catch (error) {
      console.error('Error generating break done trade data:', error);
      return {
        success: false,
        message: `Failed to generate break done trade data: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}

export default BreakDoneTradeCalculator;
