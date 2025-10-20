import { downloadText, uploadText } from '../../utils/azureBlob';

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
   * Load and process the transaction data from DT file in Azure
   */
  private async loadAndProcessDataFromAzure(dateSuffix: string): Promise<TransactionData[]> {
    console.log(`Loading transaction data for foreign flow analysis from Azure for date: ${dateSuffix}`);
    
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
    
    console.log(`⚠️ No data found from today back to 20250919 - skipping foreign flow calculation`);
    return [];
  }

  private parseTransactionData(content: string): TransactionData[] {
    const lines = content.trim().split('\n');
    const data: TransactionData[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line || line.trim().length === 0) continue;
      
      const values = line.split(',');
      if (values.length < 9) continue;
      
      const transaction: TransactionData = {
        STK_CODE: values[1]?.trim() || '',
        BRK_COD1: values[2]?.trim() || '',
        BRK_COD2: values[3]?.trim() || '',
        STK_VOLM: parseFloat(values[4]?.trim() || '0') || 0,
        STK_PRIC: parseFloat(values[5]?.trim() || '0') || 0,
        TRX_DATE: values[6]?.trim() || '',
        TRX_TIME: values[7]?.trim() || '',
        INV_TYP1: values[8]?.trim() || '',
        INV_TYP2: values[9]?.trim() || ''
      };
      
      data.push(transaction);
    }
    
    console.log(`📊 Loaded ${data.length} transaction records from Azure`);
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
      
      // Sort by date
      stockForeignFlow.sort((a, b) => a.Date.localeCompare(b.Date));
      
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
    
    // Convert back to array and sort by date
    const mergedData = Array.from(dataMap.values());
    mergedData.sort((a, b) => a.Date.localeCompare(b.Date));
    
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
   * Main function to generate foreign flow data
   */
  public async generateForeignFlowData(dateSuffix: string): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      console.log(`Starting foreign flow data extraction for date: ${dateSuffix}`);
      
      // Load and process data
      const data = await this.loadAndProcessDataFromAzure(dateSuffix);
      
      // Check if data is empty (holiday or missing data)
      if (data.length === 0) {
        console.log(`⚠️ No transaction data available for ${dateSuffix} - skipping foreign flow calculation`);
        return {
          success: true,
          message: `No transaction data available for ${dateSuffix} - skipped foreign flow calculation`,
          data: { skipped: true, reason: 'No data available' }
        };
      }
      
      // Create foreign flow data
      const foreignFlowData = this.createForeignFlowData(data);
      
      // Create or update individual CSV files for each stock
      const createdFiles = await this.createForeignFlowCsvFiles(foreignFlowData, dateSuffix);
      
      console.log("Foreign flow data extraction completed successfully!");
      
      return {
        success: true,
        message: `Foreign flow data generated successfully for ${dateSuffix}`,
        data: {
          date: dateSuffix,
          totalTransactions: data.length,
          uniqueStocks: new Set(data.map(row => row.STK_CODE)).size,
          uniqueDates: new Set(data.map(row => row.TRX_DATE)).size,
          totalVolume: data.reduce((sum, row) => sum + row.STK_VOLM, 0),
          totalValue: data.reduce((sum, row) => sum + (row.STK_VOLM * row.STK_PRIC), 0),
          outputFiles: createdFiles
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
