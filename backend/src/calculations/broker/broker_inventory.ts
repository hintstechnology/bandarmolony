import { downloadText, uploadText, listPaths } from '../../utils/azureBlob';

// Type definitions for broker inventory data
interface BrokerInventoryData {
  Date: string;
  NetBuyVol: number;
  CumulativeNetBuyVol: number;
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

export class BrokerInventoryCalculator {
  constructor() {
    // No need for Azure client initialization - using azureBlob utility
  }


  /**
   * Auto-detect date range from available broker_transaction folders in Azure
   */
  private async getDateRangeFromAzure(): Promise<{ startDate: string; endDate: string } | null> {
    try {
      const brokerTransactionPrefix = 'broker_transaction/';
      const blobs = await listPaths({ prefix: brokerTransactionPrefix });
      const brokerTransactionFolders = new Set<string>();
      
      for (const blobName of blobs) {
        const pathParts = blobName.split('/');
        if (pathParts.length >= 2 && pathParts[0] === 'broker_transaction') {
          const folderName = pathParts[1];
          if (folderName && folderName.startsWith('broker_transaction_')) {
            brokerTransactionFolders.add(folderName);
          }
        }
      }
      
      if (brokerTransactionFolders.size === 0) {
        console.log("No broker_transaction folders found in Azure! Please ensure broker_transaction folders exist.");
        return null;
      }
      
      // Extract dates from folder names
      const dates = Array.from(brokerTransactionFolders)
        .map(folder => folder.replace('broker_transaction_', ''))
        .filter(date => /^\d{6}$/.test(date))
        .sort();
      
      if (dates.length === 0) {
        console.log("No valid date folders found in broker_transaction folders.");
        return null;
      }
      
      const startDate = dates[0];
      const endDate = dates[dates.length - 1];
      
      if (!startDate || !endDate) {
        console.log("No valid date folders found in broker_transaction folders.");
        return null;
      }
      
      console.log(`Auto-detected date range: ${startDate} to ${endDate}`);
      console.log(`Found ${dates.length} broker_transaction folders: ${dates.join(', ')}`);
      
      return { startDate, endDate };
    } catch (error) {
      console.error('Error auto-detecting date range from Azure:', error);
      return null;
    }
  }

  /**
   * Generate date range between start and end dates
   */
  private generateDateRange(startDate: string, endDate: string): string[] {
    const dates: string[] = [];
    
    // Convert dates to comparable format (assuming YYMMDD format)
    const start = parseInt(startDate || '0');
    const end = parseInt(endDate || '0');
    
    if (start > end) {
      console.error(`Start date (${startDate}) cannot be later than end date (${endDate})`);
      return [];
    }
    
    // Generate dates between start and end (inclusive)
    for (let date = start; date <= end; date++) {
      const dateStr = date.toString().padStart(6, '0');
      dates.push(dateStr);
    }
    
    console.log(`Generated ${dates.length} dates: ${dates.join(', ')}`);
    return dates;
  }

  /**
   * Load broker transaction data for a specific broker and date from Azure
   */
  private async loadBrokerTransactionDataFromAzure(brokerCode: string, date: string): Promise<BrokerTransactionData[]> {
    const blobName = `broker_transaction/broker_transaction_${date}/${brokerCode}.csv`;
    
    try {
      const csvContent = await downloadText(blobName);
      
      const data: BrokerTransactionData[] = [];
      const lines = csvContent.split('\n');
      
      // Skip header row
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;
        
        const values = line.split(',');
        if (values.length >= 13) {
          const brokerData: BrokerTransactionData = {
            Emiten: values[0] || '',
            BuyerVol: parseFloat(values[1] || '0') || 0,
            BuyerValue: parseFloat(values[2] || '0') || 0,
            SellerVol: parseFloat(values[3] || '0') || 0,
            SellerValue: parseFloat(values[4] || '0') || 0,
            NetBuyVol: parseFloat(values[5] || '0') || 0,
            NetBuyValue: parseFloat(values[6] || '0') || 0,
            BuyerAvg: parseFloat(values[7] || '0') || 0,
            SellerAvg: parseFloat(values[8] || '0') || 0,
            TotalVolume: parseFloat(values[9] || '0') || 0,
            AvgPrice: parseFloat(values[10] || '0') || 0,
            TransactionCount: parseFloat(values[11] || '0') || 0,
            TotalValue: parseFloat(values[12] || '0') || 0
          };
          data.push(brokerData);
        }
      }
      
      console.log(`Loaded ${data.length} emiten records for broker ${brokerCode} on date ${date}`);
      return data;
    } catch (error) {
      console.error(`Error loading broker transaction data for ${brokerCode} on ${date}:`, error);
      return [];
    }
  }

  /**
   * Calculate the previous date (baseline date)
   */
  private getPreviousDate(dateStr: string): string {
    // Convert YYMMDD to Date object
    const year = 2000 + parseInt(dateStr.substring(0, 2) || '0');
    const month = parseInt(dateStr.substring(2, 4) || '0') - 1; // Month is 0-indexed
    const day = parseInt(dateStr.substring(4, 6) || '0');
    
    const date = new Date(year, month, day);
    date.setDate(date.getDate() - 1);
    
    // Convert back to YYMMDD format
    const prevYear = date.getFullYear() % 100;
    const prevMonth = (date.getMonth() + 1).toString().padStart(2, '0');
    const prevDay = date.getDate().toString().padStart(2, '0');
    
    return `${prevYear.toString().padStart(2, '0')}${prevMonth}${prevDay}`;
  }

  /**
   * Create broker inventory data for a specific broker and emiten across date range
   */
  private createBrokerInventoryData(
    brokerCode: string,
    emitenCode: string,
    dateRange: string[],
    allBrokerData: Map<string, Map<string, BrokerTransactionData[]>>
  ): BrokerInventoryData[] {
    const inventoryData: BrokerInventoryData[] = [];
    let cumulativeNetBuyVol = 0;
    
    // Add baseline date (start date - 1) with zero values
    if (dateRange.length > 0) {
      const firstDate = dateRange[0];
      if (firstDate) {
        const baselineDate = this.getPreviousDate(firstDate);
        inventoryData.push({
          Date: baselineDate,
          NetBuyVol: 0,
          CumulativeNetBuyVol: 0
        });
      }
    }
    
    for (const date of dateRange) {
      const brokerDataForDate = allBrokerData.get(date)?.get(brokerCode) || [];
      const emitenRecord = brokerDataForDate.find(e => e.Emiten === emitenCode);
      
      const netBuyVol = emitenRecord ? emitenRecord.NetBuyVol : 0;
      cumulativeNetBuyVol += netBuyVol;
      
      inventoryData.push({
        Date: date,
        NetBuyVol: netBuyVol,
        CumulativeNetBuyVol: cumulativeNetBuyVol
      });
    }
    
    return inventoryData;
  }

  /**
   * Save data to Azure Blob Storage
   */
  private async saveToAzure(blobName: string, data: any[]): Promise<void> {
    if (data.length === 0) {
      console.log(`No data to save for ${blobName}`);
      return;
    }
    
    // Convert data to CSV format
    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row => headers.map(header => row[header] || '').join(','))
    ].join('\n');
    
    await uploadText(blobName, csvContent, 'text/csv');
    console.log(`Successfully uploaded ${blobName} to Azure`);
  }

  /**
   * Create individual CSV files for each broker-emiten combination and upload to Azure
   */
  private async createBrokerInventoryFiles(
    allBrokerData: Map<string, Map<string, BrokerTransactionData[]>>,
    dateRange: string[],
    dateSuffix: string
  ): Promise<string[]> {
    console.log("\nCreating broker inventory files...");
    
    // Get all unique broker-emiten combinations across all dates
    const brokerEmitenCombinations = new Map<string, Set<string>>();
    
    allBrokerData.forEach((brokerMap, _date) => {
      brokerMap.forEach((emitenData, brokerCode) => {
        if (!brokerEmitenCombinations.has(brokerCode)) {
          brokerEmitenCombinations.set(brokerCode, new Set());
        }
        emitenData.forEach(emiten => {
          brokerEmitenCombinations.get(brokerCode)!.add(emiten.Emiten);
        });
      });
    });
    
    console.log(`Found ${brokerEmitenCombinations.size} brokers with emiten data`);
    
    const createdFiles: string[] = [];
    
    // Create inventory data for each broker-emiten combination
    for (const [brokerCode, emitenSet] of brokerEmitenCombinations) {
      for (const emitenCode of emitenSet) {
        // Create inventory data for this broker-emiten combination
        const inventoryData = this.createBrokerInventoryData(brokerCode, emitenCode, dateRange, allBrokerData);
        
        // Save to Azure Blob Storage
        const blobName = `broker_inventory/${emitenCode}/${brokerCode}_${dateSuffix}.csv`;
        await this.saveToAzure(blobName, inventoryData);
        createdFiles.push(blobName);
        
        console.log(`Created ${blobName} with ${inventoryData.length} records`);
        
        // Show sample data for first few files
        if (createdFiles.length <= 5) {
          console.log(`Sample data for broker ${brokerCode} - emiten ${emitenCode}:`);
          console.log(inventoryData.slice(0, 3));
        }
      }
    }
    
    console.log(`\nCreated ${createdFiles.length} broker inventory files`);
    return createdFiles;
  }

  /**
   * Main function to generate broker inventory data
   */
  public async generateBrokerInventoryData(dateSuffix: string): Promise<void> {
    console.log("Starting broker inventory analysis...");
    
    try {
      // Auto-detect date range from Azure broker_transaction folders
      const dateRange = await this.getDateRangeFromAzure();
      if (!dateRange) {
        throw new Error("Could not detect date range from Azure broker_transaction folders");
      }
      
      const { startDate, endDate } = dateRange;
      
      // Generate date range
      const dates = this.generateDateRange(startDate, endDate);
      if (dates.length === 0) {
        throw new Error("Could not generate date range");
      }
      
      // Load broker transaction data for all dates
      console.log("\nLoading broker transaction data for all dates...");
      const allBrokerData = new Map<string, Map<string, BrokerTransactionData[]>>();
      
      // First, get all available brokers from the first date
      const firstDate = dates[0];
      const firstDateBlobName = `broker_transaction/broker_transaction_${firstDate}/`;
      
      const blobs = await listPaths({ prefix: firstDateBlobName });
      const firstDateBrokers: string[] = [];
      
      for (const blobName of blobs) {
        const fileName = blobName.split('/').pop();
        if (fileName && fileName.endsWith('.csv')) {
          firstDateBrokers.push(fileName.replace('.csv', ''));
        }
      }
      
      console.log(`Found ${firstDateBrokers.length} brokers: ${firstDateBrokers.slice(0, 10)}...`);
      
      for (const date of dates) {
        console.log(`Loading data for date: ${date}`);
        const brokerMap = new Map<string, BrokerTransactionData[]>();
        
        for (const brokerCode of firstDateBrokers) {
          const brokerData = await this.loadBrokerTransactionDataFromAzure(brokerCode, date);
          if (brokerData.length > 0) {
            brokerMap.set(brokerCode, brokerData);
          }
        }
        
        allBrokerData.set(date, brokerMap);
      }
      
      // Create broker inventory files
      const createdFiles = await this.createBrokerInventoryFiles(allBrokerData, dates, dateSuffix);
      
      console.log("\nBroker inventory analysis completed successfully!");
      
      // Print summary statistics
      console.log(`\nSummary Statistics:`);
      console.log(`Date range: ${startDate} to ${endDate} (${dates.length} days)`);
      console.log(`Total broker inventory files created: ${createdFiles.length}`);
      
    } catch (error) {
      console.error(`Error during broker inventory analysis: ${error}`);
      throw error;
    }
  }
}
