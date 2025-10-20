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
      console.error(`Error reading existing CSV data from ${filename}:`, error);
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


  /**
   * Process all stock files with batch processing
   */
  private async processStockFiles(): Promise<Map<string, MoneyFlowData[]>> {
    console.log("\nProcessing stock files...");
    
    const blobs = await listPaths({ prefix: 'stock/' });
    const csvBlobs = blobs.filter(blobName => blobName.endsWith('.csv'));
    
    // Filter out sector files - only process individual stock files (4-character codes)
    const stockBlobs = csvBlobs.filter(blobName => {
      const fileName = blobName.split('/')[1]?.replace('.csv', '') || '';
      // Only process files that are 4-character stock codes (not sector names)
      return fileName.length === 4 && /^[A-Z]{4}$/.test(fileName);
    });
    
    console.log(`Found ${csvBlobs.length} total files, ${stockBlobs.length} individual stock files to process`);
    
    const moneyFlowData = new Map<string, MoneyFlowData[]>();
    const BATCH_SIZE = 25; // Process 25 stocks at a time
    let processed = 0;
    
    for (let i = 0; i < stockBlobs.length; i += BATCH_SIZE) {
      const batch = stockBlobs.slice(i, i + BATCH_SIZE);
      console.log(`📦 Processing stock batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(stockBlobs.length / BATCH_SIZE)} (${batch.length} files)`);
      
      // Process batch in parallel
      const batchResults = await Promise.allSettled(
        batch.map(async (blobName) => {
          const stockCode = blobName.split('/')[1]?.replace('.csv', '') || '';
          
          try {
            const ohlcData = await this.loadOHLCDataFromAzure(blobName);
            const mfiData = this.calculateMFI(ohlcData);
            
            if (mfiData.length > 0) {
              return { stockCode, mfiData, success: true };
            }
            return { stockCode, mfiData: [], success: false, error: 'No MFI data' };
          } catch (error) {
            console.error(`Error processing ${blobName}:`, error);
            return { stockCode, mfiData: [], success: false, error: error instanceof Error ? error.message : 'Unknown error' };
          }
        })
      );
      
      // Process batch results
      let batchSuccess = 0;
      let batchFailed = 0;
      
      batchResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          const { stockCode, mfiData, success } = result.value;
          if (success && mfiData.length > 0) {
            moneyFlowData.set(stockCode, mfiData);
            batchSuccess++;
          } else {
            batchFailed++;
          }
        } else {
          batchFailed++;
        }
      });
      
      processed += batch.length;
      console.log(`📦 Batch complete: ✅ ${batchSuccess} success, ❌ ${batchFailed} failed (${processed}/${stockBlobs.length} total)`);
      
      // Small delay to give event loop breathing room
      if (i + BATCH_SIZE < stockBlobs.length) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    
    console.log(`Processed ${moneyFlowData.size} stock files successfully`);
    return moneyFlowData;
  }

  /**
   * Process all index files with batch processing
   */
  private async processIndexFiles(): Promise<Map<string, MoneyFlowData[]>> {
    console.log("\nProcessing index files...");
    
    const blobs = await listPaths({ prefix: 'index/' });
    const csvBlobs = blobs.filter(blobName => blobName.endsWith('.csv'));
    
    console.log(`Found ${csvBlobs.length} index files to process`);
    
    const moneyFlowData = new Map<string, MoneyFlowData[]>();
    const BATCH_SIZE = 10; // Process 10 indexes at a time
    let processed = 0;
    
    for (let i = 0; i < csvBlobs.length; i += BATCH_SIZE) {
      const batch = csvBlobs.slice(i, i + BATCH_SIZE);
      console.log(`📦 Processing index batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(csvBlobs.length / BATCH_SIZE)} (${batch.length} files)`);
      
      // Process batch in parallel
      const batchResults = await Promise.allSettled(
        batch.map(async (blobName) => {
          const indexCode = blobName.split('/')[1]?.replace('.csv', '') || '';
          
          try {
            const ohlcData = await this.loadOHLCDataFromAzure(blobName);
            const mfiData = this.calculateMFI(ohlcData);
            
            if (mfiData.length > 0) {
              return { indexCode, mfiData, success: true };
            }
            return { indexCode, mfiData: [], success: false, error: 'No MFI data' };
          } catch (error) {
            console.error(`Error processing ${blobName}:`, error);
            return { indexCode, mfiData: [], success: false, error: error instanceof Error ? error.message : 'Unknown error' };
          }
        })
      );
      
      // Process batch results
      let batchSuccess = 0;
      let batchFailed = 0;
      
      batchResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          const { indexCode, mfiData, success } = result.value;
          if (success && mfiData.length > 0) {
            moneyFlowData.set(indexCode, mfiData);
            batchSuccess++;
          } else {
            batchFailed++;
          }
        } else {
          batchFailed++;
        }
      });
      
      processed += batch.length;
      console.log(`📦 Batch complete: ✅ ${batchSuccess} success, ❌ ${batchFailed} failed (${processed}/${csvBlobs.length} total)`);
      
      // Small delay to give event loop breathing room
      if (i + BATCH_SIZE < csvBlobs.length) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    
    console.log(`Processed ${moneyFlowData.size} index files successfully`);
    return moneyFlowData;
  }

  /**
   * Create or update individual CSV files for each stock/index's money flow data
   */
  private async createMoneyFlowCsvFiles(
    moneyFlowData: Map<string, MoneyFlowData[]>
  ): Promise<string[]> {
    console.log("\nCreating/updating individual CSV files for each stock/index's money flow...");
    
    const createdFiles: string[] = [];
    
    for (const [code, flowData] of moneyFlowData) {
      // Determine if this is a stock or index based on the code
      // Index codes are typically 3-4 characters and contain specific patterns
      const isIndex = this.isIndexCode(code);
      const subfolder = isIndex ? 'index' : 'stock';
      const filename = `money_flow/${subfolder}/${code}.csv`;
      
      // Check if file already exists
      const existingData = await this.readExistingCsvDataFromAzure(filename);
      
      if (existingData.length > 0) {
        console.log(`Updating existing file: ${filename}`);
        
        // Merge with new data
        const mergedData = this.mergeMoneyFlowData(existingData, flowData);
        
        // Save merged and sorted data
        await this.saveToAzure(filename, mergedData);
        console.log(`Updated ${filename} with ${mergedData.length} total trading days`);
      } else {
        console.log(`Creating new file: ${filename}`);
        await this.saveToAzure(filename, flowData);
        console.log(`Created ${filename} with ${flowData.length} trading days`);
      }
      
      createdFiles.push(filename);
    }
    
    console.log(`\nProcessed ${createdFiles.length} money flow CSV files`);
    return createdFiles;
  }

  /**
   * Determine if a code is an index code based on common patterns
   */
  private isIndexCode(code: string): boolean {
    // Common index patterns
    const indexPatterns = [
      /^IDX/,           // IDX30, IDX80, etc.
      /^ABX$/,          // ABX
      /^COMPOSITE$/,    // COMPOSITE
      /^DBX$/,          // DBX
      /^ECONOMIC/,      // ECONOMIC30
      /^ESG/,           // ESGQKEHATI, ESGSKEHATI
      /^I-GRADE$/,      // I-GRADE
      /^BISNIS/         // BISNIS-27
    ];
    
    return indexPatterns.some(pattern => pattern.test(code));
  }

  /**
   * Main function to generate money flow data
   */
  public async generateMoneyFlowData(dateSuffix: string): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      console.log(`Starting money flow data extraction for date: ${dateSuffix}`);
      
      // Process stock files
      const stockMoneyFlowData = await this.processStockFiles();
      
      // Process index files
      const indexMoneyFlowData = await this.processIndexFiles();
      
      // Combine all data
      const allMoneyFlowData = new Map([...stockMoneyFlowData, ...indexMoneyFlowData]);
      
      // Create or update individual CSV files
      const createdFiles = await this.createMoneyFlowCsvFiles(allMoneyFlowData);
      
      console.log("Money flow data extraction completed successfully!");
      
      return {
        success: true,
        message: `Money flow data generated successfully for ${dateSuffix}`,
        data: {
          date: dateSuffix,
          stockFilesProcessed: stockMoneyFlowData.size,
          indexFilesProcessed: indexMoneyFlowData.size,
          totalFilesProcessed: allMoneyFlowData.size,
          outputFiles: createdFiles
        }
      };
      
    } catch (error) {
      console.error('Error generating money flow data:', error);
      return {
        success: false,
        message: `Failed to generate money flow data: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}

export default MoneyFlowCalculator;
