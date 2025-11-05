import { downloadText, uploadText, listPaths } from '../../utils/azureBlob';

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
   */
  private async findAllDtFiles(): Promise<string[]> {
    console.log("Scanning all DT files in done-summary folder...");
    
    try {
      const allFiles = await listPaths({ prefix: 'done-summary/' });
      const dtFiles = allFiles.filter(file => 
        file.includes('/DT') && file.endsWith('.csv')
      );
      
      // Sort by date descending (newest first) - process from newest to oldest
      const sortedFiles = dtFiles.sort((a, b) => {
        const dateA = a.split('/')[1] || '';
        const dateB = b.split('/')[1] || '';
        return dateB.localeCompare(dateA); // Descending order (newest first)
      });
      
      console.log(`Found ${sortedFiles.length} DT files to process (sorted newest first)`);
      return sortedFiles;
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
   * Create foreign flow data for each stock
   */
  private createForeignFlowData(data: TransactionData[]): Map<string, ForeignFlowData[]> {
    console.log("\nCreating foreign flow data...");
    
    // Group by stock code and date
    const stockDateGroups = new Map<string, Map<string, TransactionData[]>>();
    
    data.forEach(row => {
      const stock = row.STK_CODE;
      const date = row.TRX_DATE;
      
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
      stockForeignFlow.sort((a, b) => b.Date.localeCompare(a.Date));
      
      foreignFlowData.set(stock, stockForeignFlow);
    });
    
    console.log(`Foreign flow data created for ${foreignFlowData.size} stocks`);
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
    mergedData.sort((a, b) => b.Date.localeCompare(a.Date));
    
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
    _dateSuffix: string
  ): Promise<string[]> {
    console.log("\nCreating/updating individual CSV files for each stock's foreign flow...");
    
    const createdFiles: string[] = [];
    
    for (const [stockCode, flowData] of foreignFlowData) {
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
    }
    
    console.log(`\nProcessed ${createdFiles.length} foreign flow CSV files`);
    return createdFiles;
  }

  /**
   * Process a single DT file with all foreign flow analysis
   */
  private async processSingleDtFile(blobName: string): Promise<{ success: boolean; dateSuffix: string; files: string[] }> {
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
      // Create foreign flow data
      const foreignFlowData = this.createForeignFlowData(data);
      
      // Create or update individual CSV files for each stock
      const createdFiles = await this.createForeignFlowCsvFiles(foreignFlowData, dateSuffix);
      
      console.log(`✅ Completed processing ${blobName} - ${createdFiles.length} files created`);
      return { success: true, dateSuffix, files: createdFiles };
      
    } catch (error) {
      console.error(`Error processing ${blobName}:`, error);
      return { success: false, dateSuffix, files: [] };
    }
  }

  /**
   * Main function to generate foreign flow data for all DT files
   */
  public async generateForeignFlowData(_dateSuffix: string): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      console.log(`Starting foreign flow data extraction for all DT files...`);
      
      // Find all DT files
      const dtFiles = await this.findAllDtFiles();
      
      if (dtFiles.length === 0) {
        console.log(`⚠️ No DT files found in done-summary folder`);
        return {
          success: true,
          message: `No DT files found - skipped foreign flow calculation`,
          data: { skipped: true, reason: 'No DT files found' }
        };
      }
      
      console.log(`📊 Processing ${dtFiles.length} DT files...`);
      
      // Process files in batches for speed (2 files at a time to prevent OOM)
      const BATCH_SIZE = 10;
      const allResults: { success: boolean; dateSuffix: string; files: string[] }[] = [];
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
      
      console.log(`✅ Foreign flow data extraction completed!`);
      console.log(`📊 Processed: ${processed}/${dtFiles.length} DT files`);
      console.log(`📊 Successful: ${successful}/${processed} files`);
      console.log(`📊 Total output files: ${totalFiles}`);
      
      return {
        success: true,
        message: `Foreign flow data generated successfully for ${successful}/${processed} DT files`,
        data: {
          totalDtFiles: dtFiles.length,
          processedFiles: processed,
          successfulFiles: successful,
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
    }
  }
}

export default ForeignFlowCalculator;
