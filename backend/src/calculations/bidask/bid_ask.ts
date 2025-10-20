import { downloadText, uploadText } from '../../utils/azureBlob';

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
   * Load and process the transaction data from DT file in Azure
   */
  private async loadAndProcessDataFromAzure(dateSuffix: string): Promise<TransactionData[]> {
    console.log(`Loading transaction data for bid/ask analysis from Azure for date: ${dateSuffix}`);
    
    // Try to find data from today back to 20250919
    const today = new Date();
    const targetDate = new Date('2025-09-19');
    
    for (let d = new Date(today); d >= targetDate; d.setDate(d.getDate() - 1)) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const azureDate = `${year}${month}${day}`;
      
      // Convert to YYMMDD format for DT file
      const yy = String(year).substring(2);
      const mm = month;
      const dd = day;
      const dtSuffix = `${yy}${mm}${dd}`;
      
      const blobName = `done-summary/${azureDate}/DT${dtSuffix}.csv`;
      console.log(`Looking for data at: ${blobName}`);
      
      try {
        const content = await downloadText(blobName);
        if (content && content.trim().length > 0) {
          console.log(`✅ Found data at: ${blobName}`);
          return this.parseTransactionData(content);
        }
      } catch (error) {
        // Continue to next date
        continue;
      }
    }
    
    console.log(`⚠️ No data found from today back to 20250919 - skipping bid/ask calculation`);
    return [];
  }

  private parseTransactionData(content: string): TransactionData[] {
    const lines = content.trim().split('\n');
    const data: TransactionData[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line || line.trim().length === 0) continue;
      
      const values = line.split(',');
      if (values.length < 8) continue;
      
      const transaction: TransactionData = {
        STK_CODE: values[1]?.trim() || '',
        BRK_COD1: values[2]?.trim() || '',
        BRK_COD2: values[3]?.trim() || '',
        STK_VOLM: parseFloat(values[4]?.trim() || '0') || 0,
        STK_PRIC: parseFloat(values[5]?.trim() || '0') || 0,
        TRX_CODE: values[6]?.trim() || '',
        TRX_TIME: values[7]?.trim() || '',
        TRX_ORD1: parseFloat(values[8]?.trim() || '0') || 0,
        TRX_ORD2: parseFloat(values[9]?.trim() || '0') || 0
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
   * Main function to generate bid/ask footprint data
   */
  public async generateBidAskData(dateSuffix: string): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      console.log(`Starting bid/ask footprint analysis for date: ${dateSuffix}`);
      
      // Load and process data
      const data = await this.loadAndProcessDataFromAzure(dateSuffix);
      
      // Check if data is empty (holiday or missing data)
      if (data.length === 0) {
        console.log(`⚠️ No transaction data available for ${dateSuffix} - skipping bid/ask calculation`);
        return {
          success: true,
          message: `No transaction data available for ${dateSuffix} - skipped bid/ask calculation`,
          data: { skipped: true, reason: 'No data available' }
        };
      }
      
      // Create different types of footprint analysis
      const brokerFootprint = this.createBrokerFootprintData(data);
      const stockFootprint = this.createStockFootprintData(data);
      const priceLevelSummary = this.createPriceLevelSummary(data);
      
      // Save results to Azure
      const basePath = `bid_ask/bid_ask_${dateSuffix}`;
      
      await this.saveToAzure(`${basePath}/price_level_summary.csv`, priceLevelSummary);
      await this.saveToAzure(`${basePath}/by_stock.csv`, stockFootprint);
      await this.saveToAzure(`${basePath}/by_broker.csv`, brokerFootprint);
      
      console.log("Bid/Ask footprint analysis completed successfully!");
      
      return {
        success: true,
        message: `Bid/ask footprint data generated successfully for ${dateSuffix}`,
        data: {
          date: dateSuffix,
          totalTransactions: data.length,
          uniqueBrokers: new Set([...data.map(row => row.BRK_COD2), ...data.map(row => row.BRK_COD1)]).size,
          uniqueStocks: new Set(data.map(row => row.STK_CODE)).size,
          uniquePrices: new Set(data.map(row => row.STK_PRIC)).size,
          totalVolume: data.reduce((sum, row) => sum + row.STK_VOLM, 0),
          totalValue: data.reduce((sum, row) => sum + (row.STK_VOLM * row.STK_PRIC), 0),
          outputFiles: [
            `${basePath}/price_level_summary.csv`,
            `${basePath}/by_stock.csv`,
            `${basePath}/by_broker.csv`
          ]
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
