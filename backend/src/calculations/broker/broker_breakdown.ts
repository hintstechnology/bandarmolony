import { downloadText, uploadText, listPaths } from '../../utils/azureBlob';
import { BATCH_SIZE_PHASE_6 } from '../../services/dataUpdateService';

// Type definitions for broker breakdown data
interface TransactionData {
  STK_CODE: string;
  BRK_COD1: string; // Seller broker
  BRK_COD2: string; // Buyer broker
  STK_VOLM: number;
  STK_PRIC: number;
  TRX_CODE: string;
  TRX_TIME: string;
  TRX_ORD1: number; // Order reference 1
  TRX_ORD2: number; // Order reference 2
}

interface BrokerBreakdownData {
  Price: number;
  Broker: string;
  BLot: number;      // Buy Lot
  BFreq: number;    // Buy Frequency
  SLot: number;      // Sell Lot
  SFreq: number;     // Sell Frequency
  TFreq: number;     // Total Frequency
  TLot: number;      // Total Lot
}

export class BrokerBreakdownCalculator {
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
    const trxCodeIndex = getColumnIndex('TRX_CODE');
    const trxTimeIndex = getColumnIndex('TRX_TIME');
    const trxOrd1Index = getColumnIndex('TRX_ORD1');
    const trxOrd2Index = getColumnIndex('TRX_ORD2');
    
    // Validate required columns exist
    if (stkCodeIndex === -1 || brkCod1Index === -1 || brkCod2Index === -1 || 
        stkVolmIndex === -1 || stkPricIndex === -1 || trxCodeIndex === -1 ||
        trxTimeIndex === -1 || trxOrd1Index === -1 || trxOrd2Index === -1) {
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
          TRX_CODE: values[trxCodeIndex]?.trim() || '',
          TRX_TIME: values[trxTimeIndex]?.trim() || '',
          TRX_ORD1: parseFloat(values[trxOrd1Index]?.trim() || '0') || 0,
          TRX_ORD2: parseFloat(values[trxOrd2Index]?.trim() || '0') || 0
        };
        
        data.push(transaction);
      }
    }
    
    console.log(`📊 Loaded ${data.length} transaction records from Azure (4-character stocks only)`);
    return data;
  }

  /**
   * Create broker breakdown data grouped by stock code
   * Same logic as original file
   */
  private createBrokerBreakdownData(data: TransactionData[]): Map<string, BrokerBreakdownData[]> {
    console.log("Creating broker breakdown data by stock...");
    
    const stockBrokerMap = new Map<string, Map<string, Map<number, {
      buyLot: number;
      buyFreq: number;
      sellLot: number;
      sellFreq: number;
    }>>>();
    
    data.forEach(row => {
      const stock = row.STK_CODE;
      const price = row.STK_PRIC;
      const volume = row.STK_VOLM;
      const isBid = row.TRX_ORD1 > row.TRX_ORD2; // HAKA -> BID, HAKI -> ASK
      
      // Get broker code based on HAKA/HAKI logic - same as original file
      const brokerCode = isBid ? row.BRK_COD1 : row.BRK_COD2;
      
      if (!stockBrokerMap.has(stock)) {
        stockBrokerMap.set(stock, new Map());
      }
      const stockMap = stockBrokerMap.get(stock)!;
      
      if (!stockMap.has(brokerCode)) {
        stockMap.set(brokerCode, new Map());
      }
      const brokerMap = stockMap.get(brokerCode)!;
      
      if (!brokerMap.has(price)) {
        brokerMap.set(price, {
          buyLot: 0,
          buyFreq: 0,
          sellLot: 0,
          sellFreq: 0
        });
      }
      const priceData = brokerMap.get(price)!;
      
      // Klasifikasi BID/ASK berdasarkan HAKA/HAKI - same as original file
      if (isBid) {
        priceData.buyLot += volume;
        priceData.buyFreq += 1;
      } else {
        priceData.sellLot += volume;
        priceData.sellFreq += 1;
      }
    });
    
    // Convert to array format - same as original file
    const breakdownData = new Map<string, BrokerBreakdownData[]>();
    
    stockBrokerMap.forEach((brokerMap, stock) => {
      const stockData: BrokerBreakdownData[] = [];
      
      brokerMap.forEach((priceMap, broker) => {
        priceMap.forEach((priceData, price) => {
          stockData.push({
            Price: price,
            Broker: broker,
            BLot: priceData.buyLot,
            BFreq: priceData.buyFreq,
            SLot: priceData.sellLot,
            SFreq: priceData.sellFreq,
            TFreq: priceData.buyFreq + priceData.sellFreq,
            TLot: priceData.buyLot + priceData.sellLot
          });
        });
      });
      
      // Sort by price ascending (low to high), then by broker - same as original file
      stockData.sort((a, b) => {
        if (a.Price !== b.Price) {
          return a.Price - b.Price;
        }
        return a.Broker.localeCompare(b.Broker);
      });
      
      breakdownData.set(stock, stockData);
    });
    
    console.log(`Created broker breakdown data for ${breakdownData.size} stocks`);
    return breakdownData;
  }

  /**
   * Save broker breakdown data to Azure Blob Storage
   */
  private async saveToAzure(filename: string, data: BrokerBreakdownData[]): Promise<string> {
    if (data.length === 0) {
      console.log(`No data to save for ${filename}`);
      return filename;
    }
    
    // Convert to CSV format - same as original file
    const headers = ['Price', 'Broker', 'BLot', 'BFreq', 'SLot', 'SFreq', 'TFreq', 'TLot'];
    const csvContent = [
      headers.join(','),
      ...data.map(row => [
        row.Price,
        row.Broker,
        row.BLot,
        row.BFreq,
        row.SLot,
        row.SFreq,
        row.TFreq,
        row.TLot
      ].join(','))
    ].join('\n');
    
    await uploadText(filename, csvContent, 'text/csv');
    console.log(`Saved ${data.length} broker breakdown records to ${filename}`);
    return filename;
  }

  /**
   * Process a single DT file with broker breakdown analysis
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
    
    // Validate that we have valid transaction data
    const validTransactions = data.filter(t => 
      t.STK_CODE && t.STK_CODE.length === 4 && 
      t.BRK_COD1 && t.BRK_COD2 && 
      t.STK_VOLM > 0 && t.STK_PRIC > 0
    );
    
    if (validTransactions.length === 0) {
      console.log(`⚠️ No valid transaction data in ${blobName} - skipping`);
      return { success: false, dateSuffix, files: [] };
    }
    
    console.log(`📊 Valid transactions: ${validTransactions.length}/${data.length}`);
    
    console.log(`🔄 Processing ${blobName} (${data.length} transactions)...`);
    
    try {
      // Create broker breakdown data - same logic as original file
      const breakdownData = this.createBrokerBreakdownData(validTransactions);
      
      // Save CSV files for each stock - same structure as original file
      const createdFiles: string[] = [];
      
      for (const [stockCode, stockData] of breakdownData) {
        const filename = `done_summary_broker_breakdown/${dateSuffix}/${stockCode}.csv`;
        await this.saveToAzure(filename, stockData);
        createdFiles.push(filename);
        console.log(`Created ${filename} with ${stockData.length} broker breakdown records`);
      }
      
      console.log(`✅ Completed processing ${blobName} - ${createdFiles.length} files created`);
      return { success: true, dateSuffix, files: createdFiles };
      
    } catch (error) {
      console.error(`Error processing ${blobName}:`, error);
      return { success: false, dateSuffix, files: [] };
    }
  }

  /**
   * Main function to generate broker breakdown data for all DT files
   */
  public async generateBrokerBreakdownData(_dateSuffix: string): Promise<{ success: boolean; message: string; data?: any }> {
    const startTime = Date.now();
    try {
      console.log(`Starting broker breakdown analysis for all DT files...`);
      
      // Find all DT files
      const dtFiles = await this.findAllDtFiles();
      
      if (dtFiles.length === 0) {
        console.log(`⚠️ No DT files found in done-summary folder`);
        return {
          success: true,
          message: `No DT files found - skipped broker breakdown generation`,
          data: { skipped: true, reason: 'No DT files found' }
        };
      }
      
      console.log(`📊 Processing ${dtFiles.length} DT files...`);
      
      // Process files in batches for speed (10 files at a time to prevent OOM)
      const BATCH_SIZE = BATCH_SIZE_PHASE_6; // Phase 6: 1 file at a time
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
      const totalDuration = Math.round((Date.now() - startTime) / 1000);
      
      console.log(`✅ Broker breakdown analysis completed!`);
      console.log(`📊 Processed: ${processed}/${dtFiles.length} DT files`);
      console.log(`📊 Successful: ${successful}/${processed} files`);
      console.log(`📊 Total output files: ${totalFiles}`);
      console.log(`✅ Broker Breakdown calculation completed successfully`);
      console.log(`✅ Broker Breakdown completed in ${totalDuration}s`);
      
      return {
        success: true,
        message: `Broker breakdown data generated successfully for ${successful}/${processed} DT files`,
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
      console.error('Error generating broker breakdown data:', error);
      return {
        success: false,
        message: `Failed to generate broker breakdown data: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}

export default BrokerBreakdownCalculator;
