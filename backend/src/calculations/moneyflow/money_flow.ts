import { downloadText, uploadText, listPaths } from '../../utils/azureBlob';

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
      const content = await downloadText(filename);
    
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
    data.sort((a, b) => a.Date.localeCompare(b.Date));
    console.log(`Loaded ${data.length} OHLC records from ${filename}`);
    return data;
    } catch (error) {
      console.error(`Error loading OHLC data from ${filename}:`, error);
      return [];
    }
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
    
    // Convert back to array and sort by date (oldest first)
    const mergedData = Array.from(dataMap.values());
    mergedData.sort((a, b) => a.Date.localeCompare(b.Date));
    
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
   * Using accurate classification based on source folder (preserved from input)
   */
  private async createMoneyFlowCsvFiles(
    moneyFlowData: Map<string, { code: string; type: 'stock' | 'index'; mfiData: MoneyFlowData[] }>
  ): Promise<string[]> {
    console.log("\nCreating/updating individual CSV files for each stock/index's money flow...");
    
    const createdFiles: string[] = [];
    let stockCount = 0;
    let indexCount = 0;
    
    for (const [_key, { code, type, mfiData: flowData }] of moneyFlowData) {
      // Use type from source folder directly (no guessing!)
      const subfolder = type; // 'stock' or 'index'
      const filename = `money_flow/${subfolder}/${code}.csv`;
      
      console.log(`📁 Processing ${code} -> ${subfolder}/${code}.csv (${type.toUpperCase()})`);
      
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
      const dateA = new Date(a.Date);
      const dateB = new Date(b.Date);
      return dateB.getTime() - dateA.getTime();
    });
  }

  /**
   * Find all CSV files in a directory (like rrc_stock.ts)
   */
  private async findAllCsvFiles(prefix: string): Promise<string[]> {
    try {
      const files = await listPaths({ prefix });
      const csvFiles = files.filter(f => f.toLowerCase().endsWith('.csv'));
      return csvFiles;
    } catch (err) {
      throw new Error(`Tidak bisa baca folder ${prefix}: ${err}`);
    }
  }

  /**
   * Extract stock code from file path (like rrc_stock.ts)
   */
  private extractStockCode(filePath: string): string {
    const fileName = filePath.split('/').pop()?.replace('.csv', '') || '';
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
   * Process all files (both stock and index) separately to avoid mixing
   * Returns Map with composite key: "type:code" to preserve source folder info
   */
  private async processAllFiles(_indexList: string[]): Promise<Map<string, { code: string; type: 'stock' | 'index'; mfiData: MoneyFlowData[] }>> {
    console.log("\nProcessing all files (stock and index) separately...");
    
    const moneyFlowData = new Map<string, { code: string; type: 'stock' | 'index'; mfiData: MoneyFlowData[] }>();
    const BATCH_SIZE = 10; // Reduced from 25 to prevent memory issues
    
    // Process stock files first
    console.log("\n📈 Processing STOCK files...");
    const allStockFiles = await this.findAllCsvFiles('stock/');
    console.log(`Found ${allStockFiles.length} stock files`);
    
    let processed = 0;
    for (let i = 0; i < allStockFiles.length; i += BATCH_SIZE) {
      const batch = allStockFiles.slice(i, i + BATCH_SIZE);
      console.log(`📦 Processing stock batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(allStockFiles.length / BATCH_SIZE)} (${batch.length} files)`);
      
      // Process batch in parallel
      const batchResults = await Promise.allSettled(
        batch.map(async (blobName) => {
          const code = this.extractStockCode(blobName);
          
          try {
            const ohlcData = await this.loadOHLCDataFromAzure(blobName);
            const mfiData = this.calculateMFI(ohlcData);
            
            if (mfiData.length > 0) {
              return { code, mfiData, success: true, type: 'stock' as const };
            }
            return { code, mfiData: [], success: false, error: 'No MFI data', type: 'stock' as const };
          } catch (error) {
            console.error(`Error processing stock ${blobName}:`, error);
            return { code, mfiData: [], success: false, error: error instanceof Error ? error.message : 'Unknown error', type: 'stock' as const };
          }
        })
      );
      
      // Process batch results
      let batchSuccess = 0;
      let batchFailed = 0;
      
      batchResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          const { code, mfiData, success, type } = result.value;
          if (success && mfiData.length > 0) {
            // Use composite key to avoid collision
            const key = `stock:${code}`;
            moneyFlowData.set(key, { code, type, mfiData });
            batchSuccess++;
          } else {
            batchFailed++;
          }
        } else {
          batchFailed++;
        }
        processed++;
      });
      
      console.log(`📊 Stock batch complete: ✅ ${batchSuccess} success, ❌ ${batchFailed} failed (${processed}/${allStockFiles.length} total)`);
      
      // Force garbage collection after each batch
      if (global.gc) {
        global.gc();
      }
      
      // Small delay to allow GC to complete
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Process index files second
    console.log("\n📊 Processing INDEX files...");
    const allIndexFiles = await this.findAllCsvFiles('index/');
    console.log(`Found ${allIndexFiles.length} index files`);
    
    processed = 0;
    for (let i = 0; i < allIndexFiles.length; i += BATCH_SIZE) {
      const batch = allIndexFiles.slice(i, i + BATCH_SIZE);
      console.log(`📦 Processing index batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(allIndexFiles.length / BATCH_SIZE)} (${batch.length} files)`);
      
      // Process batch in parallel
      const batchResults = await Promise.allSettled(
        batch.map(async (blobName) => {
          const code = this.extractStockCode(blobName);
          
          try {
            const ohlcData = await this.loadOHLCDataFromAzure(blobName);
            const mfiData = this.calculateMFI(ohlcData);
            
            if (mfiData.length > 0) {
              return { code, mfiData, success: true, type: 'index' as const };
            }
            return { code, mfiData: [], success: false, error: 'No MFI data', type: 'index' as const };
          } catch (error) {
            console.error(`Error processing index ${blobName}:`, error);
            return { code, mfiData: [], success: false, error: error instanceof Error ? error.message : 'Unknown error', type: 'index' as const };
          }
        })
      );
      
      // Process batch results
      let batchSuccess = 0;
      let batchFailed = 0;
      
      batchResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          const { code, mfiData, success, type } = result.value;
          if (success && mfiData.length > 0) {
            // Use composite key to avoid collision
            const key = `index:${code}`;
            moneyFlowData.set(key, { code, type, mfiData });
            batchSuccess++;
          } else {
            batchFailed++;
          }
        } else {
          batchFailed++;
        }
        processed++;
      });
      
      console.log(`📊 Index batch complete: ✅ ${batchSuccess} success, ❌ ${batchFailed} failed (${processed}/${allIndexFiles.length} total)`);
      
      // Force garbage collection after each batch
      if (global.gc) {
        global.gc();
      }
      
      // Small delay to allow GC to complete
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`\nProcessed ${moneyFlowData.size} files successfully (${allStockFiles.length} stocks + ${allIndexFiles.length} indices)`);
    return moneyFlowData;
  }

  /**
   * Main function to generate money flow data
   */
  public async generateMoneyFlowData(dateSuffix: string): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      console.log(`Starting money flow data extraction for date: ${dateSuffix}`);
      
      // Load index list first (for reference/validation only, source folder is authoritative)
      const indexList = await this.loadIndexList();
      console.log(`📋 Index list loaded: ${indexList.length} indices`);
      
      // Process ALL files (both stock and index) - type preserved from source folder
      const allMoneyFlowData = await this.processAllFiles(indexList);
      
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
    }
  }
}

export default MoneyFlowCalculator;
