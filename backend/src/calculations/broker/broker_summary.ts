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

interface BrokerSummary {
  BrokerCode: string;
  BuyerVol: number;
  BuyerValue: number;
  SellerVol: number;
  SellerValue: number;
  NetBuyVol: number;
  NetBuyValue: number;
  NetSellVol: number;
  NetSellValue: number;
  BuyerAvg: number;
  SellerAvg: number;
  NetBuyerAvg: number;
  NetSellerAvg: number;
}

interface DetailedBrokerSummary {
  BrokerCode: string;
  BuyerVol: number;
  BuyerFreq: number;
  BuyerValue: number;
  BuyerAvg: number;
  SellerVol: number;
  SellerFreq: number;
  SellerValue: number;
  SellerAvg: number;
  NetBuyVol: number;
  NetBuyValue: number;
}

export class BrokerSummaryCalculator {
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
   * Create broker summary files for each emiten
   */
  private async createBrokerSummaryPerEmiten(
    data: TransactionData[], 
    dateSuffix: string
  ): Promise<string[]> {
    console.log("\nCreating broker summary files per emiten...");
    
    // Get unique emiten codes
    const uniqueEmiten = [...new Set(data.map(row => row.STK_CODE))];
    console.log(`Found ${uniqueEmiten.length} unique emiten`);
    
    const createdFiles: string[] = [];
    
    for (const emiten of uniqueEmiten) {
      console.log(`Processing emiten: ${emiten}`);
      
      // Filter data for this emiten
      const emitenData = data.filter(row => row.STK_CODE === emiten);
      
      // Group by buyer broker for this emiten
      const buyerGroups = new Map<string, TransactionData[]>();
      emitenData.forEach(row => {
        const broker = row.BRK_COD2;
        if (!buyerGroups.has(broker)) {
          buyerGroups.set(broker, []);
        }
        buyerGroups.get(broker)!.push(row);
      });
      
      // Calculate buyer summary
      const buyerSummary = new Map<string, {
        totalVol: number;
        avgPrice: number;
        transactionCount: number;
        totalValue: number;
      }>();
      
      buyerGroups.forEach((transactions, broker) => {
        const totalVol = transactions.reduce((sum, t) => sum + t.STK_VOLM, 0);
        const totalValue = transactions.reduce((sum, t) => sum + (t.STK_VOLM * t.STK_PRIC), 0);
        const avgPrice = totalVol > 0 ? totalValue / totalVol : 0;
        
        buyerSummary.set(broker, {
          totalVol,
          avgPrice,
          transactionCount: transactions.length,
          totalValue
        });
      });
      
      // Group by seller broker for this emiten
      const sellerGroups = new Map<string, TransactionData[]>();
      emitenData.forEach(row => {
        const broker = row.BRK_COD1;
        if (!sellerGroups.has(broker)) {
          sellerGroups.set(broker, []);
        }
        sellerGroups.get(broker)!.push(row);
      });
      
      // Calculate seller summary
      const sellerSummary = new Map<string, {
        totalVol: number;
        avgPrice: number;
        transactionCount: number;
        totalValue: number;
      }>();
      
      sellerGroups.forEach((transactions, broker) => {
        const totalVol = transactions.reduce((sum, t) => sum + t.STK_VOLM, 0);
        const totalValue = transactions.reduce((sum, t) => sum + (t.STK_VOLM * t.STK_PRIC), 0);
        const avgPrice = totalVol > 0 ? totalValue / totalVol : 0;
        
        sellerSummary.set(broker, {
          totalVol,
          avgPrice,
          transactionCount: transactions.length,
          totalValue
        });
      });
      
      // Create final summary
      const finalSummary: BrokerSummary[] = [];
      const allBrokers = new Set([...buyerSummary.keys(), ...sellerSummary.keys()]);
      
      allBrokers.forEach(broker => {
        const buyer = buyerSummary.get(broker) || { totalVol: 0, avgPrice: 0, transactionCount: 0, totalValue: 0 };
        const seller = sellerSummary.get(broker) || { totalVol: 0, avgPrice: 0, transactionCount: 0, totalValue: 0 };
        
        // Calculate net values (before SWAPPED)
        const rawNetBuyVol = buyer.totalVol - seller.totalVol;
        const rawNetBuyValue = buyer.totalValue - seller.totalValue;
        let netBuyVol = 0;
        let netBuyValue = 0;
        let netSellVol = 0;
        let netSellValue = 0;
        
        // If NetBuy is negative, it becomes NetSell (and NetBuy is set to 0)
        // If NetBuy is positive, NetSell is 0 (and NetBuy keeps the value)
        if (rawNetBuyVol < 0 || rawNetBuyValue < 0) {
          // NetBuy is negative, so it becomes NetSell
          netSellVol = Math.abs(rawNetBuyVol);
          netSellValue = Math.abs(rawNetBuyValue);
          netBuyVol = 0;
          netBuyValue = 0;
        } else {
          // NetBuy is positive or zero, keep it and NetSell is 0
          netBuyVol = rawNetBuyVol;
          netBuyValue = rawNetBuyValue;
          netSellVol = 0;
          netSellValue = 0;
        }
        
        // Calculate averages
        const netBuyerAvg = netBuyVol > 0 ? netBuyValue / netBuyVol : 0;
        const netSellerAvg = netSellVol > 0 ? netSellValue / netSellVol : 0;
        
        // SWAPPED: Kolom Buyer isinya data Seller, kolom Seller isinya data Buyer
        // Ini agar frontend tidak perlu swap lagi (sesuai dengan CSV yang kolomnya tertukar)
        finalSummary.push({
          BrokerCode: broker,
          BuyerVol: seller.totalVol,      // SWAPPED: Kolom Buyer = data Seller
          BuyerValue: seller.totalValue,  // SWAPPED: Kolom Buyer = data Seller
          SellerVol: buyer.totalVol,      // SWAPPED: Kolom Seller = data Buyer
          SellerValue: buyer.totalValue,  // SWAPPED: Kolom Seller = data Buyer
          NetBuyVol: netBuyVol,
          NetBuyValue: netBuyValue,
          NetSellVol: netSellVol,
          NetSellValue: netSellValue,
          BuyerAvg: seller.avgPrice,      // SWAPPED: Kolom BuyerAvg = SellerAvg
          SellerAvg: buyer.avgPrice,      // SWAPPED: Kolom SellerAvg = BuyerAvg
          NetBuyerAvg: netBuyerAvg,
          NetSellerAvg: netSellerAvg
        });
      });
      
      // Sort by net buy value descending
      finalSummary.sort((a, b) => b.NetBuyValue - a.NetBuyValue);
      
      // Save to Azure
      const filename = `broker_summary/broker_summary_${dateSuffix}/${emiten}.csv`;
      await this.saveToAzure(filename, finalSummary);
      createdFiles.push(filename);
      
      console.log(`Created ${filename} with ${finalSummary.length} brokers`);
    }
    
    console.log(`Created ${createdFiles.length} broker summary files`);
    return createdFiles;
  }

  /**
   * Create detailed broker summary with buy/sell analysis (for ALLSUM file)
   */
  private createDetailedBrokerSummary(data: TransactionData[]): DetailedBrokerSummary[] {
    console.log("\nCreating detailed broker summary...");
    
    // Calculate buyer data
    const buyerGroups = new Map<string, TransactionData[]>();
    data.forEach(row => {
      const broker = row.BRK_COD2;
      if (!buyerGroups.has(broker)) {
        buyerGroups.set(broker, []);
      }
      buyerGroups.get(broker)!.push(row);
    });
    
    const buyerData = new Map<string, {
      vol: number;
      freq: number;
      value: number;
      avg: number;
    }>();
    
    buyerGroups.forEach((transactions, broker) => {
      const vol = transactions.reduce((sum, t) => sum + t.STK_VOLM, 0);
      const value = transactions.reduce((sum, t) => sum + (t.STK_VOLM * t.STK_PRIC), 0);
      const avg = vol > 0 ? value / vol : 0;
      
      buyerData.set(broker, {
        vol,
        freq: transactions.length,
        value,
        avg
      });
    });
    
    // Calculate seller data
    const sellerGroups = new Map<string, TransactionData[]>();
    data.forEach(row => {
      const broker = row.BRK_COD1;
      if (!sellerGroups.has(broker)) {
        sellerGroups.set(broker, []);
      }
      sellerGroups.get(broker)!.push(row);
    });
    
    const sellerData = new Map<string, {
      vol: number;
      freq: number;
      value: number;
      avg: number;
    }>();
    
    sellerGroups.forEach((transactions, broker) => {
      const vol = transactions.reduce((sum, t) => sum + t.STK_VOLM, 0);
      const value = transactions.reduce((sum, t) => sum + (t.STK_VOLM * t.STK_PRIC), 0);
      const avg = vol > 0 ? value / vol : 0;
      
      sellerData.set(broker, {
        vol,
        freq: transactions.length,
        value,
        avg
      });
    });
    
    // Merge buyer and seller data
    const allBrokers = new Set([...buyerData.keys(), ...sellerData.keys()]);
    const detailedSummary: DetailedBrokerSummary[] = [];
    
    allBrokers.forEach(broker => {
      const buyer = buyerData.get(broker) || { vol: 0, freq: 0, value: 0, avg: 0 };
      const seller = sellerData.get(broker) || { vol: 0, freq: 0, value: 0, avg: 0 };
      
      // SWAPPED: Kolom Buyer isinya data Seller, kolom Seller isinya data Buyer
      // Ini agar frontend tidak perlu swap lagi (sesuai dengan CSV yang kolomnya tertukar)
      detailedSummary.push({
        BrokerCode: broker,
        BuyerVol: seller.vol,        // SWAPPED: Kolom Buyer = data Seller
        BuyerFreq: seller.freq,      // SWAPPED: Kolom Buyer = data Seller
        BuyerValue: seller.value,    // SWAPPED: Kolom Buyer = data Seller
        BuyerAvg: seller.avg,        // SWAPPED: Kolom Buyer = data Seller
        SellerVol: buyer.vol,        // SWAPPED: Kolom Seller = data Buyer
        SellerFreq: buyer.freq,      // SWAPPED: Kolom Seller = data Buyer
        SellerValue: buyer.value,    // SWAPPED: Kolom Seller = data Buyer
        SellerAvg: buyer.avg,         // SWAPPED: Kolom Seller = data Buyer
        NetBuyVol: buyer.vol - seller.vol,
        NetBuyValue: buyer.value - seller.value
      });
    });
    
    // Sort by net buy value descending
    detailedSummary.sort((a, b) => b.NetBuyValue - a.NetBuyValue);
    
    console.log(`Detailed broker summary created with ${detailedSummary.length} brokers`);
    return detailedSummary;
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
   * Process a single DT file with broker summary analysis
   */
  private async processSingleDtFile(blobName: string): Promise<{ success: boolean; dateSuffix: string; files: string[]; timing?: any; skipped?: boolean }> {
    // Extract date from blob name first (before loading input)
    const pathParts = blobName.split('/');
    const dateFolder = pathParts[1] || 'unknown'; // 20251021
    const dateSuffix = dateFolder;
    
    // Check if output already exists for this date BEFORE loading input
    // Check key output file: ALLSUM-broker_summary.csv
    const keyOutputFile = `broker_summary/broker_summary_${dateSuffix}/ALLSUM-broker_summary.csv`;
    
    try {
      const outputExists = await exists(keyOutputFile);
      if (outputExists) {
        console.log(`⏭️ Broker summary already exists for date ${dateSuffix} - skipping (checked ${keyOutputFile})`);
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
        brokerSummary: 0,
        allsum: 0
      };
      
      // Create broker summary per emiten and detailed summary in parallel
      const startTime = Date.now();
      const [brokerSummaryFiles, detailedSummary] = await Promise.all([
        this.createBrokerSummaryPerEmiten(data, dateSuffix),
        Promise.resolve(this.createDetailedBrokerSummary(data))
      ]);
      timing.brokerSummary = Math.round((Date.now() - startTime) / 1000);
      
      // Save ALLSUM file
      const allsumStartTime = Date.now();
      await this.saveToAzure(`broker_summary/broker_summary_${dateSuffix}/ALLSUM-broker_summary.csv`, detailedSummary);
      timing.allsum = Math.round((Date.now() - allsumStartTime) / 1000);
      
      const allFiles = [
        ...brokerSummaryFiles,
        `broker_summary/broker_summary_${dateSuffix}/ALLSUM-broker_summary.csv`
      ];
      
      console.log(`✅ Completed processing ${blobName} - ${allFiles.length} files created`);
      return { success: true, dateSuffix, files: allFiles, timing };
      
    } catch (error) {
      console.error(`Error processing ${blobName}:`, error);
      return { success: false, dateSuffix, files: [] };
    }
  }

  /**
   * Main function to generate broker summary data for all DT files
   */
  public async generateBrokerSummaryData(_dateSuffix: string, logId?: string | null): Promise<{ success: boolean; message: string; data?: any }> {
    const startTime = Date.now();
    try {
      console.log(`Starting broker summary analysis for all DT files...`);
      
      // Find all DT files
      const dtFiles = await this.findAllDtFiles();
      
      if (dtFiles.length === 0) {
        console.log(`⚠️ No DT files found in done-summary folder`);
        return {
          success: true,
          message: `No DT files found - skipped broker summary generation`,
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
      let brokerSummaryFiles = 0;
      let allsumFiles = 0;
      
      const totalTiming = {
        brokerSummary: 0,
        allsum: 0
      };
      
      allResults.forEach(result => {
        if (result.success) {
          result.files.forEach(file => {
            if (file.includes('broker_summary/') && !file.includes('ALLSUM')) {
              brokerSummaryFiles++;
            } else if (file.includes('ALLSUM')) {
              allsumFiles++;
            }
          });
          
          // Aggregate timing if available
          if (result.timing) {
            totalTiming.brokerSummary += result.timing.brokerSummary || 0;
            totalTiming.allsum += result.timing.allsum || 0;
          }
        }
      });
      
      console.log(`✅ Broker summary analysis completed!`);
      console.log(`📊 Processed: ${processed}/${dtFiles.length} DT files`);
      console.log(`📊 Successful: ${successful}/${processed} files`);
      console.log(`📊 Total output files: ${totalFiles}`);
      console.log(`📊 Output breakdown:`);
      console.log(`   📈 Broker Summary files: ${brokerSummaryFiles} (${totalTiming.brokerSummary}s)`);
      console.log(`   📋 ALLSUM files: ${allsumFiles} (${totalTiming.allsum}s)`);
      console.log(`✅ Broker Summary calculation completed successfully`);
      console.log(`✅ Broker Summary completed in ${totalDuration}s`);
      
      return {
        success: true,
        message: `Broker summary generated successfully for ${successful}/${processed} DT files`,
        data: {
          totalDtFiles: dtFiles.length,
          processedFiles: processed,
          successfulFiles: successful,
          totalOutputFiles: totalFiles,
          duration: totalDuration,
          outputBreakdown: {
            brokerSummaryFiles,
            allsumFiles
          },
          timingBreakdown: totalTiming,
          results: allResults.filter(r => r.success)
        }
      };
      
    } catch (error) {
      console.error('Error generating broker summary:', error);
      return {
        success: false,
        message: `Failed to generate broker summary: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}

export default BrokerSummaryCalculator;

