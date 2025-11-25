import { downloadText, uploadText, listPaths, exists } from '../../utils/azureBlob';

// Type definitions - same as broker_transaction.ts
interface BrokerTransactionData {
  Emiten: string;
  // Buy side (when broker is buyer - BRK_COD1)
  BuyerVol: number;
  BuyerValue: number;
  BuyerAvg: number;
  BuyerFreq: number; // Count of unique TRX_CODE
  OldBuyerOrdNum: number; // Unique count of TRX_ORD1
  BuyerOrdNum: number; // Unique count after grouping by time after 08:58:00
  BLot: number; // Buyer Lot (BuyerVol / 100)
  BLotPerFreq: number; // Buyer Lot per Frequency (BLot / BuyerFreq)
  BLotPerOrdNum: number; // Buyer Lot per Order Number (BLot / BuyerOrdNum)
  // Sell side (when broker is seller - BRK_COD2)
  SellerVol: number;
  SellerValue: number;
  SellerAvg: number;
  SellerFreq: number; // Count of unique TRX_CODE
  OldSellerOrdNum: number; // Unique count of TRX_ORD2
  SellerOrdNum: number; // Unique count after grouping by time after 08:58:00
  SLot: number; // Seller Lot (SellerVol / 100)
  SLotPerFreq: number; // Seller Lot per Frequency (SLot / SellerFreq)
  SLotPerOrdNum: number; // Seller Lot per Order Number (SLot / SellerOrdNum)
  // Net Buy
  NetBuyVol: number;
  NetBuyValue: number;
  NetBuyAvg: number;
  NetBuyFreq: number; // BuyerFreq - SellerFreq (can be negative)
  NetBuyOrdNum: number; // BuyerOrdNum - SellerOrdNum (can be negative)
  NBLot: number; // Net Buy Lot (NetBuyVol / 100)
  NBLotPerFreq: number; // Net Buy Lot per Frequency (NBLot / |NetBuyFreq|)
  NBLotPerOrdNum: number; // Net Buy Lot per Order Number (NBLot / |NetBuyOrdNum|)
  // Net Sell
  NetSellVol: number;
  NetSellValue: number;
  NetSellAvg: number;
  NetSellFreq: number; // SellerFreq - BuyerFreq (can be negative)
  NetSellOrdNum: number; // SellerOrdNum - BuyerOrdNum (can be negative)
  NSLot: number; // Net Sell Lot (NetSellVol / 100)
  NSLotPerFreq: number; // Net Sell Lot per Frequency (NSLot / |NetSellFreq|)
  NSLotPerOrdNum: number; // Net Sell Lot per Order Number (NSLot / |NetSellOrdNum|)
}

export class BrokerTransactionIDXCalculator {
  constructor() {}

  /**
   * Read CSV file and parse broker transaction data
   */
  private parseCSV(csvContent: string): BrokerTransactionData[] {
    const lines = csvContent.trim().split('\n');
    if (lines.length < 2) {
      return [];
    }

    const headers = (lines[0] || '').split(',').map(h => h.trim());
    const brokerData: BrokerTransactionData[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = (lines[i] || '').split(',').map(v => v.trim());
      if (values.length !== headers.length) {
        continue;
      }

      const row: any = {};
      headers.forEach((header, index) => {
        const value = values[index];
        // Convert numeric fields
        if (['BuyerVol', 'BuyerValue', 'BuyerAvg', 'BuyerFreq', 'OldBuyerOrdNum', 'BuyerOrdNum', 'BLot', 'BLotPerFreq', 'BLotPerOrdNum',
             'SellerVol', 'SellerValue', 'SellerAvg', 'SellerFreq', 'OldSellerOrdNum', 'SellerOrdNum', 'SLot', 'SLotPerFreq', 'SLotPerOrdNum',
             'NetBuyVol', 'NetBuyValue', 'NetBuyAvg', 'NetBuyFreq', 'NetBuyOrdNum', 'NBLot', 'NBLotPerFreq', 'NBLotPerOrdNum',
             'NetSellVol', 'NetSellValue', 'NetSellAvg', 'NetSellFreq', 'NetSellOrdNum', 'NSLot', 'NSLotPerFreq', 'NSLotPerOrdNum'].includes(header)) {
          row[header] = parseFloat(value || '0') || 0;
        } else {
          row[header] = value || '';
        }
      });

      brokerData.push({
        Emiten: row.Emiten || '',
        BuyerVol: row.BuyerVol || 0,
        BuyerValue: row.BuyerValue || 0,
        BuyerAvg: row.BuyerAvg || 0,
        BuyerFreq: row.BuyerFreq || 0,
        OldBuyerOrdNum: row.OldBuyerOrdNum || 0,
        BuyerOrdNum: row.BuyerOrdNum || 0,
        BLot: row.BLot || 0,
        BLotPerFreq: row.BLotPerFreq || 0,
        BLotPerOrdNum: row.BLotPerOrdNum || 0,
        SellerVol: row.SellerVol || 0,
        SellerValue: row.SellerValue || 0,
        SellerAvg: row.SellerAvg || 0,
        SellerFreq: row.SellerFreq || 0,
        OldSellerOrdNum: row.OldSellerOrdNum || 0,
        SellerOrdNum: row.SellerOrdNum || 0,
        SLot: row.SLot || 0,
        SLotPerFreq: row.SLotPerFreq || 0,
        SLotPerOrdNum: row.SLotPerOrdNum || 0,
        NetBuyVol: row.NetBuyVol || 0,
        NetBuyValue: row.NetBuyValue || 0,
        NetBuyAvg: row.NetBuyAvg || 0,
        NetBuyFreq: row.NetBuyFreq || 0,
        NetBuyOrdNum: row.NetBuyOrdNum || 0,
        NBLot: row.NBLot || 0,
        NBLotPerFreq: row.NBLotPerFreq || 0,
        NBLotPerOrdNum: row.NBLotPerOrdNum || 0,
        NetSellVol: row.NetSellVol || 0,
        NetSellValue: row.NetSellValue || 0,
        NetSellAvg: row.NetSellAvg || 0,
        NetSellFreq: row.NetSellFreq || 0,
        NetSellOrdNum: row.NetSellOrdNum || 0,
        NSLot: row.NSLot || 0,
        NSLotPerFreq: row.NSLotPerFreq || 0,
        NSLotPerOrdNum: row.NSLotPerOrdNum || 0
      });
    }

    return brokerData;
  }

  /**
   * Convert BrokerTransactionData array to CSV string
   */
  private convertToCSV(data: BrokerTransactionData[]): string {
    if (data.length === 0) {
      return 'Emiten,BuyerVol,BuyerValue,BuyerAvg,BuyerFreq,OldBuyerOrdNum,BuyerOrdNum,BLot,BLotPerFreq,BLotPerOrdNum,SellerVol,SellerValue,SellerAvg,SellerFreq,OldSellerOrdNum,SellerOrdNum,SLot,SLotPerFreq,SLotPerOrdNum,NetBuyVol,NetBuyValue,NetBuyAvg,NetBuyFreq,NetBuyOrdNum,NBLot,NBLotPerFreq,NBLotPerOrdNum,NetSellVol,NetSellValue,NetSellAvg,NetSellFreq,NetSellOrdNum,NSLot,NSLotPerFreq,NSLotPerOrdNum\n';
    }

    const headers = ['Emiten', 'BuyerVol', 'BuyerValue', 'BuyerAvg', 'BuyerFreq', 'OldBuyerOrdNum', 'BuyerOrdNum', 'BLot', 'BLotPerFreq', 'BLotPerOrdNum',
                     'SellerVol', 'SellerValue', 'SellerAvg', 'SellerFreq', 'OldSellerOrdNum', 'SellerOrdNum', 'SLot', 'SLotPerFreq', 'SLotPerOrdNum',
                     'NetBuyVol', 'NetBuyValue', 'NetBuyAvg', 'NetBuyFreq', 'NetBuyOrdNum', 'NBLot', 'NBLotPerFreq', 'NBLotPerOrdNum',
                     'NetSellVol', 'NetSellValue', 'NetSellAvg', 'NetSellFreq', 'NetSellOrdNum', 'NSLot', 'NSLotPerFreq', 'NSLotPerOrdNum'];
    
    const csvLines = [
      headers.join(','),
      ...data.map(row => 
        headers.map(header => row[header as keyof BrokerTransactionData]).join(',')
      )
    ];

    return csvLines.join('\n');
  }

  /**
   * Aggregate broker transaction data across all emiten
   * Aggregates all Emiten rows into a single row (IDX = aggregate of all stocks)
   */
  private aggregateBrokerData(allBrokerData: BrokerTransactionData[]): BrokerTransactionData {
    // Sum all data across all emiten
    const aggregated: BrokerTransactionData = {
      Emiten: 'IDX', // Aggregate index name
      BuyerVol: 0,
      BuyerValue: 0,
      BuyerAvg: 0,
      BuyerFreq: 0,
      OldBuyerOrdNum: 0,
      BuyerOrdNum: 0,
      BLot: 0,
      BLotPerFreq: 0,
      BLotPerOrdNum: 0,
      SellerVol: 0,
      SellerValue: 0,
      SellerAvg: 0,
      SellerFreq: 0,
      OldSellerOrdNum: 0,
      SellerOrdNum: 0,
      SLot: 0,
      SLotPerFreq: 0,
      SLotPerOrdNum: 0,
      NetBuyVol: 0,
      NetBuyValue: 0,
      NetBuyAvg: 0,
      NetBuyFreq: 0,
      NetBuyOrdNum: 0,
      NBLot: 0,
      NBLotPerFreq: 0,
      NBLotPerOrdNum: 0,
      NetSellVol: 0,
      NetSellValue: 0,
      NetSellAvg: 0,
      NetSellFreq: 0,
      NetSellOrdNum: 0,
      NSLot: 0,
      NSLotPerFreq: 0,
      NSLotPerOrdNum: 0
    };

    // Sum all volumes, values, and counts
    allBrokerData.forEach(row => {
      aggregated.BuyerVol += row.BuyerVol || 0;
      aggregated.BuyerValue += row.BuyerValue || 0;
      aggregated.BuyerFreq += row.BuyerFreq || 0;
      aggregated.OldBuyerOrdNum += row.OldBuyerOrdNum || 0;
      aggregated.BuyerOrdNum += row.BuyerOrdNum || 0;
      aggregated.BLot += row.BLot || 0;
      
      aggregated.SellerVol += row.SellerVol || 0;
      aggregated.SellerValue += row.SellerValue || 0;
      aggregated.SellerFreq += row.SellerFreq || 0;
      aggregated.OldSellerOrdNum += row.OldSellerOrdNum || 0;
      aggregated.SellerOrdNum += row.SellerOrdNum || 0;
      aggregated.SLot += row.SLot || 0;
      
      aggregated.NetBuyVol += row.NetBuyVol || 0;
      aggregated.NetBuyValue += row.NetBuyValue || 0;
      aggregated.NetBuyFreq += row.NetBuyFreq || 0;
      aggregated.NetBuyOrdNum += row.NetBuyOrdNum || 0;
      aggregated.NBLot += row.NBLot || 0;
      
      aggregated.NetSellVol += row.NetSellVol || 0;
      aggregated.NetSellValue += row.NetSellValue || 0;
      aggregated.NetSellFreq += row.NetSellFreq || 0;
      aggregated.NetSellOrdNum += row.NetSellOrdNum || 0;
      aggregated.NSLot += row.NSLot || 0;
    });

    // Recalculate averages from aggregated totals
    aggregated.BuyerAvg = aggregated.BuyerVol > 0 ? aggregated.BuyerValue / aggregated.BuyerVol : 0;
    aggregated.SellerAvg = aggregated.SellerVol > 0 ? aggregated.SellerValue / aggregated.SellerVol : 0;
    aggregated.NetBuyAvg = aggregated.NetBuyVol > 0 ? aggregated.NetBuyValue / aggregated.NetBuyVol : 0;
    aggregated.NetSellAvg = aggregated.NetSellVol > 0 ? aggregated.NetSellValue / aggregated.NetSellVol : 0;

    // Recalculate lot per frequency and lot per order number
    aggregated.BLotPerFreq = aggregated.BuyerFreq > 0 ? aggregated.BLot / aggregated.BuyerFreq : 0;
    aggregated.BLotPerOrdNum = aggregated.BuyerOrdNum > 0 ? aggregated.BLot / aggregated.BuyerOrdNum : 0;
    aggregated.SLotPerFreq = aggregated.SellerFreq > 0 ? aggregated.SLot / aggregated.SellerFreq : 0;
    aggregated.SLotPerOrdNum = aggregated.SellerOrdNum > 0 ? aggregated.SLot / aggregated.SellerOrdNum : 0;
    aggregated.NBLotPerFreq = Math.abs(aggregated.NetBuyFreq) > 0 ? aggregated.NBLot / Math.abs(aggregated.NetBuyFreq) : 0;
    aggregated.NBLotPerOrdNum = Math.abs(aggregated.NetBuyOrdNum) > 0 ? aggregated.NBLot / Math.abs(aggregated.NetBuyOrdNum) : 0;
    aggregated.NSLotPerFreq = Math.abs(aggregated.NetSellFreq) > 0 ? aggregated.NSLot / Math.abs(aggregated.NetSellFreq) : 0;
    aggregated.NSLotPerOrdNum = Math.abs(aggregated.NetSellOrdNum) > 0 ? aggregated.NSLot / Math.abs(aggregated.NetSellOrdNum) : 0;

    return aggregated;
  }

  /**
   * Generate IDX.csv for a specific date and optional parameters
   * Aggregates all emiten from all brokers in the folder into one IDX.csv file
   * @param dateSuffix Date string in format YYYYMMDD
   * @param investorType Optional: 'D' (Domestik), 'F' (Foreign), or '' (all)
   * @param marketType Optional: 'RG', 'TN', 'NG', or '' (all)
   */
  public async generateIDX(
    dateSuffix: string, 
    investorType: 'D' | 'F' | '' = '',
    marketType: 'RG' | 'TN' | 'NG' | '' = ''
  ): Promise<{ success: boolean; message: string; file?: string }> {
    try {
      // Validate dateSuffix format (YYYYMMDD - 8 digits)
      if (!dateSuffix || !/^\d{8}$/.test(dateSuffix)) {
        const errorMsg = `Invalid dateSuffix format: ${dateSuffix}. Expected YYYYMMDD (8 digits)`;
        console.error(`❌ ${errorMsg}`);
        return {
          success: false,
          message: errorMsg
        };
      }

      // Validate investorType
      if (investorType && !['D', 'F', ''].includes(investorType)) {
        const errorMsg = `Invalid investorType: ${investorType}. Expected 'D', 'F', or ''`;
        console.error(`❌ ${errorMsg}`);
        return {
          success: false,
          message: errorMsg
        };
      }

      // Validate marketType
      if (marketType && !['RG', 'TN', 'NG', ''].includes(marketType)) {
        const errorMsg = `Invalid marketType: ${marketType}. Expected 'RG', 'TN', 'NG', or ''`;
        console.error(`❌ ${errorMsg}`);
        return {
          success: false,
          message: errorMsg
        };
      }

      // Determine folder path based on parameters
      let folderPrefix: string;
      if (investorType && marketType) {
        // broker_transaction/broker_transaction_{inv}_{market}_{date}/
        const invPrefix = investorType === 'D' ? 'd' : 'f';
        const marketLower = marketType.toLowerCase();
        folderPrefix = `broker_transaction/broker_transaction_${invPrefix}_${marketLower}_${dateSuffix}`;
      } else if (investorType) {
        // broker_transaction/broker_transaction_{inv}_{date}/
        const invPrefix = investorType === 'D' ? 'd' : 'f';
        folderPrefix = `broker_transaction/broker_transaction_${invPrefix}_${dateSuffix}`;
      } else if (marketType) {
        // broker_transaction/broker_transaction_{market}_{date}/
        const marketLower = marketType.toLowerCase();
        folderPrefix = `broker_transaction/broker_transaction_${marketLower}_${dateSuffix}`;
      } else {
        // broker_transaction/broker_transaction_{date}/
        folderPrefix = `broker_transaction/broker_transaction_${dateSuffix}`;
      }

      // Check if IDX.csv already exists - skip if exists
      const idxFilePath = `${folderPrefix}/IDX.csv`;
      try {
        const idxExists = await exists(idxFilePath);
        if (idxExists) {
          console.log(`⏭️ Skipping ${idxFilePath} - IDX.csv already exists`);
          return {
            success: true,
            message: `IDX.csv already exists for ${dateSuffix} (${investorType || 'all'}, ${marketType || 'all'})`,
            file: idxFilePath
          };
        }
      } catch (error) {
        // If check fails, continue with generation
        console.log(`ℹ️ Could not check existence of ${idxFilePath}, proceeding with generation`);
      }

      // List all broker CSV files in the folder
      console.log(`🔍 Scanning for broker CSV files in: ${folderPrefix}/`);
      const allFiles = await listPaths({ prefix: `${folderPrefix}/` });
      
      // Filter for CSV files with broker codes (2-3 uppercase letters)
      // Exclude IDX.csv itself
      const brokerFiles = allFiles.filter(file => {
        const fileName = file.split('/').pop() || '';
        if (!fileName.endsWith('.csv')) return false;
        if (fileName.toUpperCase() === 'IDX.CSV') return false;
        
        const brokerCode = fileName.replace('.csv', '');
        // Only include valid broker codes (2-3 uppercase letters)
        return brokerCode.length >= 2 && brokerCode.length <= 3 && /^[A-Z]+$/.test(brokerCode);
      });

      if (brokerFiles.length === 0) {
        console.log(`⚠️ No broker CSV files found in ${folderPrefix}/`);
        return {
          success: false,
          message: `No broker CSV files found in ${folderPrefix}/`
        };
      }

      console.log(`📊 Found ${brokerFiles.length} broker CSV files`);

      // Batch processing configuration
      const BATCH_SIZE = 50; // Process 50 broker files at a time to manage memory

      // Read and parse all broker CSV files in batches
      const allBrokerData: BrokerTransactionData[] = [];
      
      for (let i = 0; i < brokerFiles.length; i += BATCH_SIZE) {
        const batch = brokerFiles.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(brokerFiles.length / BATCH_SIZE);
        
        console.log(`📦 Processing broker batch ${batchNum}/${totalBatches} (${batch.length} files)...`);
        
        // Process batch in parallel
        const batchResults = await Promise.allSettled(
          batch.map(async (file) => {
            try {
              const csvContent = await downloadText(file);
              const brokerData = this.parseCSV(csvContent);
              const brokerCode = file.split('/').pop()?.replace('.csv', '') || 'unknown';
              return { brokerCode, brokerData, success: true };
            } catch (error: any) {
              const brokerCode = file.split('/').pop()?.replace('.csv', '') || 'unknown';
              console.warn(`  ⚠️ Failed to process ${brokerCode}: ${error.message}`);
              return { brokerCode, brokerData: [], success: false };
            }
          })
        );
        
        // Collect results from batch (aggregate all emiten from all brokers)
        batchResults.forEach((result) => {
          if (result.status === 'fulfilled' && result.value.success) {
            allBrokerData.push(...result.value.brokerData);
            console.log(`  ✓ Processed ${result.value.brokerCode}: ${result.value.brokerData.length} emiten`);
          }
        });
        
        // Small delay between batches to prevent overwhelming the system
        if (i + BATCH_SIZE < brokerFiles.length) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }

      if (allBrokerData.length === 0) {
        console.log(`⚠️ No broker data found in any broker files`);
        return {
          success: false,
          message: `No broker data found in broker files`
        };
      }

      console.log(`📈 Total emiten records across all brokers: ${allBrokerData.length}`);

      // Aggregate all emiten data into IDX (single row aggregating all emiten from all brokers)
      const aggregatedData = this.aggregateBrokerData(allBrokerData);
      console.log(`📊 Aggregated to IDX (1 row from ${allBrokerData.length} emiten records)`);

      // Convert to CSV (single row)
      const csvContentOutput = this.convertToCSV([aggregatedData]);

      // Save IDX.csv to the same folder
      await uploadText(idxFilePath, csvContentOutput, 'text/csv');

      console.log(`✅ Successfully created ${idxFilePath} with aggregated IDX data`);

      return {
        success: true,
        message: `IDX.csv created successfully with ${allBrokerData.length} emiten records aggregated from ${brokerFiles.length} brokers`,
        file: idxFilePath
      };
    } catch (error: any) {
      console.error(`❌ Error generating IDX.csv:`, error);
      return {
        success: false,
        message: `Failed to generate IDX.csv: ${error.message}`
      };
    }
  }

  /**
   * Generate IDX.csv for multiple dates (batch processing)
   * @param dateSuffixes Array of date strings in format YYYYMMDD
   * @param investorType Optional: 'D' (Domestik), 'F' (Foreign), or '' (all)
   * @param marketType Optional: 'RG', 'TN', 'NG', or '' (all)
   */
  public async generateIDXBatch(
    dateSuffixes: string[],
    investorType: 'D' | 'F' | '' = '',
    marketType: 'RG' | 'TN' | 'NG' | '' = ''
  ): Promise<{ success: number; failed: number; skipped: number; results: Array<{ date: string; success: boolean; message: string; file?: string; skipped?: boolean }> }> {
    const results: Array<{ date: string; success: boolean; message: string; file?: string; skipped?: boolean }> = [];
    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    console.log(`📊 Processing ${dateSuffixes.length} dates for IDX files`);

    for (let i = 0; i < dateSuffixes.length; i++) {
      const dateSuffixRaw = dateSuffixes[i];
      
      // Skip if dateSuffix is undefined or empty
      if (!dateSuffixRaw || typeof dateSuffixRaw !== 'string' || dateSuffixRaw.trim() === '') {
        console.warn(`⚠️ Skipping invalid date at index ${i}: ${dateSuffixRaw}`);
        continue;
      }
      
      const dateSuffix: string = dateSuffixRaw;
      const progress = `[${i + 1}/${dateSuffixes.length}]`;
      
      try {
        console.log(`${progress} Processing date ${dateSuffix}...`);
        const result = await this.generateIDX(dateSuffix, investorType, marketType);
        
        // Check if skipped (already exists)
        const skipped = result.message.includes('already exists');
        
        results.push({
          date: dateSuffix,
          ...result,
          skipped
        });

        if (skipped) {
          skippedCount++;
          console.log(`${progress} ✅ ${dateSuffix}: Skipped (already exists)`);
        } else if (result.success) {
          successCount++;
          console.log(`${progress} ✅ ${dateSuffix}: Success`);
        } else {
          failedCount++;
          console.log(`${progress} ❌ ${dateSuffix}: Failed - ${result.message}`);
        }
      } catch (error: any) {
        failedCount++;
        const errorMsg = error?.message || 'Unknown error';
        console.error(`${progress} ❌ ${dateSuffix}: Error - ${errorMsg}`);
        results.push({
          date: dateSuffix,
          success: false,
          message: `Error: ${errorMsg}`,
          skipped: false
        });
      }
    }

    console.log(`📊 Batch completed: ${successCount} success, ${skippedCount} skipped, ${failedCount} failed`);

    return {
      success: successCount,
      failed: failedCount,
      skipped: skippedCount,
      results
    };
  }
}

