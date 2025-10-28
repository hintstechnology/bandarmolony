import { downloadText, uploadText, listPaths } from '../../utils/azureBlob';
import { BATCH_SIZE_PHASE_3_5 } from '../../services/dataUpdateService';

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
   * Find all DT files in done-summary folder
   */
  private async findAllDtFiles(): Promise<string[]> {
    console.log("Scanning all DT files in done-summary folder...");
    
    try {
      const allFiles = await listPaths({ prefix: 'done-summary/' });
      const dtFiles = allFiles.filter(file => 
        file.includes('/DT') && file.endsWith('.csv')
      );
      
      console.log(`Found ${dtFiles.length} DT files to process`);
      return dtFiles;
    } catch (error) {
      console.error('Error scanning DT files:', error);
      return [];
    }
  }

  /**
   * Load and process a single DT file
   */
  private async loadAndProcessSingleDtFile(blobName: string): Promise<{ data: DoneTradeData[], dateSuffix: string } | null> {
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
      const doneTradeData: DoneTradeData = {
        STK_CODE: values[stkCodeIndex]?.trim() || '',
        BRK_COD1: values[brkCod1Index]?.trim() || '',
        BRK_COD2: values[brkCod2Index]?.trim() || '',
        STK_VOLM: parseFloat(values[stkVolmIndex]?.trim() || '0') || 0,
        STK_PRIC: parseFloat(values[stkPricIndex]?.trim() || '0') || 0,
        TRX_DATE: trxDateIndex !== -1 ? values[trxDateIndex]?.trim() || '' : '',
        TRX_TIME: trxTimeIndex !== -1 ? parseInt(values[trxTimeIndex]?.trim() || '0') || 0 : 0,
        INV_TYP1: invTyp1Index !== -1 ? values[invTyp1Index]?.trim() || '' : '',
        INV_TYP2: invTyp2Index !== -1 ? values[invTyp2Index]?.trim() || '' : '',
        TYP: typIndex !== -1 ? values[typIndex]?.trim() || '' : '',
        TRX_CODE: trxCodeIndex !== -1 ? parseInt(values[trxCodeIndex]?.trim() || '0') || 0 : 0,
        TRX_SESS: trxSessIndex !== -1 ? parseInt(values[trxSessIndex]?.trim() || '0') || 0 : 0,
        TRX_ORD1: trxOrd1Index !== -1 ? parseInt(values[trxOrd1Index]?.trim() || '0') || 0 : 0,
        TRX_ORD2: trxOrd2Index !== -1 ? parseInt(values[trxOrd2Index]?.trim() || '0') || 0 : 0
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
   * Group data by stock code - same as original file
   */
  private groupDataByStockCode(data: DoneTradeData[]): Map<string, DoneTradeData[]> {
    console.log("Grouping data by stock code...");
    
    const groupedData = new Map<string, DoneTradeData[]>();
    
    data.forEach(row => {
      const stockCode = row.STK_CODE;
      
      if (!groupedData.has(stockCode)) {
        groupedData.set(stockCode, []);
      }
      
      groupedData.get(stockCode)!.push(row);
    });
    
    console.log(`Grouped data into ${groupedData.size} stock codes`);
    return groupedData;
  }

  /**
   * Save data to Azure Blob Storage
   */
  private async saveToAzure(filename: string, data: DoneTradeData[]): Promise<void> {
    if (data.length === 0) {
      console.log(`No data to save for ${filename}`);
      return;
    }
    
    // Get all unique column names from the data - same as original file
    const allColumns = new Set<string>();
    data.forEach(row => {
      Object.keys(row).forEach(key => allColumns.add(key));
    });
    
    const headers = Array.from(allColumns);
    const csvContent = [
      headers.join(','),
      ...data.map(row => headers.map(header => row[header] || '').join(','))
    ].join('\n');
    
    await uploadText(filename, csvContent, 'text/csv');
    console.log(`Saved ${data.length} records to ${filename}`);
  }

  /**
   * Process a single DT file with break done trade analysis
   */
  private async processSingleDtFile(blobName: string): Promise<{ success: boolean; dateSuffix: string; files: string[] }> {
    const result = await this.loadAndProcessSingleDtFile(blobName);
    
    if (!result) {
      return { success: false, dateSuffix: '', files: [] };
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
      
      // Save each stock's data to separate CSV file - same as original file
      const createdFiles: string[] = [];
      let totalRecords = 0;
      
      for (const [stockCode, stockData] of groupedData) {
        const filename = `done_detail/${dateSuffix}/${stockCode}.csv`;
        await this.saveToAzure(filename, stockData);
        createdFiles.push(filename);
        totalRecords += stockData.length;
        
        console.log(`Created ${filename} with ${stockData.length} records`);
        
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
   * Main function to generate break done trade data for all DT files
   * Note: dateSuffix parameter is kept for API compatibility but not used
   * This method processes ALL DT files regardless of date
   */
  public async generateBreakDoneTradeData(_dateSuffix?: string): Promise<{ success: boolean; message: string; data?: any }> {
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
      
      // Process files in batches for speed (Phase 3-5: 5 files at a time)
      const BATCH_SIZE = BATCH_SIZE_PHASE_3_5; // Phase 3-5: 5 files
      const allResults: { success: boolean; dateSuffix: string; files: string[] }[] = [];
      let processed = 0;
      let successful = 0;
      
      for (let i = 0; i < dtFiles.length; i += BATCH_SIZE) {
        // Check memory before each batch
        const memUsage = process.memoryUsage();
        const usedMB = memUsage.heapUsed / 1024 / 1024;
        console.log(`🔍 Memory before batch ${Math.floor(i / BATCH_SIZE) + 1}: ${usedMB.toFixed(2)}MB`);
        
        // If memory usage is high, force cleanup
        if (usedMB > 4000) {
          console.log(`⚠️ High memory usage detected, forcing cleanup before batch...`);
          if (global.gc) {
            for (let j = 0; j < 5; j++) {
              global.gc();
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
        }
        
        const batch = dtFiles.slice(i, i + BATCH_SIZE);
        console.log(`📦 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(dtFiles.length / BATCH_SIZE)} (${batch.length} files)`);
        
        // Process batch in parallel
        const batchResults = await Promise.allSettled(
          batch.map(blobName => this.processSingleDtFile(blobName))
        );
        
        // Force garbage collection after each batch
        if (global.gc) {
          global.gc();
          console.log(`🧹 Garbage collection completed after batch ${Math.floor(i / BATCH_SIZE) + 1}`);
        }
        
        // Additional memory cleanup
        await new Promise(resolve => setTimeout(resolve, 500)); // Give GC time to complete
        
        // Log memory usage after each batch
        this.logMemoryUsage(`After batch ${Math.floor(i / BATCH_SIZE) + 1}`);
        
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
