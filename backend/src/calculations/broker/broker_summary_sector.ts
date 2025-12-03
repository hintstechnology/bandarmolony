import { downloadText, uploadText } from '../../utils/azureBlob';
import { BATCH_SIZE_PHASE_4, MAX_CONCURRENT_REQUESTS_PHASE_4 } from '../../services/dataUpdateService';
import { downloadText as downloadTextUtil } from '../../utils/azureBlob';

// Helper function to limit concurrency for Phase 4
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

// Sector mapping cache - loaded from csv_input/sector_mapping.csv
let SECTOR_MAPPING: { [key: string]: string[] } = {};

/**
 * Build sector mapping from csv_input/sector_mapping.csv
 */
async function buildSectorMappingFromCsv(): Promise<void> {
  try {
    console.log('🔍 Building sector mapping from csv_input/sector_mapping.csv...');
    
    // Reset mapping
    Object.keys(SECTOR_MAPPING).forEach(sector => {
      SECTOR_MAPPING[sector] = [];
    });
    
    // Load sector mapping from CSV file
    const csvData = await downloadTextUtil('csv_input/sector_mapping.csv');
    const lines = csvData.split('\n');
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line || line.trim().length === 0) continue;
      
      const parts = line.split(',');
      if (parts.length >= 2) {
        const sector = parts[0]?.trim();
        const emiten = parts[1]?.trim();
        
        if (sector && emiten && emiten.length === 4) {
          if (!SECTOR_MAPPING[sector]) {
            SECTOR_MAPPING[sector] = [];
          }
          if (!SECTOR_MAPPING[sector].includes(emiten)) {
            SECTOR_MAPPING[sector].push(emiten);
          }
        }
      }
    }
    
    console.log('📊 Sector mapping built successfully from CSV');
    console.log(`📊 Found ${Object.keys(SECTOR_MAPPING).length} sectors with total ${Object.values(SECTOR_MAPPING).flat().length} emitens`);
  } catch (error) {
    console.warn('⚠️ Could not build sector mapping from CSV:', error);
    console.log('⚠️ Using empty sector mapping');
    SECTOR_MAPPING = {};
  }
}

// Type definitions - same as broker_summary.ts
interface BrokerSummary {
  BrokerCode: string;
  BuyerVol: number;
  BuyerValue: number;
  SellerVol: number;
  SellerValue: number;
  NetBuyVol: number;
  NetBuyValue: number;
  NetSellVol: number;
  NetSellValue: number;
  BuyerAvg: number;
  SellerAvg: number;
  NetBuyerAvg: number;
  NetSellerAvg: number;
}

export class BrokerSummarySectorCalculator {
  constructor() {}

  /**
   * Read CSV file and parse broker summary data
   */
  private parseCSV(csvContent: string): BrokerSummary[] {
    const lines = csvContent.trim().split('\n');
    if (lines.length < 2) {
      return [];
    }

    const headers = (lines[0] || '').split(',').map(h => h.trim());
    const brokerData: BrokerSummary[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = (lines[i] || '').split(',').map(v => v.trim());
      if (values.length !== headers.length) {
        continue;
      }

      const row: any = {};
      headers.forEach((header, index) => {
        const value = values[index];
        // Convert numeric fields
        if (['BuyerVol', 'BuyerValue', 'SellerVol', 'SellerValue', 'NetBuyVol', 'NetBuyValue', 
             'NetSellVol', 'NetSellValue', 'BuyerAvg', 'SellerAvg', 'NetBuyerAvg', 'NetSellerAvg'].includes(header)) {
          row[header] = parseFloat(value || '0') || 0;
        } else {
          row[header] = value || '';
        }
      });

      brokerData.push({
        BrokerCode: row.BrokerCode || '',
        BuyerVol: row.BuyerVol || 0,
        BuyerValue: row.BuyerValue || 0,
        SellerVol: row.SellerVol || 0,
        SellerValue: row.SellerValue || 0,
        NetBuyVol: row.NetBuyVol || 0,
        NetBuyValue: row.NetBuyValue || 0,
        NetSellVol: row.NetSellVol || 0,
        NetSellValue: row.NetSellValue || 0,
        BuyerAvg: row.BuyerAvg || 0,
        SellerAvg: row.SellerAvg || 0,
        NetBuyerAvg: row.NetBuyerAvg || 0,
        NetSellerAvg: row.NetSellerAvg || 0
      });
    }

    return brokerData;
  }

  /**
   * Convert BrokerSummary array to CSV string
   */
  private convertToCSV(data: BrokerSummary[]): string {
    if (data.length === 0) {
      return 'BrokerCode,BuyerVol,BuyerValue,SellerVol,SellerValue,NetBuyVol,NetBuyValue,NetSellVol,NetSellValue,BuyerAvg,SellerAvg,NetBuyerAvg,NetSellerAvg\n';
    }

    const headers = ['BrokerCode', 'BuyerVol', 'BuyerValue', 'SellerVol', 'SellerValue', 
                     'NetBuyVol', 'NetBuyValue', 'NetSellVol', 'NetSellValue', 
                     'BuyerAvg', 'SellerAvg', 'NetBuyerAvg', 'NetSellerAvg'];
    
    const csvLines = [
      headers.join(','),
      ...data.map(row => 
        headers.map(header => row[header as keyof BrokerSummary]).join(',')
      )
    ];

    return csvLines.join('\n');
  }

  /**
   * Aggregate broker summary data across multiple emitens
   */
  private aggregateBrokerData(allBrokerData: BrokerSummary[]): BrokerSummary[] {
    // Map to aggregate data per broker
    const brokerMap = new Map<string, {
      BuyerVol: number;
      BuyerValue: number;
      SellerVol: number;
      SellerValue: number;
      NetBuyVol: number;
      NetBuyValue: number;
      NetSellVol: number;
      NetSellValue: number;
    }>();

    // Sum all data per broker
    allBrokerData.forEach(row => {
      const broker = row.BrokerCode;
      if (!broker) return;

      const existing = brokerMap.get(broker);
      if (existing) {
        // Sum volumes and values
        existing.BuyerVol += row.BuyerVol;
        existing.BuyerValue += row.BuyerValue;
        existing.SellerVol += row.SellerVol;
        existing.SellerValue += row.SellerValue;
        existing.NetBuyVol += row.NetBuyVol;
        existing.NetBuyValue += row.NetBuyValue;
        existing.NetSellVol += row.NetSellVol;
        existing.NetSellValue += row.NetSellValue;
      } else {
        brokerMap.set(broker, {
          BuyerVol: row.BuyerVol,
          BuyerValue: row.BuyerValue,
          SellerVol: row.SellerVol,
          SellerValue: row.SellerValue,
          NetBuyVol: row.NetBuyVol,
          NetBuyValue: row.NetBuyValue,
          NetSellVol: row.NetSellVol,
          NetSellValue: row.NetSellValue
        });
      }
    });

    // Convert aggregated data to BrokerSummary array and calculate averages
    const aggregatedSummary: BrokerSummary[] = [];
    brokerMap.forEach((data, broker) => {
      // Recalculate averages from aggregated totals
      const buyerAvg = data.BuyerVol > 0 ? data.BuyerValue / data.BuyerVol : 0;
      const sellerAvg = data.SellerVol > 0 ? data.SellerValue / data.SellerVol : 0;
      const netBuyerAvg = data.NetBuyVol > 0 ? data.NetBuyValue / data.NetBuyVol : 0;
      const netSellerAvg = data.NetSellVol > 0 ? data.NetSellValue / data.NetSellVol : 0;

      aggregatedSummary.push({
        BrokerCode: broker,
        BuyerVol: data.BuyerVol,
        BuyerValue: data.BuyerValue,
        SellerVol: data.SellerVol,
        SellerValue: data.SellerValue,
        NetBuyVol: data.NetBuyVol,
        NetBuyValue: data.NetBuyValue,
        NetSellVol: data.NetSellVol,
        NetSellValue: data.NetSellValue,
        BuyerAvg: buyerAvg,
        SellerAvg: sellerAvg,
        NetBuyerAvg: netBuyerAvg,
        NetSellerAvg: netSellerAvg
      });
    });

    // Sort by NetBuyValue descending
    aggregatedSummary.sort((a, b) => b.NetBuyValue - a.NetBuyValue);

    return aggregatedSummary;
  }

  /**
   * Generate sector CSV for a specific date, market type, and sector
   * @param dateSuffix Date string in format YYYYMMDD
   * @param sectorName Sector name (e.g., 'BANK', 'MINING')
   * @param marketType Market type: '' (all), 'RG', 'TN', or 'NG'
   */
  public async generateSector(dateSuffix: string, sectorName: string, marketType: '' | 'RG' | 'TN' | 'NG' = ''): Promise<{ success: boolean; message: string; file?: string; brokerCount?: number }> {
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

      // Validate marketType
      if (marketType && !['RG', 'TN', 'NG'].includes(marketType)) {
        const errorMsg = `Invalid marketType: ${marketType}. Expected '', 'RG', 'TN', or 'NG'`;
        console.error(`❌ ${errorMsg}`);
        return {
          success: false,
          message: errorMsg
        };
      }

      // Build sector mapping if not already loaded
      if (Object.keys(SECTOR_MAPPING).length === 0) {
        await buildSectorMappingFromCsv();
      }

      // Get stocks in this sector
      const stocksInSector = SECTOR_MAPPING[sectorName] || [];
      
      if (stocksInSector.length === 0) {
        console.log(`⚠️ No stocks found for sector: ${sectorName}`);
        return {
          success: false,
          message: `No stocks found for sector: ${sectorName}`
        };
      }

      console.log(`📊 Sector ${sectorName} has ${stocksInSector.length} stocks: ${stocksInSector.slice(0, 5).join(', ')}${stocksInSector.length > 5 ? '...' : ''}`);

      // Determine folder path based on market type
      let folderPrefix: string;
      if (marketType === '') {
        folderPrefix = `broker_summary/broker_summary_${dateSuffix}`;
      } else {
        const marketLower = marketType.toLowerCase();
        folderPrefix = `broker_summary_${marketLower}/broker_summary_${marketLower}_${dateSuffix}`;
      }

      // Check if sector CSV already exists - skip if exists
      const { exists } = await import('../../utils/azureBlob');
      const sectorFilePath = `${folderPrefix}/${sectorName}.csv`;
      try {
        const sectorExists = await exists(sectorFilePath);
        if (sectorExists) {
          console.log(`⏭️ Skipping ${sectorFilePath} - ${sectorName}.csv already exists`);
          return {
            success: true,
            message: `${sectorName}.csv already exists for ${dateSuffix} (${marketType || 'All Trade'})`,
            file: sectorFilePath
          };
        }
      } catch (error) {
        // If check fails, continue with generation
        console.log(`ℹ️ Could not check existence of ${sectorFilePath}, proceeding with generation`);
      }

      // Read and parse all stock CSV files for this sector
      const allBrokerData: BrokerSummary[] = [];
      
      // Batch processing configuration (Phase 4: 6 files at a time)
      const BATCH_SIZE = BATCH_SIZE_PHASE_4; // Phase 4: 6 files
      const MAX_CONCURRENT = MAX_CONCURRENT_REQUESTS_PHASE_4; // Phase 4: 3 concurrent

      for (let i = 0; i < stocksInSector.length; i += BATCH_SIZE) {
        const batch = stocksInSector.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(stocksInSector.length / BATCH_SIZE);
        
        console.log(`📦 Processing sector batch ${batchNum}/${totalBatches} (${batch.length} stocks)...`);
        
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
        
        // Process batch in parallel with concurrency limit
        const batchPromises = batch.map(async (stockCode) => {
          try {
            const stockFilePath = `${folderPrefix}/${stockCode}.csv`;
            const csvContent = await downloadText(stockFilePath);
            const brokerData = this.parseCSV(csvContent);
            return { stockCode, brokerData, success: true };
          } catch (error: any) {
            // Stock might not have data for this date - this is normal
            console.log(`  ⚠️ No data for ${stockCode} on ${dateSuffix} (${marketType || 'All Trade'}) - skipping`);
            return { stockCode, brokerData: [], success: false };
          }
        });
        
        const batchResults = await limitConcurrency(batchPromises, MAX_CONCURRENT);
        
        // Collect results from batch
        batchResults.forEach((result: any) => {
          if (result && result.success && result.brokerData.length > 0) {
            allBrokerData.push(...result.brokerData);
            console.log(`  ✓ Processed ${result.stockCode}: ${result.brokerData.length} brokers`);
          }
        });
        
        // Memory cleanup after batch
        if (global.gc) {
          global.gc();
          const memAfter = process.memoryUsage();
          const heapUsedMB = memAfter.heapUsed / 1024 / 1024;
          console.log(`📊 Sector batch ${batchNum} complete - Memory: ${heapUsedMB.toFixed(2)}MB`);
        }
        
        // Small delay between batches to prevent overwhelming the system
        if (i + BATCH_SIZE < stocksInSector.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      if (allBrokerData.length === 0) {
        console.log(`⚠️ No broker data found for sector ${sectorName} on ${dateSuffix}`);
        return {
          success: false,
          message: `No broker data found for sector ${sectorName} on ${dateSuffix}`
        };
      }

      console.log(`📈 Total broker records for sector ${sectorName}: ${allBrokerData.length}`);

      // Aggregate data per broker
      const aggregatedData = this.aggregateBrokerData(allBrokerData);
      console.log(`📊 Aggregated to ${aggregatedData.length} unique brokers for sector ${sectorName}`);

      // Convert to CSV
      const csvContent = this.convertToCSV(aggregatedData);

      // Save sector CSV to the same folder
      await uploadText(sectorFilePath, csvContent, 'text/csv');

      const brokerCount = aggregatedData.length;
      console.log(`✅ Successfully created ${sectorFilePath} with ${brokerCount} brokers`);

      return {
        success: true,
        message: `${sectorName}.csv created successfully with ${brokerCount} brokers from ${stocksInSector.length} stocks`,
        file: sectorFilePath,
        brokerCount
      };
    } catch (error: any) {
      console.error(`❌ Error generating ${sectorName}.csv:`, error);
      return {
        success: false,
        message: `Failed to generate ${sectorName}.csv: ${error.message}`
      };
    }
  }

  /**
   * Generate sector CSV for multiple dates (batch processing)
   * @param dateSuffixes Array of date strings in format YYYYMMDD
   * @param sectorName Sector name
   * @param marketType Market type: '' (all), 'RG', 'TN', or 'NG'
   */
  public async generateSectorBatch(dateSuffixes: string[], sectorName: string, marketType: '' | 'RG' | 'TN' | 'NG' = '', progressTracker?: { totalBrokers: number; processedBrokers: number; logId: string | null; updateProgress: () => Promise<void> }): Promise<{ success: number; failed: number; skipped: number; results: Array<{ date: string; success: boolean; message: string; file?: string; skipped?: boolean; brokerCount?: number }> }> {
    const results: Array<{ date: string; success: boolean; message: string; file?: string; skipped?: boolean; brokerCount?: number }> = [];
    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    console.log(`📊 Processing ${dateSuffixes.length} dates for sector ${sectorName}, market type: ${marketType || 'All Trade'}`);

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
        console.log(`${progress} Processing date ${dateSuffix} for sector ${sectorName}...`);
        const result = await this.generateSector(dateSuffix, sectorName, marketType);
        
        // Check if skipped (already exists)
        const skipped = result.message.includes('already exists');
        
        const brokerCount = result.brokerCount || 0;
        results.push({
          date: dateSuffix,
          ...result,
          skipped,
          brokerCount
        });

        // Update progress tracker
        if (progressTracker && brokerCount > 0) {
          progressTracker.processedBrokers += brokerCount;
          await progressTracker.updateProgress();
        }

        if (skipped) {
          skippedCount++;
          console.log(`${progress} ✅ ${dateSuffix}: Skipped (already exists)`);
        } else if (result.success) {
          successCount++;
          console.log(`${progress} ✅ ${dateSuffix}: Success (${brokerCount} brokers)`);
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

    console.log(`📊 Batch completed for sector ${sectorName}: ${successCount} success, ${skippedCount} skipped, ${failedCount} failed`);

    return {
      success: successCount,
      failed: failedCount,
      skipped: skippedCount,
      results
    };
  }
}

