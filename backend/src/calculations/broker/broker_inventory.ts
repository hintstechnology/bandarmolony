import { uploadText, listPaths } from '../../utils/azureBlob';
import { BATCH_SIZE_PHASE_8, MAX_CONCURRENT_REQUESTS_PHASE_8 } from '../../services/dataUpdateService';
import { SchedulerLogService } from '../../services/schedulerLogService';
import { brokerTransactionCache } from '../../cache/brokerTransactionCacheService';

// Progress tracker interface for thread-safe broker-emiten counting
interface ProgressTracker {
  totalCombinations: number;
  processedCombinations: number;
  logId: string | null;
  updateProgress: () => Promise<void>;
}

// Helper function to limit concurrency for Phase 7-8
async function limitConcurrency<T>(promises: Promise<T>[], maxConcurrency: number): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < promises.length; i += maxConcurrency) {
    const batch = promises.slice(i, i + maxConcurrency);
    const batchResults = await Promise.allSettled(batch);
    batchResults.forEach((result) => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      }
    });
  }
  return results;
}

// Type definitions for broker inventory data
interface BrokerInventoryData {
  Date: string;
  BuyVol: number;
  SellVol: number;
  NetBuyVol: number;
  CumulativeBuyVol: number;
  CumulativeSellVol: number;
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
      
      // Normalize dates to YYYYMMDD format for consistency
      const normalizedDates = Array.from(dates).map(date => {
        if (date.length === 6) {
          // Convert YYMMDD to YYYYMMDD
          const year = 2000 + parseInt(date.substring(0, 2) || '0');
          return `${year}${date.substring(2)}`;
        }
        return date; // Already YYYYMMDD
      });
      
      // Sort dates in ascending order (oldest first) for proper cumulative calculation
      const dateList = normalizedDates.sort();
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
   * Tries both YYYYMMDD and YYMMDD formats to handle different folder naming conventions
   * OPTIMIZED: Uses shared cache to avoid repeated downloads
   */
  private async loadBrokerTransactionDataFromAzure(brokerCode: string, date: string): Promise<BrokerTransactionData[]> {
    // Use shared cache for raw content (will handle both YYYYMMDD and YYMMDD formats automatically)
    const csvContent = await brokerTransactionCache.getRawContent(brokerCode, date);
    
    if (!csvContent) {
      return [];
    }
    
    try {
      
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
   * Supports both YYMMDD (6 digits) and YYYYMMDD (8 digits) formats
   * Returns date in the same format as input
   */
  private getPreviousDate(dateStr: string): string {
    if (!dateStr || dateStr.length < 6) {
      console.warn(`⚠️ Invalid date format: ${dateStr}`);
      return dateStr;
    }
    
    let year: number;
    let month: number;
    let day: number;
    const isYYYYMMDD = dateStr.length === 8;
    
    if (isYYYYMMDD) {
      // YYYYMMDD format (8 digits)
      year = parseInt(dateStr.substring(0, 4) || '0');
      month = parseInt(dateStr.substring(4, 6) || '0') - 1; // Month is 0-indexed
      day = parseInt(dateStr.substring(6, 8) || '0');
    } else {
      // YYMMDD format (6 digits)
      year = 2000 + parseInt(dateStr.substring(0, 2) || '0');
      month = parseInt(dateStr.substring(2, 4) || '0') - 1; // Month is 0-indexed
      day = parseInt(dateStr.substring(4, 6) || '0');
    }
    
    const date = new Date(year, month, day);
    date.setDate(date.getDate() - 1);
    
    // Convert back to same format as input
    if (isYYYYMMDD) {
      // Return YYYYMMDD format
      const prevYear = date.getFullYear();
      const prevMonth = (date.getMonth() + 1).toString().padStart(2, '0');
      const prevDay = date.getDate().toString().padStart(2, '0');
      return `${prevYear}${prevMonth}${prevDay}`;
    } else {
      // Return YYMMDD format
      const prevYear = date.getFullYear() % 100;
      const prevMonth = (date.getMonth() + 1).toString().padStart(2, '0');
      const prevDay = date.getDate().toString().padStart(2, '0');
      return `${prevYear.toString().padStart(2, '0')}${prevMonth}${prevDay}`;
    }
  }

  /**
   * Create broker inventory data for a specific broker and emiten across date range
   * dateRange should be sorted in ascending order (oldest first) for proper cumulative calculation
   */
  private createBrokerInventoryData(
    brokerCode: string,
    emitenCode: string,
    dateRange: string[],
    allBrokerData: Map<string, Map<string, BrokerTransactionData[]>>
  ): BrokerInventoryData[] {
    const inventoryData: BrokerInventoryData[] = [];
    let cumulativeBuyVol = 0;
    let cumulativeSellVol = 0;
    let cumulativeNetBuyVol = 0;
    
    // Ensure dateRange is sorted in ascending order (oldest first)
    const sortedDateRange = [...dateRange].sort();
    
    // Add baseline date (first date - 1) with zero values
    if (sortedDateRange.length > 0) {
      const firstDate = sortedDateRange[0];
      if (firstDate) {
        const baselineDate = this.getPreviousDate(firstDate);
        inventoryData.push({
          Date: baselineDate,
          BuyVol: 0,
          SellVol: 0,
          NetBuyVol: 0,
          CumulativeBuyVol: 0,
          CumulativeSellVol: 0,
          CumulativeNetBuyVol: 0
        });
      }
    }
    
    // Process dates in chronological order (oldest first) for cumulative calculation
    for (const date of sortedDateRange) {
      const brokerDataForDate = allBrokerData.get(date)?.get(brokerCode) || [];
      const emitenRecord = brokerDataForDate.find(e => e.Emiten === emitenCode);
      
      const buyVol = emitenRecord ? emitenRecord.BuyerVol : 0;
      const sellVol = emitenRecord ? emitenRecord.SellerVol : 0;
      const netBuyVol = buyVol - sellVol;
      
      cumulativeBuyVol += buyVol;
      cumulativeSellVol += sellVol;
      cumulativeNetBuyVol += netBuyVol;
      
      inventoryData.push({
        Date: date,
        BuyVol: buyVol,
        SellVol: sellVol,
        NetBuyVol: netBuyVol,
        CumulativeBuyVol: cumulativeBuyVol,
        CumulativeSellVol: cumulativeSellVol,
        CumulativeNetBuyVol: cumulativeNetBuyVol
      });
    }
    
    // Sort by date in descending order (newest first) for output
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
    dateRange: string[],
    progressTracker?: ProgressTracker
  ): Promise<{ files: string[]; combinationCount: number }> {
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
    let totalCombinations = 0;
    
    // Create inventory data for each broker-emiten combination
    for (const [brokerCode, emitenSet] of brokerEmitenCombinations) {
      for (const emitenCode of emitenSet) {
        // Create inventory data for this broker-emiten combination
        const inventoryData = this.createBrokerInventoryData(brokerCode, emitenCode, dateRange, allBrokerData);
        
        // Save to Azure Blob Storage - same as original file structure
        const blobName = `broker_inventory/${emitenCode}/${brokerCode}.csv`;
        await this.saveToAzure(blobName, inventoryData);
        createdFiles.push(blobName);
        totalCombinations++;
        
        console.log(`Created ${blobName} with ${inventoryData.length} records`);
        
        // Show sample data for first few files
        if (createdFiles.length <= 5) {
          console.log(`Sample data for broker ${brokerCode} - emiten ${emitenCode}:`);
          console.log(inventoryData.slice(0, 3));
        }
        
        // Update progress tracker after each broker-emiten combination
        if (progressTracker) {
          progressTracker.processedCombinations++;
          await progressTracker.updateProgress();
        }
      }
    }
    
    console.log(`\nCreated ${createdFiles.length} broker inventory files`);
    return { files: createdFiles, combinationCount: totalCombinations };
  }

  /**
   * Main function to generate broker inventory data
   */
  public async generateBrokerInventoryData(_dateSuffix: string, logId?: string | null): Promise<void> {
    console.log("Starting broker inventory analysis for ALL available dates...");
    let datesToProcess: Set<string> = new Set();
    
    try {
      // Discover all dates
      const dates = await this.listAllBrokerTransactionDates();
      if (dates.length === 0) {
        console.log("⚠️ No broker_transaction dates found in Azure - skipping broker inventory");
        return;
      }
      
      // CRITICAL: Don't add active dates before processing - add only when date needs processing
      // Load broker transaction data for all dates in batches
      console.log("\nLoading broker transaction data for all dates...");
      const allBrokerData = new Map<string, Map<string, BrokerTransactionData[]>>();
      
      // Process dates in batches (Phase 8: 6 dates per batch)
      const DATE_BATCH_SIZE = BATCH_SIZE_PHASE_8; // Phase 8: 6 dates
      const MAX_CONCURRENT = MAX_CONCURRENT_REQUESTS_PHASE_8; // Phase 8: 3 concurrent
      let processedDates = 0;
      
      for (let i = 0; i < dates.length; i += DATE_BATCH_SIZE) {
        const dateBatch = dates.slice(i, i + DATE_BATCH_SIZE);
        const batchNumber = Math.floor(i / DATE_BATCH_SIZE) + 1;
        console.log(`📦 Processing date batch ${batchNumber}/${Math.ceil(dates.length / DATE_BATCH_SIZE)} (${dateBatch.length} dates)`);
        
        // Memory check before batch
        if (global.gc) {
          const memBefore = process.memoryUsage();
          const heapUsedMB = memBefore.heapUsed / 1024 / 1024;
          if (heapUsedMB > 10240) { // 10GB threshold
            console.log(`⚠️ High memory usage detected: ${heapUsedMB.toFixed(2)}MB, forcing GC...`);
            global.gc();
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
        
        // Process dates in batch in parallel with concurrency limit 25
        const batchPromises = dateBatch.map(async (date) => {
            if (!date) {
              return { date: '', success: false };
            }
            
            // CRITICAL: Add active date ONLY when processing starts
            if (!datesToProcess.has(date)) {
              datesToProcess.add(date);
              brokerTransactionCache.addActiveProcessingDate(date);
            }
            
            console.log(`Loading data for date: ${date}`);
            
            const brokerMap = new Map<string, BrokerTransactionData[]>();
            
            // Try YYYYMMDD format first, then YYMMDD format
            let datePrefix = `broker_transaction/broker_transaction_${date}/`;
            let blobs = await listPaths({ prefix: datePrefix });
            
            // If no blobs found and date is YYYYMMDD format, try YYMMDD format
            if (blobs.length === 0 && date.length === 8) {
              // Convert YYYYMMDD to YYMMDD: 20251201 -> 251201
              const yyMMdd = `${date.substring(2, 4)}${date.substring(4, 6)}${date.substring(6, 8)}`;
              datePrefix = `broker_transaction/broker_transaction_${yyMMdd}/`;
              blobs = await listPaths({ prefix: datePrefix });
            }
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
            
            return { date, success: true, brokerMap };
          });
        const batchResults = await limitConcurrency(batchPromises, MAX_CONCURRENT);
        
        // Collect results from batch
        for (const result of batchResults) {
          if (result && result.success && result.brokerMap) {
            allBrokerData.set(result.date, result.brokerMap);
            processedDates++;
          }
        }
        
        // Update progress
        if (logId) {
          const { SchedulerLogService } = await import('../../services/schedulerLogService');
          await SchedulerLogService.updateLog(logId, {
            progress_percentage: Math.round((processedDates / dates.length) * 50), // First 50% for loading data
            current_processing: `Loading date batch ${batchNumber}/${Math.ceil(dates.length / DATE_BATCH_SIZE)} (${processedDates}/${dates.length} dates loaded)`
          });
        }
        
        // Memory cleanup after batch
        if (global.gc) {
          global.gc();
          const memAfter = process.memoryUsage();
          const heapUsedMB = memAfter.heapUsed / 1024 / 1024;
          console.log(`📊 Date batch ${batchNumber} complete - Memory: ${heapUsedMB.toFixed(2)}MB`);
        }
        
        // Small delay between batches
        if (i + DATE_BATCH_SIZE < dates.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      // Pre-count total broker-emiten combinations for accurate progress tracking
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
      const totalCombinations = Array.from(brokerEmitenCombinations.values()).reduce((sum, set) => sum + set.size, 0);
      
      // Create progress tracker for thread-safe combination counting
      const progressTracker: ProgressTracker = {
        totalCombinations,
        processedCombinations: 0,
        logId: logId || null,
        updateProgress: async () => {
          if (progressTracker.logId) {
            const percentage = totalCombinations > 0 
              ? Math.round(50 + (progressTracker.processedCombinations / totalCombinations) * 50) // 50-100% for file creation
              : 50;
            await SchedulerLogService.updateLog(progressTracker.logId, {
              progress_percentage: percentage,
              current_processing: `Creating broker inventory files: ${progressTracker.processedCombinations.toLocaleString()}/${totalCombinations.toLocaleString()} combinations processed`
            });
          }
        }
      };
      
      // Update progress for file creation phase
      if (logId) {
        await SchedulerLogService.updateLog(logId, {
          progress_percentage: 50,
          current_processing: `Creating broker inventory files... (0/${totalCombinations.toLocaleString()} combinations)`
        });
      }
      
      // Create broker inventory files (per broker-emiten combination)
      const result = await this.createBrokerInventoryFiles(allBrokerData, dates, progressTracker);
      const createdFiles = result.files;
      
      console.log("\nBroker inventory analysis completed successfully!");
      console.log(`Total broker inventory files created: ${createdFiles.length}`);
      
    } catch (error) {
      console.error(`Error during broker inventory analysis: ${error}`);
      throw error;
    } finally {
      // Cleanup: Remove active processing dates setelah selesai
      if (datesToProcess && datesToProcess.size > 0) {
        datesToProcess.forEach(date => {
          brokerTransactionCache.removeActiveProcessingDate(date);
        });
        console.log(`🧹 Cleaned up ${datesToProcess.size} active processing dates from broker transaction cache`);
      }
    }
  }
}
