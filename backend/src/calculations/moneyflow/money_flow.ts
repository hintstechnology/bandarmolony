import { downloadText, uploadText, listPaths } from '../../utils/azureBlob';
import { stockCache } from '../../cache/stockCacheService';
import { indexCache } from '../../cache/indexCacheService';
import { BATCH_SIZE_PHASE_3, MAX_CONCURRENT_REQUESTS_PHASE_3 } from '../../services/dataUpdateService';

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

// Type definitions untuk Money Flow
interface OHLCData {
  Date: string;
  Open: number;
  High: number;
  Low: number;
  Close: number;
  Volume: number;
}

interface MoneyFlowData {
  Date: string;
  MFI: number;
}

export class MoneyFlowCalculator {
  constructor() {
    // No need for Azure client initialization - using azureBlob utility
  }

  /**
   * Load OHLC data from Azure Blob Storage
   */
  private async loadOHLCDataFromAzure(filename: string): Promise<OHLCData[]> {
    console.log(`Loading OHLC data from Azure: ${filename}`);
    
    try {
      // Use appropriate cache based on file path
      let content: string | null;
      if (filename.startsWith('stock/')) {
        content = await stockCache.getRawContent(filename);
      } else if (filename.startsWith('index/')) {
        content = await indexCache.getRawContent(filename);
      } else {
        // Fallback to direct download for unknown paths
        content = await downloadText(filename);
      }
      
      if (!content) {
        return [];
      }
      
      return this.parseOHLCData(content);
    } catch (error) {
      console.error(`Error loading OHLC data from Azure: ${filename}`, error);
      return [];
    }
  }

  /**
   * Parse OHLC data from CSV content
   */
  private parseOHLCData(content: string): OHLCData[] {
    const lines = content.trim().split('\n');
    const data: OHLCData[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      
      const values = line.split(',');
      if (values.length >= 6) {
        // Handle both stock and index formats
        const open = parseFloat(values[1]?.trim() || '0');
        const high = parseFloat(values[2]?.trim() || '0');
        const low = parseFloat(values[3]?.trim() || '0');
        const close = parseFloat(values[4]?.trim() || '0');
        const volume = parseFloat(values[5]?.trim() || '0');
        
        data.push({
          Date: values[0]?.trim() || '',
          Open: open,
          High: high,
          Low: low,
          Close: close,
          Volume: volume
        });
      }
    }
    
    // Sort by date ascending (oldest first) for proper MFI calculation
    data.sort((a, b) => {
      const dateA = a.Date || '';
      const dateB = b.Date || '';
      return dateA.localeCompare(dateB);
    });
    
    return data;
  }

  /**
   * Calculate Money Flow Index (MFI) for a given period
   */
  private calculateMFI(ohlcData: OHLCData[], period: number = 14): MoneyFlowData[] {
    console.log(`Calculating MFI with period ${period}...`);
    
    const mfiData: MoneyFlowData[] = [];
    
    for (let i = period - 1; i < ohlcData.length; i++) {
      let positiveMoneyFlow = 0;
      let negativeMoneyFlow = 0;
      
      // Calculate MFI for the last 'period' days
      for (let j = i - period + 1; j <= i; j++) {
        const current = ohlcData[j];
        const previous = ohlcData[j - 1];
        
        if (!current || !previous) continue;
        if (j === i - period + 1) continue; // Skip first day in period
        
        // Calculate Typical Price (TP)
        const currentTP = (current.High + current.Low + current.Close) / 3;
        const previousTP = (previous.High + previous.Low + previous.Close) / 3;
        
        // Calculate Raw Money Flow
        const rawMoneyFlow = currentTP * current.Volume;
        
        // Determine positive or negative money flow
        if (currentTP > previousTP) {
          positiveMoneyFlow += rawMoneyFlow;
        } else if (currentTP < previousTP) {
          negativeMoneyFlow += rawMoneyFlow;
        }
        // If TP is equal, no money flow is added
      }
      
      // Calculate Money Flow Ratio
      const moneyFlowRatio = negativeMoneyFlow === 0 ? 100 : positiveMoneyFlow / negativeMoneyFlow;
      
      // Calculate MFI
      const mfi = 100 - (100 / (1 + moneyFlowRatio));
      
      const currentData = ohlcData[i];
      if (currentData) {
        mfiData.push({
          Date: currentData.Date,
          MFI: Math.round(mfi * 100) / 100 // Round to 2 decimal places
        });
      }
    }
    
    console.log(`Calculated MFI for ${mfiData.length} periods`);
    return mfiData;
  }

  /**
   * Read existing CSV data from Azure
   */
  private async readExistingCsvDataFromAzure(filename: string): Promise<MoneyFlowData[]> {
    try {
      const content = await downloadText(filename);
    
      const lines = content.trim().split('\n');
      const data: MoneyFlowData[] = [];
      
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        
        const values = line.split(',');
        if (values.length >= 2) {
          data.push({
            Date: values[0]?.trim() || '',
            MFI: parseFloat(values[1]?.trim() || '0')
          });
        }
      }
      
      return data;
    } catch (error) {
      // Simplified error handling - just return empty array
      return [];
    }
  }

  /**
   * Merge existing data with new data and sort by date
   */
  private mergeMoneyFlowData(existingData: MoneyFlowData[], newData: MoneyFlowData[]): MoneyFlowData[] {
    // Create a map to avoid duplicates
    const dataMap = new Map<string, MoneyFlowData>();
    
    // Add existing data
    existingData.forEach(item => {
      dataMap.set(item.Date, item);
    });
    
    // Add/update with new data
    newData.forEach(item => {
      dataMap.set(item.Date, item);
    });
    
    // Convert back to array and sort by date (oldest first) - same as original file
    const mergedData = Array.from(dataMap.values());
    mergedData.sort((a, b) => {
      const dateA = a.Date || '';
      const dateB = b.Date || '';
      return dateA.localeCompare(dateB);
    });
    
    return mergedData;
  }

  /**
   * Save data to Azure Blob Storage
   */
  private async saveToAzure(filename: string, data: MoneyFlowData[]): Promise<void> {
    if (data.length === 0) {
      console.log(`No data to save for ${filename}`);
      return;
    }
    
    // Convert to CSV format
    const headers = ['Date', 'MFI'];
    const csvContent = [
      headers.join(','),
      ...data.map(row => [row.Date, row.MFI].join(','))
    ].join('\n');
    
    await uploadText(filename, csvContent, 'text/csv');
    console.log(`Saved ${data.length} records to ${filename}`);
  }


  // Removed unused functions - using processAllFiles instead

  /**
   * Create or update individual CSV files for each stock/index's money flow data
   * Using subfolder structure: money_flow/stock/{code}.csv and money_flow/index/{code}.csv
   */
  private async createMoneyFlowCsvFiles(
    moneyFlowData: Map<string, { code: string; type: 'stock' | 'index'; mfiData: MoneyFlowData[] }>
  ): Promise<string[]> {
    console.log("\nCreating/updating individual CSV files for each stock/index's money flow...");
    
    const createdFiles: string[] = [];
    let stockCount = 0;
    let indexCount = 0;
    
    for (const [_key, { code, type, mfiData: flowData }] of moneyFlowData) {
      // Use subfolder structure: money_flow/{type}/{code}.csv
      const filename = `money_flow/${type}/${code}.csv`;
      
      console.log(`📁 Processing ${code} -> ${code}.csv (${type.toUpperCase()})`);
      
      try {
        // Check if file already exists (simplified error handling)
        const existingData = await this.readExistingCsvDataFromAzure(filename);
        
        if (existingData.length > 0) {
          console.log(`📝 Updating existing file: ${filename}`);
          
          // Merge with new data
          const mergedData = this.mergeMoneyFlowData(existingData, flowData);
          
          // Sort by date descending (newest first)
          const sortedData = this.sortMoneyFlowDataByDate(mergedData);
          
          // Save merged and sorted data
          await this.saveToAzure(filename, sortedData);
          console.log(`✅ Updated ${filename} with ${sortedData.length} total trading days`);
        } else {
          console.log(`📄 Creating new file: ${filename}`);
          
          // Sort new data by date descending (newest first)
          const sortedData = this.sortMoneyFlowDataByDate(flowData);
          
          await this.saveToAzure(filename, sortedData);
          console.log(`✅ Created ${filename} with ${sortedData.length} trading days`);
        }
        
        // Track counts
        if (type === 'stock') {
          stockCount++;
        } else {
          indexCount++;
        }
      } catch (error) {
        // Simplified error handling - just log and continue
        console.log(`📄 File not found, creating new: ${filename}`);
        
        // Sort new data by date descending (newest first)
        const sortedData = this.sortMoneyFlowDataByDate(flowData);
        
        await this.saveToAzure(filename, sortedData);
        console.log(`✅ Created ${filename} with ${sortedData.length} trading days`);
        
        // Track counts
        if (type === 'stock') {
          stockCount++;
        } else {
          indexCount++;
        }
      }
      
      createdFiles.push(filename);
    }
    
    console.log(`\n📊 Processed ${createdFiles.length} money flow CSV files total:`);
    console.log(`   - 📈 ${stockCount} stock files in money_flow/stock/`);
    console.log(`   - 📊 ${indexCount} index files in money_flow/index/`);
    return createdFiles;
  }

  /**
   * Sort money flow data by date descending (newest first)
   */
  private sortMoneyFlowDataByDate(data: MoneyFlowData[]): MoneyFlowData[] {
    return data.sort((a, b) => {
      // Parse dates and compare (newest first)
      const dateA = a.Date || '';
      const dateB = b.Date || '';
      return dateB.localeCompare(dateA);
    });
  }

  /**
   * Find all CSV files in a directory (like rrc_stock.ts)
   * OPTIMIZED: Added retry logic for Azure network errors
   */
  private async findAllCsvFiles(prefix: string): Promise<string[]> {
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const files = await listPaths({ prefix });
        const csvFiles = files.filter(f => f.toLowerCase().endsWith('.csv'));
        return csvFiles;
      } catch (err: any) {
        const isRetryable = 
          err?.code === 'PARSE_ERROR' ||
          err?.name === 'RestError' ||
          (err?.message && err.message.includes('aborted'));
        
        if (!isRetryable || attempt === maxRetries) {
          throw new Error(`Tidak bisa baca folder ${prefix}: ${err}`);
        }
        
        const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        console.log(`⚠️ Retry ${attempt}/${maxRetries} for listPaths(${prefix}) after ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
    return [];
  }

  /**
   * Extract stock code from file path (handles stock/{sector}/{code}.csv and index/{code}.csv)
   */
  private extractStockCode(filePath: string): string {
    // Handle structure: stock/{sector}/{code}.csv or index/{code}.csv
    const pathParts = filePath.split('/');
    const fileName = pathParts[pathParts.length - 1]?.replace('.csv', '') || '';
    return fileName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  }

  /**
   * Load index list from csv_input/index_list.csv (for validation/logging only)
   */
  private async loadIndexList(): Promise<string[]> {
    try {
      const content = await downloadText('csv_input/index_list.csv');
      const lines = content.trim().split('\n');
      const indexList: string[] = [];
      
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line || line.trim().length === 0) continue;
        
        const values = line.split(',');
        if (values.length > 0 && values[0]?.trim()) {
          indexList.push(values[0].trim().toUpperCase());
        }
      }
      
      console.log(`📋 Loaded ${indexList.length} index codes from csv_input/index_list.csv`);
      console.log(`📋 Index list: ${indexList.join(', ')}`);
      return indexList;
    } catch (error) {
      console.error('⚠️ Error loading index list:', error);
      console.log('⚠️ Continuing without index list validation (using source folder only)');
      return [];
    }
  }

  /**
   * Extract existing dates from existing CSV data
   */
  private extractExistingDates(existingData: MoneyFlowData[]): Set<string> {
    const dates = new Set<string>();
    existingData.forEach(item => dates.add(item.Date));
    return dates;
  }

  /**
   * Load existing dates for all stocks/indices from output files
   * OPTIMIZED: Quick check - only load 1 representative file (BBCA.csv for stock, JCI.csv for index) for speed
   */
  private async loadExistingDatesByStock(): Promise<Map<string, Set<string>>> {
    console.log("📋 Loading existing dates from money_flow output files (quick check - 1 file per type only)...");
    const existingDatesByStock = new Map<string, Set<string>>();
    
    try {
      // OPTIMIZATION: Only check 1 representative file per type for speed
      const representativeStockFile = 'money_flow/stock/BBCA.csv';
      const representativeIndexFile = 'money_flow/index/JCI.csv';
      
      // Check stock representative file
      try {
        const stockData = await this.readExistingCsvDataFromAzure(representativeStockFile);
        const stockDates = this.extractExistingDates(stockData);
        if (stockDates.size > 0) {
          existingDatesByStock.set('stock:BBCA', stockDates);
          console.log(`✅ Quick check: Loaded ${stockDates.size} existing dates from ${representativeStockFile} (representative for all stocks)`);
        } else {
          console.log(`⚠️ Quick check: ${representativeStockFile} exists but has no dates`);
        }
      } catch (error: any) {
        // File not found is normal for new files
        if (error instanceof Error && error.message.includes('Blob not found')) {
          console.log(`ℹ️ Quick check: ${representativeStockFile} not found - assuming no existing dates for stocks`);
        } else {
          console.log(`⚠️ Quick check: Could not load ${representativeStockFile}, assuming no existing dates for stocks`);
        }
      }
      
      // Check index representative file
      try {
        const indexData = await this.readExistingCsvDataFromAzure(representativeIndexFile);
        const indexDates = this.extractExistingDates(indexData);
        if (indexDates.size > 0) {
          existingDatesByStock.set('index:JCI', indexDates);
          console.log(`✅ Quick check: Loaded ${indexDates.size} existing dates from ${representativeIndexFile} (representative for all indices)`);
        } else {
          console.log(`⚠️ Quick check: ${representativeIndexFile} exists but has no dates`);
        }
      } catch (error: any) {
        // File not found is normal for new files
        if (error instanceof Error && error.message.includes('Blob not found')) {
          console.log(`ℹ️ Quick check: ${representativeIndexFile} not found - assuming no existing dates for indices`);
        } else {
          console.log(`⚠️ Quick check: Could not load ${representativeIndexFile}, assuming no existing dates for indices`);
        }
      }
      
      return existingDatesByStock;
    } catch (error) {
      console.error('Error loading existing dates:', error);
      return existingDatesByStock; // Return empty map if error
    }
  }

  /**
   * Filter OHLC data to only include dates that don't exist in output
   * OPTIMIZED: Only calculate MFI for new dates
   */
  private filterOHLCDataForNewDates(ohlcData: OHLCData[], existingDates: Set<string>): OHLCData[] {
    if (existingDates.size === 0) {
      return ohlcData; // No existing dates, process all
    }
    
    // Find the last existing date to determine cutoff
    const sortedExistingDates = Array.from(existingDates).sort((a, b) => b.localeCompare(a));
    const lastExistingDate = sortedExistingDates[0];
    
    // Safety check: if no last existing date found, process all
    if (!lastExistingDate) {
      return ohlcData;
    }
    
    // Filter to only include dates after last existing date
    const filteredData = ohlcData.filter(item => {
      if (!item.Date) return false; // Skip items without date
      return item.Date.localeCompare(lastExistingDate) > 0;
    });
    
    if (filteredData.length < ohlcData.length) {
      console.log(`🔍 Filtered ${ohlcData.length - filteredData.length} dates (already exist), processing ${filteredData.length} new dates`);
    }
    
    return filteredData;
  }

  /**
   * Process all files (both stock and index) separately to avoid mixing
   * OPTIMIZED: Only process dates that don't exist in output
   * Returns Map with composite key: "type:code" to preserve source folder info
   */
  private async processAllFiles(_indexList: string[], existingDatesByStock: Map<string, Set<string>>, logId?: string | null): Promise<Map<string, { code: string; type: 'stock' | 'index'; mfiData: MoneyFlowData[] }>> {
    console.log("\nProcessing all files (stock and index) separately...");
    
    const moneyFlowData = new Map<string, { code: string; type: 'stock' | 'index'; mfiData: MoneyFlowData[] }>();
    const BATCH_SIZE = BATCH_SIZE_PHASE_3; // Phase 3: 6 files at a time
    const MAX_CONCURRENT = MAX_CONCURRENT_REQUESTS_PHASE_3; // Phase 3: 3 concurrent
    
    // Process stock files first
    console.log("\n📈 Processing STOCK files...");
    const allStockFiles = await this.findAllCsvFiles('stock/');
    console.log(`Found ${allStockFiles.length} stock files`);
    
    // CRITICAL: Don't add active files before processing - add only when file needs processing
    const activeFiles: string[] = [];
    
    let processed = 0;
    for (let i = 0; i < allStockFiles.length; i += BATCH_SIZE) {
      const batch = allStockFiles.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      console.log(`📦 Processing stock batch ${batchNumber}/${Math.ceil(allStockFiles.length / BATCH_SIZE)} (${batch.length} files)`);
        
        // Update progress before batch (use processed count, not batch index)
        if (logId) {
          const { SchedulerLogService } = await import('../../services/schedulerLogService');
          await SchedulerLogService.updateLog(logId, {
            progress_percentage: Math.round((processed / allStockFiles.length) * 50), // First 50% for stocks
            current_processing: `Processing stock batch ${batchNumber}/${Math.ceil(allStockFiles.length / BATCH_SIZE)} (${processed}/${allStockFiles.length} stocks)`
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
      
      // Process batch in parallel with concurrency limit 25
      const batchPromises = batch.map(async (blobName) => {
          const code = this.extractStockCode(blobName);
          const key = `stock:${code}`;
          
          try {
            // OPTIMIZATION: Quick check - use representative file (BBCA for stocks) to check if file needs processing
            // If representative file has many dates and latest is recent, assume all stocks are up to date
            const representativeKey = 'stock:BBCA';
            const representativeDates = existingDatesByStock.get(representativeKey);
            
            if (representativeDates && representativeDates.size > 0) {
              const sortedExistingDates = Array.from(representativeDates).sort((a, b) => b.localeCompare(a));
              const latestExistingDate = sortedExistingDates[0];
              
              if (latestExistingDate) {
                // Parse date (format: YYYYMMDD or YYYY-MM-DD)
                let latestDate: Date;
                if (latestExistingDate.includes('-')) {
                  latestDate = new Date(latestExistingDate);
                } else {
                  latestDate = new Date(
                    parseInt(latestExistingDate.substring(0, 4)),
                    parseInt(latestExistingDate.substring(4, 6)) - 1,
                    parseInt(latestExistingDate.substring(6, 8))
                  );
                }
                
                const daysSinceLatest = (Date.now() - latestDate.getTime()) / (1000 * 60 * 60 * 24);
                
                // If representative file has many dates and latest is within last 7 days, likely all stocks are up to date
                if (representativeDates.size > 100 && daysSinceLatest < 7) {
                  // Skip file without loading - assume all dates already exist
                  return { code, mfiData: [], success: false, error: 'All dates likely already exist (skipped without load)', type: 'stock' as const, skipped: true };
                }
              }
            }
            
            // Use stock-specific existing dates if available, otherwise use representative
            const stockExistingDates = existingDatesByStock.get(key) || representativeDates || new Set<string>();
            
            // File might need processing - add to active files and load with cache
            if (!activeFiles.includes(blobName)) {
              stockCache.addActiveProcessingFile(blobName);
              activeFiles.push(blobName);
            }
            
            // Load with cache for actual processing
            const ohlcData = await this.loadOHLCDataFromAzure(blobName);
            
            // OPTIMIZATION: Filter to only new dates (use stock-specific or representative dates)
            const filteredOHLC = this.filterOHLCDataForNewDates(ohlcData, stockExistingDates);
            
            if (filteredOHLC.length === 0) {
              // No new dates - remove from cache since we don't need it
              stockCache.removeActiveProcessingFile(blobName);
              return { code, mfiData: [], success: false, error: 'No new dates to process', type: 'stock' as const, skipped: true };
            }
            
            // Calculate MFI only for new dates (but need full OHLC for proper calculation)
            // We need to calculate from the beginning to get proper MFI values
            // So we'll filter AFTER calculation
            const allMfiData = this.calculateMFI(ohlcData);
            
            // Filter MFI data to only include new dates (use stock-specific or representative dates)
            const newMfiData = allMfiData.filter(item => !stockExistingDates.has(item.Date));
            
            if (newMfiData.length > 0) {
              return { code, mfiData: newMfiData, success: true, type: 'stock' as const };
            }
            return { code, mfiData: [], success: false, error: 'No new MFI data', type: 'stock' as const, skipped: true };
          } catch (error) {
            console.error(`Error processing stock ${blobName}:`, error);
            return { code, mfiData: [], success: false, error: error instanceof Error ? error.message : 'Unknown error', type: 'stock' as const };
          }
        });
      const batchResults = await limitConcurrency(batchPromises, MAX_CONCURRENT);
      
      // Process batch results
      let batchSuccess = 0;
      let batchFailed = 0;
      let batchSkipped = 0;
      
      batchResults.forEach((result) => {
        if (result) {
          const { code, mfiData, success, type, skipped } = result;
          if (success && mfiData.length > 0) {
            // Use composite key to avoid collision
            const key = `stock:${code}`;
            moneyFlowData.set(key, { code, type, mfiData });
            batchSuccess++;
          } else if (skipped) {
            batchSkipped++;
          } else {
            batchFailed++;
          }
        } else {
          batchFailed++;
        }
        processed++;
      });
      
      console.log(`📊 Stock batch ${batchNumber} complete: ✅ ${batchSuccess} success, ⏭️  ${batchSkipped} skipped (no new dates), ❌ ${batchFailed} failed (${processed}/${allStockFiles.length} total)`);
      
      // Update progress after batch
      if (logId) {
        const { SchedulerLogService } = await import('../../services/schedulerLogService');
        await SchedulerLogService.updateLog(logId, {
          progress_percentage: Math.round((processed / allStockFiles.length) * 50), // First 50% for stocks
          current_processing: `Completed stock batch ${batchNumber}/${Math.ceil(allStockFiles.length / BATCH_SIZE)} (${processed}/${allStockFiles.length} stocks)`
        });
      }
      
      // Memory cleanup after batch
      if (global.gc) {
        global.gc();
        const memAfter = process.memoryUsage();
        const heapUsedMB = memAfter.heapUsed / 1024 / 1024;
        console.log(`📊 Stock batch ${batchNumber} complete - Memory: ${heapUsedMB.toFixed(2)}MB`);
      }
      
      // Small delay to allow GC to complete
      if (i + BATCH_SIZE < allStockFiles.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    // Process index files second
    console.log("\n📊 Processing INDEX files...");
    const allIndexFiles = await this.findAllCsvFiles('index/');
    console.log(`Found ${allIndexFiles.length} index files`);
    
    // CRITICAL: Don't add active files before processing - add only when file needs processing
    processed = 0;
    for (let i = 0; i < allIndexFiles.length; i += BATCH_SIZE) {
      const batch = allIndexFiles.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      console.log(`📦 Processing index batch ${batchNumber}/${Math.ceil(allIndexFiles.length / BATCH_SIZE)} (${batch.length} files)`);
      
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
      
      // Process batch in parallel with concurrency limit 25
      const batchPromises = batch.map(async (blobName) => {
          const code = this.extractStockCode(blobName);
          const key = `index:${code}`;
          
          try {
            // OPTIMIZATION: Quick check - use representative file (JCI for indices) to check if file needs processing
            // If representative file has many dates and latest is recent, assume all indices are up to date
            const representativeKey = 'index:JCI';
            const representativeDates = existingDatesByStock.get(representativeKey);
            
            if (representativeDates && representativeDates.size > 0) {
              const sortedExistingDates = Array.from(representativeDates).sort((a, b) => b.localeCompare(a));
              const latestExistingDate = sortedExistingDates[0];
              
              if (latestExistingDate) {
                // Parse date (format: YYYYMMDD or YYYY-MM-DD)
                let latestDate: Date;
                if (latestExistingDate.includes('-')) {
                  latestDate = new Date(latestExistingDate);
                } else {
                  latestDate = new Date(
                    parseInt(latestExistingDate.substring(0, 4)),
                    parseInt(latestExistingDate.substring(4, 6)) - 1,
                    parseInt(latestExistingDate.substring(6, 8))
                  );
                }
                
                const daysSinceLatest = (Date.now() - latestDate.getTime()) / (1000 * 60 * 60 * 24);
                
                // If representative file has many dates and latest is within last 7 days, likely all indices are up to date
                if (representativeDates.size > 100 && daysSinceLatest < 7) {
                  // Skip file without loading - assume all dates already exist
                  return { code, mfiData: [], success: false, error: 'All dates likely already exist (skipped without load)', type: 'index' as const, skipped: true };
                }
              }
            }
            
            // Use index-specific existing dates if available, otherwise use representative
            const indexExistingDates = existingDatesByStock.get(key) || representativeDates || new Set<string>();
            
            // File might need processing - add to active files and load with cache
            if (!activeFiles.includes(blobName)) {
              indexCache.addActiveProcessingFile(blobName);
              activeFiles.push(blobName);
            }
            
            // Load with cache for actual processing
            const ohlcData = await this.loadOHLCDataFromAzure(blobName);
            
            // OPTIMIZATION: Filter to only new dates (use index-specific or representative dates)
            const filteredOHLC = this.filterOHLCDataForNewDates(ohlcData, indexExistingDates);
            
            if (filteredOHLC.length === 0) {
              // No new dates - remove from cache since we don't need it
              indexCache.removeActiveProcessingFile(blobName);
              return { code, mfiData: [], success: false, error: 'No new dates to process', type: 'index' as const, skipped: true };
            }
            
            // Calculate MFI only for new dates (but need full OHLC for proper calculation)
            // We need to calculate from the beginning to get proper MFI values
            // So we'll filter AFTER calculation
            const allMfiData = this.calculateMFI(ohlcData);
            
            // Filter MFI data to only include new dates (use index-specific or representative dates)
            const newMfiData = allMfiData.filter(item => !indexExistingDates.has(item.Date));
            
            if (newMfiData.length > 0) {
              return { code, mfiData: newMfiData, success: true, type: 'index' as const };
            }
            return { code, mfiData: [], success: false, error: 'No new MFI data', type: 'index' as const, skipped: true };
          } catch (error) {
            console.error(`Error processing index ${blobName}:`, error);
            return { code, mfiData: [], success: false, error: error instanceof Error ? error.message : 'Unknown error', type: 'index' as const };
          }
        });
      const batchResults = await limitConcurrency(batchPromises, MAX_CONCURRENT);
      
      // Process batch results
      let batchSuccess = 0;
      let batchFailed = 0;
      
      let batchSkipped = 0;
      batchResults.forEach((result) => {
        if (result) {
          const { code, mfiData, success, type, skipped } = result;
          if (success && mfiData.length > 0) {
            // Use composite key to avoid collision
            const key = `index:${code}`;
            moneyFlowData.set(key, { code, type, mfiData });
            batchSuccess++;
          } else if (skipped) {
            batchSkipped++;
          } else {
            batchFailed++;
          }
        } else {
          batchFailed++;
        }
        processed++;
      });
      
      console.log(`📊 Index batch ${batchNumber} complete: ✅ ${batchSuccess} success, ⏭️  ${batchSkipped} skipped (no new dates), ❌ ${batchFailed} failed (${processed}/${allIndexFiles.length} total)`);
      
      // Update progress after batch
      if (logId) {
        const { SchedulerLogService } = await import('../../services/schedulerLogService');
        await SchedulerLogService.updateLog(logId, {
          progress_percentage: 50 + Math.round((processed / allIndexFiles.length) * 50), // Second 50% for indices
          current_processing: `Completed index batch ${batchNumber}/${Math.ceil(allIndexFiles.length / BATCH_SIZE)} (${processed}/${allIndexFiles.length} indices)`
        });
      }
      
      // Memory cleanup after batch
      if (global.gc) {
        global.gc();
        const memAfter = process.memoryUsage();
        const heapUsedMB = memAfter.heapUsed / 1024 / 1024;
        console.log(`📊 Index batch ${batchNumber} complete - Memory: ${heapUsedMB.toFixed(2)}MB`);
      }
      
      // Small delay to allow GC to complete
      if (i + BATCH_SIZE < allIndexFiles.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    console.log(`\nProcessed ${moneyFlowData.size} files successfully (${allStockFiles.length} stocks + ${allIndexFiles.length} indices)`);
    
    // Return active files untuk cleanup di generateMoneyFlowData
    // Note: activeFiles sudah di-set di awal fungsi ini
    return moneyFlowData;
  }

  /**
   * Get latest date from existing output files to limit processing
   * OPTIMIZATION: Only process files that might have dates newer than latest existing
   */
  private async getLatestExistingDate(existingDatesByStock: Map<string, Set<string>>): Promise<string | null> {
    let latestDate: string | null = null;
    
    for (const dates of existingDatesByStock.values()) {
      if (dates.size > 0) {
        const sortedDates = Array.from(dates).sort((a, b) => b.localeCompare(a));
        const currentLatest = sortedDates[0];
        if (currentLatest && (!latestDate || currentLatest.localeCompare(latestDate) > 0)) {
          latestDate = currentLatest;
        }
      }
    }
    
    return latestDate;
  }

  /**
   * Main function to generate money flow data
   * OPTIMIZED: Pre-load existing dates to skip already processed dates
   */
  public async generateMoneyFlowData(dateSuffix: string, logId?: string | null): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      console.log(`Starting money flow data extraction for date: ${dateSuffix}`);
      
      // OPTIMIZATION: Pre-load existing dates from output files
      const existingDatesByStock = await this.loadExistingDatesByStock();
      
      // Get latest existing date to determine cutoff
      const latestExistingDate = await this.getLatestExistingDate(existingDatesByStock);
      if (latestExistingDate) {
        console.log(`📅 Latest existing date in output: ${latestExistingDate}`);
      }
      
      // Load index list first (for reference/validation only, source folder is authoritative)
      const indexList = await this.loadIndexList();
      console.log(`📋 Index list loaded: ${indexList.length} indices`);
      
      // Process ALL files (both stock and index) - type preserved from source folder
      // OPTIMIZED: Only process dates that don't exist in output
      // Note: processAllFiles akan set active files untuk semua file yang diproses
      const allMoneyFlowData = await this.processAllFiles(indexList, existingDatesByStock, logId);
      
      // Create or update individual CSV files (type from source folder)
      const createdFiles = await this.createMoneyFlowCsvFiles(allMoneyFlowData);
      
      console.log("✅ Money flow data extraction completed successfully!");
      
      // Count by type
      let stockFiles = 0;
      let indexFiles = 0;
      for (const [_key, { type }] of allMoneyFlowData) {
        if (type === 'stock') stockFiles++;
        else indexFiles++;
      }
      
      return {
        success: true,
        message: `Money flow data generated successfully for ${dateSuffix}`,
        data: {
          date: dateSuffix,
          totalFilesProcessed: allMoneyFlowData.size,
          stockFilesProcessed: stockFiles,
          indexFilesProcessed: indexFiles,
          outputFiles: createdFiles
        }
      };
      
    } catch (error) {
      console.error('❌ Error generating money flow data:', error);
      return {
        success: false,
        message: `Failed to generate money flow data: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    } finally {
      // Cleanup: Remove active processing files setelah selesai
      // Note: processAllFiles sudah set active files, jadi kita perlu cleanup semua
      // Kita bisa get dari cache service atau cleanup manual
      // Untuk sekarang, kita cleanup semua active files dari cache
      const activeStockFiles = stockCache.getActiveProcessingFiles();
      const activeIndexFiles = indexCache.getActiveProcessingFiles();
      
      for (const file of activeStockFiles) {
        stockCache.removeActiveProcessingFile(file);
      }
      for (const file of activeIndexFiles) {
        indexCache.removeActiveProcessingFile(file);
      }
      
      if (activeStockFiles.length > 0 || activeIndexFiles.length > 0) {
        console.log(`🧹 Cleaned up ${activeStockFiles.length} stock files and ${activeIndexFiles.length} index files from cache`);
      }
    }
  }
}

export default MoneyFlowCalculator;
