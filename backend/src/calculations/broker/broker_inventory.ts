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
  private async listAllBrokerTransactionDates(): Promise<string[]> {
    try {
      // Check if broker_transaction_output folder exists
      console.log("🔍 Checking all blobs in Azure...");
      const allBlobs = await listPaths({ prefix: '' });
      console.log(`📁 Total blobs in Azure: ${allBlobs.length}`);
      console.log(`📋 Sample blobs:`, allBlobs.slice(0, 20));
      
      const brokerTransactionPrefix = 'broker_transaction/';
      const blobs = await listPaths({ prefix: brokerTransactionPrefix });
      
      if (blobs.length === 0) {
        console.log(`No files found in broker_transaction/`);
        return [];
      }
      
      // Extract dates from broker transaction folders
      console.log(`📁 Found ${blobs.length} blobs in broker_transaction/`);
      console.log(`📋 Sample blobs:`, blobs.slice(0, 10));
      
      const dates = new Set<string>();
      for (const blobName of blobs) {
        console.log(`🔍 Processing broker blob: ${blobName}`);
        const pathParts = blobName.split('/');
        console.log(`📂 Path parts:`, pathParts);
        
        // Look for folders like: broker_transaction/broker_transaction_YYYYMMDD/
        if (pathParts.length >= 2 && pathParts[0] === 'broker_transaction') {
          const folderName = pathParts[1];
          console.log(`📁 Folder name: ${folderName}`);
          
          if (folderName && folderName.startsWith('broker_transaction_')) {
            const date = folderName.replace('broker_transaction_', '');
            console.log(`📅 Extracted date: ${date}`);
            if (/^\d{6}$/.test(date) || /^\d{8}$/.test(date)) {
              dates.add(date);
              console.log(`✅ Added broker date: ${date}`);
            }
          }
        }
      }
      
      const dateList = Array.from(dates).sort();
      console.log(`Discovered ${dateList.length} broker_transaction dates: ${dateList.join(', ')}`);
      return dateList;
    } catch (error) {
      console.error('Error listing broker transaction dates from Azure:', error);
      return [];
    }
  }

  /**
   * Generate date range between start and end dates
   */
  // Removed unused: generateDateRange (iteration now scans available dates directly)

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
    
    // Sort by date in descending order (newest first)
    return inventoryData.sort((a, b) => {
      const dateA = a.Date || '';
      const dateB = b.Date || '';
      return dateB.localeCompare(dateA);
    });
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
    dateRange: string[]
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
        
        // Save to Azure Blob Storage - same as original file structure
        const blobName = `broker_inventory/${emitenCode}/${brokerCode}.csv`;
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
  public async generateBrokerInventoryData(_dateSuffix: string, logId?: string | null): Promise<void> {
    console.log("Starting broker inventory analysis for ALL available dates...");
    
    try {
      // Discover all dates
      const dates = await this.listAllBrokerTransactionDates();
      if (dates.length === 0) {
        console.log("⚠️ No broker_transaction dates found in Azure - skipping broker inventory");
        return;
      }
      
      // Load broker transaction data for all dates
      console.log("\nLoading broker transaction data for all dates...");
      const allBrokerData = new Map<string, Map<string, BrokerTransactionData[]>>();
      
      // For each date, list brokers available for that date
      for (let dateIndex = 0; dateIndex < dates.length; dateIndex++) {
        const date = dates[dateIndex];
        if (!date) {
          console.log(`Skip undefined date at index ${dateIndex}`);
          continue;
        }
        
        console.log(`Loading data for date: ${date}`);
        
        // Update progress
        if (logId) {
          const { SchedulerLogService } = await import('../../services/schedulerLogService');
          await SchedulerLogService.updateLog(logId, {
            progress_percentage: Math.round(((dateIndex + 1) / dates.length) * 50), // First 50% for loading data
            current_processing: `Loading broker transaction data for date ${date} (${dateIndex + 1}/${dates.length})`
          });
        }
        
        const brokerMap = new Map<string, BrokerTransactionData[]>();
        
        const datePrefix = `broker_transaction/broker_transaction_${date}/`;
        const blobs = await listPaths({ prefix: datePrefix });
        const brokersForDate: string[] = [];
        for (const blobName of blobs) {
          const fileName = blobName.split('/').pop();
          if (fileName && fileName.endsWith('.csv')) {
            brokersForDate.push(fileName.replace('.csv', ''));
          }
        }
        
        for (const brokerCode of brokersForDate) {
          if (!brokerCode) {
            continue;
          }
          const brokerData = await this.loadBrokerTransactionDataFromAzure(brokerCode, date);
          if (brokerData.length > 0) {
            brokerMap.set(brokerCode, brokerData);
          }
        }
        
        allBrokerData.set(date, brokerMap);
      }
      
      // Update progress for file creation phase
      if (logId) {
        const { SchedulerLogService } = await import('../../services/schedulerLogService');
        await SchedulerLogService.updateLog(logId, {
          progress_percentage: 50,
          current_processing: 'Creating broker inventory files...'
        });
      }
      
      // Create broker inventory files (per broker-emiten combination)
      const createdFiles = await this.createBrokerInventoryFiles(allBrokerData, dates);
      
      console.log("\nBroker inventory analysis completed successfully!");
      console.log(`Total broker inventory files created: ${createdFiles.length}`);
      
    } catch (error) {
      console.error(`Error during broker inventory analysis: ${error}`);
      throw error;
    }
  }
}
