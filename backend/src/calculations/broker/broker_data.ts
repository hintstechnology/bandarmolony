import { downloadText, uploadText, listPaths } from '../../utils/azureBlob';
import { AzureLogger } from '../../services/azureLoggingService';

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

interface TopBrokerData {
  BrokerCode: string;
  Emiten: string;
  TotalVolume: number;
  AvgPrice: number;
  TransactionCount: number;
  TotalValue: number;
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
      const filename = `broker_summary/broker_summary_${dateSuffix}/${emiten}.csv`;
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
      const filename = `broker_transaction/broker_transaction_${dateSuffix}/${broker}.csv`;
      await this.saveToAzure(filename, stockSummary);
      createdFiles.push(filename);
      
      console.log(`Created ${filename} with ${stockSummary.length} stocks`);
    }
    
    console.log(`Created ${createdFiles.length} broker transaction files`);
    return createdFiles;
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
   * Process a single DT file with all broker analysis
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
      const [brokerSummaryFiles, brokerTransactionFiles, topBroker, detailedSummary, comprehensiveSummary] = await Promise.all([
        this.createBrokerSummaryPerEmiten(data, dateSuffix),
        this.createBrokerTransactionPerBroker(data, dateSuffix),
        Promise.resolve(this.createTopBroker(data)),
        Promise.resolve(this.createDetailedBrokerSummary(data)),
        Promise.resolve(this.createComprehensiveTopBroker(data))
      ]);
      
      // REMOVED: ALLSUM files creation - not needed per original structure
      // Original only creates ALLSUM-broker_summary.csv in broker_summary folder
      
      // Save main summary files in parallel (SESUAI ORIGINAL STRUCTURE)
      await Promise.all([
        this.saveToAzure(`broker_summary/broker_summary_${dateSuffix}/ALLSUM-broker_summary.csv`, detailedSummary),
        this.saveToAzure(`top_broker/top_broker_${dateSuffix}/top_broker.csv`, comprehensiveSummary),
        this.saveToAzure(`top_broker/top_broker_${dateSuffix}/top_broker_by_stock.csv`, topBroker)
      ]);
      
      const allFiles = [
        ...brokerSummaryFiles,
        ...brokerTransactionFiles,
        `broker_summary/broker_summary_${dateSuffix}/ALLSUM-broker_summary.csv`,
        `top_broker/top_broker_${dateSuffix}/top_broker.csv`,
        `top_broker/top_broker_${dateSuffix}/top_broker_by_stock.csv`
      ];
      
      console.log(`✅ Completed processing ${blobName} - ${allFiles.length} files created`);
      return { success: true, dateSuffix, files: allFiles };
      
    } catch (error) {
      console.error(`Error processing ${blobName}:`, error);
      return { success: false, dateSuffix, files: [] };
    }
  }

  /**
   * Main function to generate broker data for all DT files
   */
  public async generateBrokerData(_dateSuffix: string): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      console.log(`Starting broker data analysis for all DT files...`);
      
      // Find all DT files
      const dtFiles = await this.findAllDtFiles();
      
      if (dtFiles.length === 0) {
        console.log(`⚠️ No DT files found in done-summary folder`);
        return {
          success: true,
          message: `No DT files found - skipped broker data generation`,
          data: { skipped: true, reason: 'No DT files found' }
        };
      }
      
      console.log(`📊 Processing ${dtFiles.length} DT files...`);
      
      // Process files in batches for speed (2 files at a time to prevent OOM)
      const BATCH_SIZE = 2;
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
        await AzureLogger.logProgress('broker-data', processed, dtFiles.length, `Processing done-summary`);
        
        // Small delay between batches
        if (i + BATCH_SIZE < dtFiles.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      const totalFiles = allResults.reduce((sum, result) => sum + result.files.length, 0);
      
      console.log(`✅ Broker data analysis completed!`);
      console.log(`📊 Processed: ${processed}/${dtFiles.length} DT files`);
      console.log(`📊 Successful: ${successful}/${processed} files`);
      console.log(`📊 Total output files: ${totalFiles}`);
      
      return {
        success: true,
        message: `Broker data generated successfully for ${successful}/${processed} DT files`,
        data: {
          totalDtFiles: dtFiles.length,
          processedFiles: processed,
          successfulFiles: successful,
          totalOutputFiles: totalFiles,
          results: allResults.filter(r => r.success)
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

  /**
   * REMOVED: ALLSUM files creation - not needed per original structure
   * Original only creates ALLSUM-broker_summary.csv in broker_summary folder
   */

  /**
   * REMOVED: createTopBrokerFiles - not needed per original structure
   * Original creates top_broker files directly in main processing
   */
}

export default BrokerDataCalculator;
