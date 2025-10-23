import { downloadText, uploadText, listPaths } from '../../utils/azureBlob';

// Type definitions for bid/ask footprint data
interface TransactionData {
  STK_CODE: string;
  BRK_COD1: string; // Seller broker (bid side)
  BRK_COD2: string; // Buyer broker (ask side)
  STK_VOLM: number;
  STK_PRIC: number;
  TRX_CODE: string;
  TRX_TIME: string;
  TRX_ORD1: number; // Order reference 1
  TRX_ORD2: number; // Order reference 2
}

interface PriceLevelData {
  Price: number;
  BidVolume: number;  // Volume dari BRK_COD1 (seller)
  AskVolume: number;  // Volume dari BRK_COD2 (buyer)
  NetVolume: number;  // AskVolume - BidVolume
  TotalVolume: number; // BidVolume + AskVolume
  BidCount: number;   // Jumlah transaksi bid
  AskCount: number;   // Jumlah transaksi ask
}

interface BrokerFootprintData {
  BrokerCode: string;
  StockCode: string;
  Price: number;
  BidVolume: number;  // Volume yang dijual oleh broker ini
  AskVolume: number;  // Volume yang dibeli oleh broker ini
  NetVolume: number;  // AskVolume - BidVolume
  TotalVolume: number;
  BidCount: number;
  AskCount: number;
  AvgBidPrice: number;
  AvgAskPrice: number;
}

interface StockFootprintData {
  StockCode: string;
  Price: number;
  BidVolume: number;  // Total volume bid di level harga ini
  AskVolume: number;  // Total volume ask di level harga ini
  NetVolume: number;  // AskVolume - BidVolume
  TotalVolume: number;
  BidCount: number;
  AskCount: number;
  UniqueBidBrokers: number; // Jumlah broker unik yang bid
  UniqueAskBrokers: number; // Jumlah broker unik yang ask
}

export class BidAskCalculator {
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
        stkVolmIndex === -1 || stkPricIndex === -1 || trxCodeIndex === -1) {
      console.error('❌ Required columns not found in CSV header');
      return data;
    }
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line || line.trim().length === 0) continue;
      
      const values = line.split(';');
      if (values.length < header.length) continue;
      
      const transaction: TransactionData = {
        STK_CODE: values[stkCodeIndex]?.trim() || '',
        BRK_COD1: values[brkCod1Index]?.trim() || '',
        BRK_COD2: values[brkCod2Index]?.trim() || '',
        STK_VOLM: parseFloat(values[stkVolmIndex]?.trim() || '0') || 0,
        STK_PRIC: parseFloat(values[stkPricIndex]?.trim() || '0') || 0,
        TRX_CODE: values[trxCodeIndex]?.trim() || '',
        TRX_TIME: trxTimeIndex !== -1 ? values[trxTimeIndex]?.trim() || '' : '',
        TRX_ORD1: trxOrd1Index !== -1 ? parseFloat(values[trxOrd1Index]?.trim() || '0') || 0 : 0,
        TRX_ORD2: trxOrd2Index !== -1 ? parseFloat(values[trxOrd2Index]?.trim() || '0') || 0 : 0
      };
      
      data.push(transaction);
    }
    
    console.log(`📊 Loaded ${data.length} transaction records from Azure`);
    return data;
  }

  /**
   * Create bid/ask footprint data by broker
   */
  private createBrokerFootprintData(data: TransactionData[]): BrokerFootprintData[] {
    console.log("\nCreating broker footprint data...");
    
    // Group data by broker, stock, and price level
    const brokerStockPriceMap = new Map<string, Map<string, Map<number, {
      bidVolume: number;
      askVolume: number;
      bidCount: number;
      askCount: number;
      bidPriceSum: number;
      askPriceSum: number;
    }>>>();
    
    data.forEach(row => {
      const stock = row.STK_CODE;
      const price = row.STK_PRIC;
      const volume = row.STK_VOLM;
      const isBid = row.TRX_ORD1 > row.TRX_ORD2; // HAKA -> BID, HAKI -> ASK

      const targetBroker = isBid ? row.BRK_COD1 : row.BRK_COD2; // seller for BID, buyer for ASK
      if (!brokerStockPriceMap.has(targetBroker)) {
        brokerStockPriceMap.set(targetBroker, new Map());
      }
      const brokerMap = brokerStockPriceMap.get(targetBroker)!;
      if (!brokerMap.has(stock)) {
        brokerMap.set(stock, new Map());
      }
      const stockMap = brokerMap.get(stock)!;
      if (!stockMap.has(price)) {
        stockMap.set(price, {
          bidVolume: 0,
          askVolume: 0,
          bidCount: 0,
          askCount: 0,
          bidPriceSum: 0,
          askPriceSum: 0
        });
      }
      const rec = stockMap.get(price)!;
      if (isBid) {
        rec.bidVolume += volume;
        rec.bidCount += 1;
        rec.bidPriceSum += price * volume;
      } else {
        rec.askVolume += volume;
        rec.askCount += 1;
        rec.askPriceSum += price * volume;
      }
    });
    
    // Convert to array format
    const brokerFootprintData: BrokerFootprintData[] = [];
    
    brokerStockPriceMap.forEach((stockMap, broker) => {
      stockMap.forEach((priceMap, stock) => {
        priceMap.forEach((priceData, price) => {
          const avgBidPrice = priceData.bidVolume > 0 ? priceData.bidPriceSum / priceData.bidVolume : 0;
          const avgAskPrice = priceData.askVolume > 0 ? priceData.askPriceSum / priceData.askVolume : 0;
          
          brokerFootprintData.push({
            BrokerCode: broker,
            StockCode: stock,
            Price: price,
            BidVolume: priceData.bidVolume,
            AskVolume: priceData.askVolume,
            NetVolume: priceData.askVolume - priceData.bidVolume,
            TotalVolume: priceData.bidVolume + priceData.askVolume,
            BidCount: priceData.bidCount,
            AskCount: priceData.askCount,
            AvgBidPrice: avgBidPrice,
            AvgAskPrice: avgAskPrice
          });
        });
      });
    });
    
    // Sort by broker code, then by stock code, then by price
    brokerFootprintData.sort((a, b) => {
      if (a.BrokerCode !== b.BrokerCode) {
        return a.BrokerCode.localeCompare(b.BrokerCode);
      }
      if (a.StockCode !== b.StockCode) {
        return a.StockCode.localeCompare(b.StockCode);
      }
      return a.Price - b.Price;
    });
    
    console.log(`Broker footprint data created with ${brokerFootprintData.length} records`);
    return brokerFootprintData;
  }

  /**
   * Create bid/ask footprint data by stock
   */
  private createStockFootprintData(data: TransactionData[]): StockFootprintData[] {
    console.log("\nCreating stock footprint data...");
    
    // Group data by stock and price level
    const stockPriceMap = new Map<string, Map<number, {
      bidVolume: number;
      askVolume: number;
      bidCount: number;
      askCount: number;
      bidBrokers: Set<string>;
      askBrokers: Set<string>;
    }>>();
    
    data.forEach(row => {
      const stock = row.STK_CODE;
      const price = row.STK_PRIC;
      const volume = row.STK_VOLM;
      const isBid = row.TRX_ORD1 > row.TRX_ORD2; // HAKA -> BID, HAKI -> ASK
      
      if (!stockPriceMap.has(stock)) {
        stockPriceMap.set(stock, new Map());
      }
      const stockMap = stockPriceMap.get(stock)!;
      if (!stockMap.has(price)) {
        stockMap.set(price, {
          bidVolume: 0,
          askVolume: 0,
          bidCount: 0,
          askCount: 0,
          bidBrokers: new Set(),
          askBrokers: new Set()
        });
      }
      const priceData = stockMap.get(price)!;
      
      // Klasifikasi BID/ASK berdasarkan HAKA/HAKI
      if (isBid) {
        priceData.bidVolume += volume;
        priceData.bidCount += 1;
        if (row.BRK_COD1) priceData.bidBrokers.add(row.BRK_COD1);
      } else {
        priceData.askVolume += volume;
        priceData.askCount += 1;
        if (row.BRK_COD2) priceData.askBrokers.add(row.BRK_COD2);
      }
    });
    
    // Convert to array format
    const stockFootprintData: StockFootprintData[] = [];
    
    stockPriceMap.forEach((priceMap, stock) => {
      priceMap.forEach((priceData, price) => {
        stockFootprintData.push({
          StockCode: stock,
          Price: price,
          BidVolume: priceData.bidVolume,
          AskVolume: priceData.askVolume,
          NetVolume: priceData.askVolume - priceData.bidVolume,
          TotalVolume: priceData.bidVolume + priceData.askVolume,
          BidCount: priceData.bidCount,
          AskCount: priceData.askCount,
          UniqueBidBrokers: priceData.bidBrokers.size,
          UniqueAskBrokers: priceData.askBrokers.size
        });
      });
    });
    
    // Sort by stock code, then by price
    stockFootprintData.sort((a, b) => {
      if (a.StockCode !== b.StockCode) {
        return a.StockCode.localeCompare(b.StockCode);
      }
      return a.Price - b.Price;
    });
    
    console.log(`Stock footprint data created with ${stockFootprintData.length} records`);
    return stockFootprintData;
  }

  /**
   * Create price level summary data
   */
  private createPriceLevelSummary(data: TransactionData[]): PriceLevelData[] {
    console.log("\nCreating price level summary...");
    
    const priceMap = new Map<number, {
      bidVolume: number;
      askVolume: number;
      bidCount: number;
      askCount: number;
    }>();
    
    data.forEach(row => {
      const price = row.STK_PRIC;
      const volume = row.STK_VOLM;
      const isBid = row.TRX_ORD1 > row.TRX_ORD2; // HAKA -> BID, HAKI -> ASK
      
      if (!priceMap.has(price)) {
        priceMap.set(price, {
          bidVolume: 0,
          askVolume: 0,
          bidCount: 0,
          askCount: 0
        });
      }
      
      const priceData = priceMap.get(price)!;
      if (isBid) {
        priceData.bidVolume += volume;
        priceData.bidCount += 1;
      } else {
        priceData.askVolume += volume;
        priceData.askCount += 1;
      }
    });
    
    // Convert to array format
    const priceLevelData: PriceLevelData[] = [];
    
    priceMap.forEach((priceData, price) => {
      priceLevelData.push({
        Price: price,
        BidVolume: priceData.bidVolume,
        AskVolume: priceData.askVolume,
        NetVolume: priceData.askVolume - priceData.bidVolume,
        TotalVolume: priceData.bidVolume + priceData.askVolume,
        BidCount: priceData.bidCount,
        AskCount: priceData.askCount
      });
    });
    
    // Sort by price
    priceLevelData.sort((a, b) => a.Price - b.Price);
    
    console.log(`Price level summary created with ${priceLevelData.length} price levels`);
    return priceLevelData;
  }

  /**
   * Save data to Azure Blob Storage
   */
  private async saveToAzure(filename: string, data: any[]): Promise<void> {
    if (data.length === 0) {
      console.log(`No data to save for ${filename}`);
      return;
    }
    
    // Convert to CSV format
    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row => headers.map(header => row[header]).join(','))
    ].join('\n');
    
    await uploadText(filename, csvContent, 'text/csv');
    console.log(`Saved ${data.length} records to ${filename}`);
  }


  /**
   * Process a single DT file with all bid/ask analysis
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
      // Create all analysis types in parallel for speed
      const [brokerFootprint, stockFootprint, priceLevelSummary] = await Promise.all([
        Promise.resolve(this.createBrokerFootprintData(data)),
        Promise.resolve(this.createStockFootprintData(data)),
        Promise.resolve(this.createPriceLevelSummary(data))
      ]);
      
      // Save results to Azure in parallel
      const basePath = `bid_ask/bid_ask_${dateSuffix}`;
      await Promise.all([
        this.saveToAzure(`${basePath}/price_level_summary.csv`, priceLevelSummary),
        this.saveToAzure(`${basePath}/by_stock.csv`, stockFootprint),
        this.saveToAzure(`${basePath}/by_broker.csv`, brokerFootprint)
      ]);
      
      const allFiles = [
        `${basePath}/price_level_summary.csv`,
        `${basePath}/by_stock.csv`,
        `${basePath}/by_broker.csv`
      ];
      
      console.log(`✅ Completed processing ${blobName} - ${allFiles.length} files created`);
      return { success: true, dateSuffix, files: allFiles };
      
    } catch (error) {
      console.error(`Error processing ${blobName}:`, error);
      return { success: false, dateSuffix, files: [] };
    }
  }

  /**
   * Main function to generate bid/ask footprint data for all DT files
   */
  public async generateBidAskData(_dateSuffix: string): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      console.log(`Starting bid/ask footprint analysis for all DT files...`);
      
      // Find all DT files
      const dtFiles = await this.findAllDtFiles();
      
      if (dtFiles.length === 0) {
        console.log(`⚠️ No DT files found in done-summary folder`);
        return {
          success: true,
          message: `No DT files found - skipped bid/ask calculation`,
          data: { skipped: true, reason: 'No DT files found' }
        };
      }
      
      console.log(`📊 Processing ${dtFiles.length} DT files...`);
      
      // Process files in batches for speed (5 files at a time)
      const BATCH_SIZE = 5;
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
      
      console.log(`✅ Bid/Ask footprint analysis completed!`);
      console.log(`📊 Processed: ${processed}/${dtFiles.length} DT files`);
      console.log(`📊 Successful: ${successful}/${processed} files`);
      console.log(`📊 Total output files: ${totalFiles}`);
      
      return {
        success: true,
        message: `Bid/ask footprint data generated successfully for ${successful}/${processed} DT files`,
        data: {
          totalDtFiles: dtFiles.length,
          processedFiles: processed,
          successfulFiles: successful,
          totalOutputFiles: totalFiles,
          results: allResults.filter(r => r.success)
        }
      };
      
    } catch (error) {
      console.error('Error generating bid/ask footprint data:', error);
      return {
        success: false,
        message: `Failed to generate bid/ask footprint data: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}

export default BidAskCalculator;
