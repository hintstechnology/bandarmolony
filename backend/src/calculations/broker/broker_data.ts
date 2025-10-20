import { downloadText, uploadText } from '../../utils/azureBlob';

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
  BuyerAvg: number;
  SellerAvg: number;
}


interface BrokerTransactionData {
  Emiten: string;
  BuyerVol: number;
  BuyerValue: number;
  SellerVol: number;
  SellerValue: number;
  NetBuyVol: number;
  NetBuyValue: number;
  BuyerAvg: number;
  SellerAvg: number;
  TotalVolume: number;
  AvgPrice: number;
  TransactionCount: number;
  TotalValue: number;
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

export class BrokerDataCalculator {
  constructor() {
    // No need for Azure client initialization - using azureBlob utility
  }

  /**
   * Load and process the transaction data from DT file in Azure
   */
  private async loadAndProcessDataFromAzure(dateSuffix: string): Promise<TransactionData[]> {
    console.log(`Loading transaction data for broker analysis from Azure for date: ${dateSuffix}`);
    
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
    
    console.log(`⚠️ No data found from today back to 20250919 - skipping broker data calculation`);
    return [];
  }

  private parseTransactionData(content: string): TransactionData[] {
    const lines = content.trim().split('\n');
    const data: TransactionData[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line || line.trim().length === 0) continue;
      
      const values = line.split(',');
      if (values.length < 7) continue;
      
      const transaction: TransactionData = {
        STK_CODE: values[1]?.trim() || '',
        BRK_COD1: values[2]?.trim() || '',
        BRK_COD2: values[3]?.trim() || '',
        STK_VOLM: parseFloat(values[4]?.trim() || '0') || 0,
        STK_PRIC: parseFloat(values[5]?.trim() || '0') || 0,
        TRX_CODE: values[6]?.trim() || ''
      };
      
      data.push(transaction);
    }
    
    console.log(`📊 Loaded ${data.length} transaction records from Azure`);
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
        
        finalSummary.push({
          BrokerCode: broker,
          BuyerVol: buyer.totalVol,
          BuyerValue: buyer.totalValue,
          SellerVol: seller.totalVol,
          SellerValue: seller.totalValue,
          NetBuyVol: buyer.totalVol - seller.totalVol,
          NetBuyValue: buyer.totalValue - seller.totalValue,
          BuyerAvg: buyer.avgPrice,
          SellerAvg: seller.avgPrice
        });
      });
      
      // Sort by net buy value descending
      finalSummary.sort((a, b) => b.NetBuyValue - a.NetBuyValue);
      
      // Save to Azure
      const filename = `broker_summary_output/broker_summary_${dateSuffix}/${emiten}.csv`;
      await this.saveToAzure(filename, finalSummary);
      createdFiles.push(filename);
      
      console.log(`Created ${filename} with ${finalSummary.length} brokers`);
    }
    
    console.log(`Created ${createdFiles.length} broker summary files`);
    return createdFiles;
  }

  /**
   * Create broker transaction files for each broker
   */
  private async createBrokerTransactionPerBroker(
    data: TransactionData[], 
    dateSuffix: string
  ): Promise<string[]> {
    console.log("\nCreating broker transaction files per broker...");
    
    // Get unique broker codes (both buyer and seller brokers)
    const uniqueBrokers = [...new Set([
      ...data.map(row => row.BRK_COD2), // buyer brokers
      ...data.map(row => row.BRK_COD1)  // seller brokers
    ])];
    console.log(`Found ${uniqueBrokers.length} unique brokers`);
    
    const createdFiles: string[] = [];
    
    for (const broker of uniqueBrokers) {
      console.log(`Processing broker: ${broker}`);
      
      // Filter data for this broker (both as buyer and seller)
      const brokerData = data.filter(row => row.BRK_COD2 === broker || row.BRK_COD1 === broker);
      
      // Group by stock code for this broker
      const stockGroups = new Map<string, TransactionData[]>();
      brokerData.forEach(row => {
        const stock = row.STK_CODE;
        if (!stockGroups.has(stock)) {
          stockGroups.set(stock, []);
        }
        stockGroups.get(stock)!.push(row);
      });
      
      // Calculate summary for each stock
      const stockSummary: BrokerTransactionData[] = [];
      
      stockGroups.forEach((transactions, stock) => {
        // Separate buyer and seller transactions
        const buyerTransactions = transactions.filter(t => t.BRK_COD2 === broker);
        const sellerTransactions = transactions.filter(t => t.BRK_COD1 === broker);
        
        // Calculate buyer data
        const buyerVol = buyerTransactions.reduce((sum, t) => sum + t.STK_VOLM, 0);
        const buyerValue = buyerTransactions.reduce((sum, t) => sum + (t.STK_VOLM * t.STK_PRIC), 0);
        const buyerAvg = buyerVol > 0 ? buyerValue / buyerVol : 0;
        
        // Calculate seller data
        const sellerVol = sellerTransactions.reduce((sum, t) => sum + t.STK_VOLM, 0);
        const sellerValue = sellerTransactions.reduce((sum, t) => sum + (t.STK_VOLM * t.STK_PRIC), 0);
        const sellerAvg = sellerVol > 0 ? sellerValue / sellerVol : 0;
        
        // Calculate net values
        const netBuyVol = buyerVol - sellerVol;
        const netBuyValue = buyerValue - sellerValue;
        
        // Calculate total values
        const totalVolume = buyerVol + sellerVol;
        const totalValue = buyerValue + sellerValue;
        const avgPrice = totalVolume > 0 ? totalValue / totalVolume : 0;
        
        stockSummary.push({
          Emiten: stock,
          BuyerVol: buyerVol,
          BuyerValue: buyerValue,
          SellerVol: sellerVol,
          SellerValue: sellerValue,
          NetBuyVol: netBuyVol,
          NetBuyValue: netBuyValue,
          BuyerAvg: buyerAvg,
          SellerAvg: sellerAvg,
          TotalVolume: totalVolume,
          AvgPrice: avgPrice,
          TransactionCount: transactions.length,
          TotalValue: totalValue
        });
      });
      
      // Sort by total volume descending
      stockSummary.sort((a, b) => b.TotalVolume - a.TotalVolume);
      
      // Save to Azure
      const filename = `broker_transaction_output/broker_transaction_${dateSuffix}/${broker}.csv`;
      await this.saveToAzure(filename, stockSummary);
      createdFiles.push(filename);
      
      console.log(`Created ${filename} with ${stockSummary.length} stocks`);
    }
    
    console.log(`Created ${createdFiles.length} broker transaction files`);
    return createdFiles;
  }


  /**
   * Create detailed broker summary with buy/sell analysis
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
      
      detailedSummary.push({
        BrokerCode: broker,
        BuyerVol: buyer.vol,
        BuyerFreq: buyer.freq,
        BuyerValue: buyer.value,
        BuyerAvg: buyer.avg,
        SellerVol: seller.vol,
        SellerFreq: seller.freq,
        SellerValue: seller.value,
        SellerAvg: seller.avg,
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
      
      comprehensiveData.push({
        BrokerCode: broker,
        TotalBrokerVol: totalVol,
        TotalBrokerValue: totalValue,
        TotalBrokerFreq: totalFreq,
        NetBuyVol: netBuyVol,
        NetBuyValue: netBuyValue,
        NetBuyFreq: netBuyFreq,
        SellerVol: sellerVol,
        SellerValue: sellerValue,
        SellerFreq: sellerFreq,
        BuyerVol: buyerVol,
        BuyerValue: buyerValue,
        BuyerFreq: buyerFreq
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
   * Main function to generate broker data
   */
  public async generateBrokerData(dateSuffix: string): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      console.log(`Starting broker data analysis for date: ${dateSuffix}`);
      
      // Load and process data
      const data = await this.loadAndProcessDataFromAzure(dateSuffix);
      
      // Check if data is empty (holiday or missing data)
      if (data.length === 0) {
        console.log(`⚠️ No transaction data available for ${dateSuffix} - skipping broker data generation`);
        return {
          success: true,
          message: `No transaction data available for ${dateSuffix} - skipped broker data generation`,
          data: { skipped: true, reason: 'No data available' }
        };
      }
      
      // Create different types of analysis
      const brokerSummaryFiles = await this.createBrokerSummaryPerEmiten(data, dateSuffix);
      const brokerTransactionFiles = await this.createBrokerTransactionPerBroker(data, dateSuffix);
      const detailedSummary = this.createDetailedBrokerSummary(data);
      const comprehensiveSummary = this.createComprehensiveTopBroker(data);
      
      // Save main summary files
      const brokerSummaryPath = `broker_summary/broker_summary_${dateSuffix}.csv`;
      await this.saveToAzure(brokerSummaryPath, detailedSummary);
      
      const topBrokerPath = `top_broker/top_broker_${dateSuffix}.csv`;
      await this.saveToAzure(topBrokerPath, comprehensiveSummary);
      
      // Save individual broker transaction files
      for (const filename of brokerTransactionFiles) {
        const brokerTransactionPath = `broker_transaction/${filename}`;
        // Note: The actual data saving is handled within createBrokerTransactionPerBroker
        console.log(`Created broker transaction file: ${brokerTransactionPath}`);
      }
      
      console.log("Broker data analysis completed successfully!");
      
      return {
        success: true,
        message: `Broker data generated successfully for ${dateSuffix}`,
        data: {
          date: dateSuffix,
          totalTransactions: data.length,
          uniqueBrokers: new Set([...data.map(row => row.BRK_COD2), ...data.map(row => row.BRK_COD1)]).size,
          uniqueStocks: new Set(data.map(row => row.STK_CODE)).size,
          totalVolume: data.reduce((sum, row) => sum + row.STK_VOLM, 0),
          totalValue: data.reduce((sum, row) => sum + (row.STK_VOLM * row.STK_PRIC), 0),
          outputFiles: [
            ...brokerSummaryFiles,
            ...brokerTransactionFiles,
            brokerSummaryPath,
            topBrokerPath
          ]
        }
      };
      
    } catch (error) {
      console.error('Error generating broker data:', error);
      return {
        success: false,
        message: `Failed to generate broker data: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}

export default BrokerDataCalculator;
