import { downloadText, uploadText, listPaths, exists } from '../../utils/azureBlob';
import { BATCH_SIZE_PHASE_6 } from '../../services/dataUpdateService';

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
  private async processSingleDtFile(blobName: string): Promise<{ success: boolean; dateSuffix: string; files: string[]; timing?: any; skipped?: boolean }> {
    // Extract date from blob name first (before loading input)
    const pathParts = blobName.split('/');
    const dateFolder = pathParts[1] || 'unknown'; // 20251021
    const dateSuffix = dateFolder;
    
    // Check if output already exists for this date BEFORE loading input
    // Check key output file: top_broker.csv
    const keyOutputFile = `top_broker/top_broker_${dateSuffix}/top_broker.csv`;
    
    try {
      const outputExists = await exists(keyOutputFile);
      if (outputExists) {
        console.log(`⏭️ Top broker already exists for date ${dateSuffix} - skipping (checked ${keyOutputFile})`);
        return { success: true, dateSuffix, files: [], skipped: true };
      }
    } catch (error) {
      // If check fails, continue with processing (might be permission issue)
      console.log(`ℹ️ Could not check existence of ${keyOutputFile}, proceeding with generation`);
    }
    
    // Only load input if output doesn't exist
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
      
      console.log(`✅ Completed processing ${blobName} - ${allFiles.length} files created`);
      return { success: true, dateSuffix, files: allFiles, timing };
      
    } catch (error) {
      console.error(`Error processing ${blobName}:`, error);
      return { success: false, dateSuffix, files: [] };
    }
  }

  /**
   * Main function to generate top broker data for all DT files
   */
  public async generateTopBrokerData(_dateSuffix: string, logId?: string | null): Promise<{ success: boolean; message: string; data?: any }> {
    const startTime = Date.now();
    try {
      console.log(`Starting top broker analysis for all DT files...`);
      
      // Find all DT files
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
      
      // Process files in batches
      const BATCH_SIZE = BATCH_SIZE_PHASE_6; // Phase 6: 1 file at a time
      const allResults: { success: boolean; dateSuffix: string; files: string[]; timing?: any }[] = [];
      let processed = 0;
      let successful = 0;
      
      for (let i = 0; i < dtFiles.length; i += BATCH_SIZE) {
        const batch = dtFiles.slice(i, i + BATCH_SIZE);
        console.log(`📦 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(dtFiles.length / BATCH_SIZE)} (${batch.length} files)`);
        
        // Update progress
        if (logId) {
          const { SchedulerLogService } = await import('../../services/schedulerLogService');
          await SchedulerLogService.updateLog(logId, {
            progress_percentage: Math.round(((i + batch.length) / dtFiles.length) * 100),
            current_processing: `Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(dtFiles.length / BATCH_SIZE)} (${batch.length} files)`
          });
        }
        
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
    }
  }
}

export default TopBrokerCalculator;

