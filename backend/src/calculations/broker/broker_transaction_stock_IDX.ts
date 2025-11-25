import { downloadText, uploadText, listPaths, exists } from '../../utils/azureBlob';

// Type definitions - same as broker_transaction_stock.ts
interface BrokerTransactionData {
  Broker: string; // Changed from Emiten - now we list brokers for each stock
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

export class BrokerTransactionStockIDXCalculator {
  constructor() {}

  /**
   * Read CSV file and parse broker transaction data (stock pivot format)
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
        Broker: row.Broker || '',
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
      return 'Broker,BuyerVol,BuyerValue,BuyerAvg,BuyerFreq,OldBuyerOrdNum,BuyerOrdNum,BLot,BLotPerFreq,BLotPerOrdNum,SellerVol,SellerValue,SellerAvg,SellerFreq,OldSellerOrdNum,SellerOrdNum,SLot,SLotPerFreq,SLotPerOrdNum,NetBuyVol,NetBuyValue,NetBuyAvg,NetBuyFreq,NetBuyOrdNum,NBLot,NBLotPerFreq,NBLotPerOrdNum,NetSellVol,NetSellValue,NetSellAvg,NetSellFreq,NetSellOrdNum,NSLot,NSLotPerFreq,NSLotPerOrdNum\n';
    }

    const headers = ['Broker', 'BuyerVol', 'BuyerValue', 'BuyerAvg', 'BuyerFreq', 'OldBuyerOrdNum', 'BuyerOrdNum', 'BLot', 'BLotPerFreq', 'BLotPerOrdNum',
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
   * Aggregate broker transaction data across all stocks
   * Aggregates all Broker rows from all stock files into a single IDX row per broker
   */
  private aggregateBrokerData(allBrokerData: BrokerTransactionData[]): BrokerTransactionData[] {
    // Map to aggregate data per broker
    const brokerMap = new Map<string, {
      BuyerVol: number;
      BuyerValue: number;
      BuyerFreq: number;
      OldBuyerOrdNum: number;
      BuyerOrdNum: number;
      BLot: number;
      SellerVol: number;
      SellerValue: number;
      SellerFreq: number;
      OldSellerOrdNum: number;
      SellerOrdNum: number;
      SLot: number;
      NetBuyVol: number;
      NetBuyValue: number;
      NetBuyFreq: number;
      NetBuyOrdNum: number;
      NBLot: number;
      NetSellVol: number;
      NetSellValue: number;
      NetSellFreq: number;
      NetSellOrdNum: number;
      NSLot: number;
    }>();

    // Sum all data per broker
    allBrokerData.forEach(row => {
      const broker = row.Broker;
      if (!broker) return;

      const existing = brokerMap.get(broker);
      if (existing) {
        existing.BuyerVol += row.BuyerVol || 0;
        existing.BuyerValue += row.BuyerValue || 0;
        existing.BuyerFreq += row.BuyerFreq || 0;
        existing.OldBuyerOrdNum += row.OldBuyerOrdNum || 0;
        existing.BuyerOrdNum += row.BuyerOrdNum || 0;
        existing.BLot += row.BLot || 0;
        existing.SellerVol += row.SellerVol || 0;
        existing.SellerValue += row.SellerValue || 0;
        existing.SellerFreq += row.SellerFreq || 0;
        existing.OldSellerOrdNum += row.OldSellerOrdNum || 0;
        existing.SellerOrdNum += row.SellerOrdNum || 0;
        existing.SLot += row.SLot || 0;
        existing.NetBuyVol += row.NetBuyVol || 0;
        existing.NetBuyValue += row.NetBuyValue || 0;
        existing.NetBuyFreq += row.NetBuyFreq || 0;
        existing.NetBuyOrdNum += row.NetBuyOrdNum || 0;
        existing.NBLot += row.NBLot || 0;
        existing.NetSellVol += row.NetSellVol || 0;
        existing.NetSellValue += row.NetSellValue || 0;
        existing.NetSellFreq += row.NetSellFreq || 0;
        existing.NetSellOrdNum += row.NetSellOrdNum || 0;
        existing.NSLot += row.NSLot || 0;
      } else {
        brokerMap.set(broker, {
          BuyerVol: row.BuyerVol || 0,
          BuyerValue: row.BuyerValue || 0,
          BuyerFreq: row.BuyerFreq || 0,
          OldBuyerOrdNum: row.OldBuyerOrdNum || 0,
          BuyerOrdNum: row.BuyerOrdNum || 0,
          BLot: row.BLot || 0,
          SellerVol: row.SellerVol || 0,
          SellerValue: row.SellerValue || 0,
          SellerFreq: row.SellerFreq || 0,
          OldSellerOrdNum: row.OldSellerOrdNum || 0,
          SellerOrdNum: row.SellerOrdNum || 0,
          SLot: row.SLot || 0,
          NetBuyVol: row.NetBuyVol || 0,
          NetBuyValue: row.NetBuyValue || 0,
          NetBuyFreq: row.NetBuyFreq || 0,
          NetBuyOrdNum: row.NetBuyOrdNum || 0,
          NBLot: row.NBLot || 0,
          NetSellVol: row.NetSellVol || 0,
          NetSellValue: row.NetSellValue || 0,
          NetSellFreq: row.NetSellFreq || 0,
          NetSellOrdNum: row.NetSellOrdNum || 0,
          NSLot: row.NSLot || 0
        });
      }
    });

    // Convert aggregated data to BrokerTransactionData array and calculate averages
    const aggregatedSummary: BrokerTransactionData[] = [];
    brokerMap.forEach((data, broker) => {
      // Recalculate averages from aggregated totals
      const buyerAvg = data.BuyerVol > 0 ? data.BuyerValue / data.BuyerVol : 0;
      const sellerAvg = data.SellerVol > 0 ? data.SellerValue / data.SellerVol : 0;
      const netBuyAvg = data.NetBuyVol > 0 ? data.NetBuyValue / data.NetBuyVol : 0;
      const netSellAvg = data.NetSellVol > 0 ? data.NetSellValue / data.NetSellVol : 0;

      // Recalculate lot per frequency and lot per order number
      const bLotPerFreq = data.BuyerFreq > 0 ? data.BLot / data.BuyerFreq : 0;
      const bLotPerOrdNum = data.BuyerOrdNum > 0 ? data.BLot / data.BuyerOrdNum : 0;
      const sLotPerFreq = data.SellerFreq > 0 ? data.SLot / data.SellerFreq : 0;
      const sLotPerOrdNum = data.SellerOrdNum > 0 ? data.SLot / data.SellerOrdNum : 0;
      const nbLotPerFreq = Math.abs(data.NetBuyFreq) > 0 ? data.NBLot / Math.abs(data.NetBuyFreq) : 0;
      const nbLotPerOrdNum = Math.abs(data.NetBuyOrdNum) > 0 ? data.NBLot / Math.abs(data.NetBuyOrdNum) : 0;
      const nsLotPerFreq = Math.abs(data.NetSellFreq) > 0 ? data.NSLot / Math.abs(data.NetSellFreq) : 0;
      const nsLotPerOrdNum = Math.abs(data.NetSellOrdNum) > 0 ? data.NSLot / Math.abs(data.NetSellOrdNum) : 0;

      aggregatedSummary.push({
        Broker: broker,
        BuyerVol: data.BuyerVol,
        BuyerValue: data.BuyerValue,
        BuyerAvg: buyerAvg,
        BuyerFreq: data.BuyerFreq,
        OldBuyerOrdNum: data.OldBuyerOrdNum,
        BuyerOrdNum: data.BuyerOrdNum,
        BLot: data.BLot,
        BLotPerFreq: bLotPerFreq,
        BLotPerOrdNum: bLotPerOrdNum,
        SellerVol: data.SellerVol,
        SellerValue: data.SellerValue,
        SellerAvg: sellerAvg,
        SellerFreq: data.SellerFreq,
        OldSellerOrdNum: data.OldSellerOrdNum,
        SellerOrdNum: data.SellerOrdNum,
        SLot: data.SLot,
        SLotPerFreq: sLotPerFreq,
        SLotPerOrdNum: sLotPerOrdNum,
        NetBuyVol: data.NetBuyVol,
        NetBuyValue: data.NetBuyValue,
        NetBuyAvg: netBuyAvg,
        NetBuyFreq: data.NetBuyFreq,
        NetBuyOrdNum: data.NetBuyOrdNum,
        NBLot: data.NBLot,
        NBLotPerFreq: nbLotPerFreq,
        NBLotPerOrdNum: nbLotPerOrdNum,
        NetSellVol: data.NetSellVol,
        NetSellValue: data.NetSellValue,
        NetSellAvg: netSellAvg,
        NetSellFreq: data.NetSellFreq,
        NetSellOrdNum: data.NetSellOrdNum,
        NSLot: data.NSLot,
        NSLotPerFreq: nsLotPerFreq,
        NSLotPerOrdNum: nsLotPerOrdNum
      });
    });

    // Sort by NetBuyValue descending
    aggregatedSummary.sort((a, b) => b.NetBuyValue - a.NetBuyValue);

    return aggregatedSummary;
  }

  /**
   * Generate IDX.csv for a specific date and optional parameters
   * Aggregates all brokers from all stocks into one IDX.csv file per folder
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
        // broker_transaction_stock/broker_transaction_stock_{inv}_{market}_{date}/
        const invPrefix = investorType === 'D' ? 'd' : 'f';
        const marketLower = marketType.toLowerCase();
        folderPrefix = `broker_transaction_stock/broker_transaction_stock_${invPrefix}_${marketLower}_${dateSuffix}`;
      } else if (investorType) {
        // broker_transaction_stock/broker_transaction_stock_{inv}_{date}/
        const invPrefix = investorType === 'D' ? 'd' : 'f';
        folderPrefix = `broker_transaction_stock/broker_transaction_stock_${invPrefix}_${dateSuffix}`;
      } else if (marketType) {
        // broker_transaction_stock/broker_transaction_stock_{market}_{date}/
        const marketLower = marketType.toLowerCase();
        folderPrefix = `broker_transaction_stock/broker_transaction_stock_${marketLower}_${dateSuffix}`;
      } else {
        // broker_transaction_stock/broker_transaction_stock_{date}/
        folderPrefix = `broker_transaction_stock/broker_transaction_stock_${dateSuffix}`;
      }

      console.log(`🔍 Scanning for stock CSV files in: ${folderPrefix}/`);

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

      // List all stock CSV files in the folder
      const allFiles = await listPaths({ prefix: `${folderPrefix}/` });
      
      // Filter for CSV files with 4-letter stock codes (e.g., BBCA.csv, BBRI.csv)
      // Exclude IDX.csv itself
      const stockFiles = allFiles.filter(file => {
        const fileName = file.split('/').pop() || '';
        if (!fileName.endsWith('.csv')) return false;
        if (fileName.toUpperCase() === 'IDX.CSV') return false;
        
        const stockCode = fileName.replace('.csv', '');
        // Only include files with exactly 4 uppercase letters
        return stockCode.length === 4 && /^[A-Z]{4}$/.test(stockCode);
      });

      if (stockFiles.length === 0) {
        console.log(`⚠️ No stock CSV files found in ${folderPrefix}/`);
        return {
          success: false,
          message: `No stock CSV files found in ${folderPrefix}/`
        };
      }

      console.log(`📊 Found ${stockFiles.length} stock CSV files`);

      // Batch processing configuration
      const BATCH_SIZE = 50; // Process 50 stock files at a time to manage memory

      // Read and parse all stock CSV files in batches
      const allBrokerData: BrokerTransactionData[] = [];
      
      for (let i = 0; i < stockFiles.length; i += BATCH_SIZE) {
        const batch = stockFiles.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(stockFiles.length / BATCH_SIZE);
        
        console.log(`📦 Processing stock batch ${batchNum}/${totalBatches} (${batch.length} files)...`);
        
        // Process batch in parallel
        const batchResults = await Promise.allSettled(
          batch.map(async (file) => {
            try {
              const csvContent = await downloadText(file);
              const brokerData = this.parseCSV(csvContent);
              const stockCode = file.split('/').pop()?.replace('.csv', '') || 'unknown';
              return { stockCode, brokerData, success: true };
            } catch (error: any) {
              const stockCode = file.split('/').pop()?.replace('.csv', '') || 'unknown';
              console.warn(`  ⚠️ Failed to process ${stockCode}: ${error.message}`);
              return { stockCode, brokerData: [], success: false };
            }
          })
        );
        
        // Collect results from batch (aggregate all brokers from all stocks)
        batchResults.forEach((result) => {
          if (result.status === 'fulfilled' && result.value.success) {
            allBrokerData.push(...result.value.brokerData);
            console.log(`  ✓ Processed ${result.value.stockCode}: ${result.value.brokerData.length} brokers`);
          }
        });
        
        // Small delay between batches to prevent overwhelming the system
        if (i + BATCH_SIZE < stockFiles.length) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }

      if (allBrokerData.length === 0) {
        console.log(`⚠️ No broker data found in any stock files`);
        return {
          success: false,
          message: `No broker data found in stock files`
        };
      }

      console.log(`📈 Total broker records across all stocks: ${allBrokerData.length}`);

      // Aggregate all broker data into IDX (one row per broker, aggregating across all stocks)
      const aggregatedData = this.aggregateBrokerData(allBrokerData);
      console.log(`📊 Aggregated to ${aggregatedData.length} unique brokers in IDX`);

      // Convert to CSV
      const csvContent = this.convertToCSV(aggregatedData);

      // Save IDX.csv to the same folder
      await uploadText(idxFilePath, csvContent, 'text/csv');

      console.log(`✅ Successfully created ${idxFilePath} with ${aggregatedData.length} brokers aggregated from ${stockFiles.length} stocks`);

      return {
        success: true,
        message: `IDX.csv created successfully with ${aggregatedData.length} brokers aggregated from ${stockFiles.length} stocks`,
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

