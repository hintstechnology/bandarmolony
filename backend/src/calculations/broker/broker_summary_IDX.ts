import { downloadText, uploadText, listPaths } from '../../utils/azureBlob';

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

export class BrokerSummaryIDXCalculator {
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
   * Aggregate broker summary data across all emiten
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
   * Generate IDX.csv for a specific date and market type
   * @param dateSuffix Date string in format YYYYMMDD
   * @param marketType Market type: '' (all), 'RG', 'TN', or 'NG'
   */
  public async generateIDX(dateSuffix: string, marketType: '' | 'RG' | 'TN' | 'NG' = ''): Promise<{ success: boolean; message: string; file?: string }> {
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

      // Determine folder path based on market type
      let folderPrefix: string;
      if (marketType === '') {
        folderPrefix = `broker_summary/broker_summary_${dateSuffix}`;
      } else {
        const marketLower = marketType.toLowerCase();
        folderPrefix = `broker_summary_${marketLower}/broker_summary_${marketLower}_${dateSuffix}`;
      }

      console.log(`🔍 Scanning for emiten CSV files in: ${folderPrefix}/`);

      // Check if IDX.csv already exists - skip if exists
      const { exists } = await import('../../utils/azureBlob');
      const idxFilePath = `${folderPrefix}/IDX.csv`;
      try {
        const idxExists = await exists(idxFilePath);
        if (idxExists) {
          console.log(`⏭️ Skipping ${idxFilePath} - IDX.csv already exists`);
          return {
            success: true,
            message: `IDX.csv already exists for ${dateSuffix} (${marketType || 'All Trade'})`,
            file: idxFilePath
          };
        }
      } catch (error) {
        // If check fails, continue with generation
        console.log(`ℹ️ Could not check existence of ${idxFilePath}, proceeding with generation`);
      }

      // List all files in the folder
      const allFiles = await listPaths({ prefix: `${folderPrefix}/` });
      
      // Filter for CSV files with 4-letter emiten codes (e.g., BBCA.csv, BBRI.csv)
      // Exclude IDX.csv itself if it already exists
      const emitenFiles = allFiles.filter(file => {
        const fileName = file.split('/').pop() || '';
        if (!fileName.endsWith('.csv')) return false;
        if (fileName.toUpperCase() === 'IDX.CSV') return false;
        
        const emitenCode = fileName.replace('.csv', '');
        // Only include files with exactly 4 uppercase letters
        return emitenCode.length === 4 && 
               /^[A-Z]{4}$/.test(emitenCode);
      });

      if (emitenFiles.length === 0) {
        console.log(`⚠️ No emiten CSV files found in ${folderPrefix}/`);
        return {
          success: false,
          message: `No emiten CSV files found in ${folderPrefix}/`
        };
      }

      console.log(`📊 Found ${emitenFiles.length} emiten CSV files`);

      // Batch processing configuration (Phase 4: 50 files at a time)
      const BATCH_SIZE = 50; // Phase 4: 50 files
      const MAX_CONCURRENT = 25; // Phase 4: 25 concurrent

      // Read and parse all emiten CSV files in batches
      const allBrokerData: BrokerSummary[] = [];
      
      for (let i = 0; i < emitenFiles.length; i += BATCH_SIZE) {
        const batch = emitenFiles.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(emitenFiles.length / BATCH_SIZE);
        
        console.log(`📦 Processing emiten batch ${batchNum}/${totalBatches} (${batch.length} files)...`);
        
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
        
        // Process batch in parallel with concurrency limit 25
        const batchPromises = batch.map(async (file) => {
            try {
              const csvContent = await downloadText(file);
              const brokerData = this.parseCSV(csvContent);
              const emitenCode = file.split('/').pop()?.replace('.csv', '') || 'unknown';
              return { emitenCode, brokerData, success: true };
            } catch (error: any) {
              const emitenCode = file.split('/').pop()?.replace('.csv', '') || 'unknown';
              console.warn(`  ⚠️ Failed to process ${emitenCode}: ${error.message}`);
              return { emitenCode, brokerData: [], success: false };
            }
          });
        const batchResults = await limitConcurrency(batchPromises, MAX_CONCURRENT);
        
        // Collect results from batch
        batchResults.forEach((result: any) => {
          if (result && result.success) {
            allBrokerData.push(...result.brokerData);
            console.log(`  ✓ Processed ${result.emitenCode}: ${result.brokerData.length} brokers`);
          }
        });
        
        // Memory cleanup after batch
        if (global.gc) {
          global.gc();
          const memAfter = process.memoryUsage();
          const heapUsedMB = memAfter.heapUsed / 1024 / 1024;
          console.log(`📊 Emiten batch ${batchNum} complete - Memory: ${heapUsedMB.toFixed(2)}MB`);
        }
        
        // Small delay between batches to prevent overwhelming the system
        if (i + BATCH_SIZE < emitenFiles.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      if (allBrokerData.length === 0) {
        console.log(`⚠️ No broker data found in any emiten files`);
        return {
          success: false,
          message: `No broker data found in emiten files`
        };
      }

      console.log(`📈 Total broker records across all emiten: ${allBrokerData.length}`);

      // Aggregate data per broker
      const aggregatedData = this.aggregateBrokerData(allBrokerData);
      console.log(`📊 Aggregated to ${aggregatedData.length} unique brokers`);

      // Convert to CSV
      const csvContent = this.convertToCSV(aggregatedData);

      // Save IDX.csv to the same folder (reuse variable from skip check)
      await uploadText(idxFilePath, csvContent, 'text/csv');

      console.log(`✅ Successfully created ${idxFilePath} with ${aggregatedData.length} brokers`);

      return {
        success: true,
        message: `IDX.csv created successfully with ${aggregatedData.length} brokers from ${emitenFiles.length} emiten files`,
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
   * @param marketType Market type: '' (all), 'RG', 'TN', or 'NG'
   */
  public async generateIDXBatch(dateSuffixes: string[], marketType: '' | 'RG' | 'TN' | 'NG' = ''): Promise<{ success: number; failed: number; skipped: number; results: Array<{ date: string; success: boolean; message: string; file?: string; skipped?: boolean }> }> {
    const results: Array<{ date: string; success: boolean; message: string; file?: string; skipped?: boolean }> = [];
    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    console.log(`📊 Processing ${dateSuffixes.length} dates for market type: ${marketType || 'All Trade'}`);

    for (let i = 0; i < dateSuffixes.length; i++) {
      const dateSuffixRaw = dateSuffixes[i];
      
      // Skip if dateSuffix is undefined or empty
      if (!dateSuffixRaw || typeof dateSuffixRaw !== 'string' || dateSuffixRaw.trim() === '') {
        console.warn(`⚠️ Skipping invalid date at index ${i}: ${dateSuffixRaw}`);
        continue;
      }
      
      // At this point, TypeScript knows dateSuffix is a valid string
      const dateSuffix: string = dateSuffixRaw;
      const progress = `[${i + 1}/${dateSuffixes.length}]`;
      
      try {
        console.log(`${progress} Processing date ${dateSuffix}...`);
        const result = await this.generateIDX(dateSuffix, marketType);
        
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
