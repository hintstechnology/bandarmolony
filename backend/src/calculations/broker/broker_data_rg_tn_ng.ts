import { downloadText, uploadText, listPaths, exists } from '../../utils/azureBlob';
import { BATCH_SIZE_PHASE_4, MAX_CONCURRENT_REQUESTS_PHASE_4 } from '../../services/dataUpdateService';

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

// Type definitions, sama seperti broker_summary.ts
type TransactionType = 'RG' | 'TN' | 'NG';
interface TransactionData {
  STK_CODE: string;
  BRK_COD1: string;
  BRK_COD2: string;
  STK_VOLM: number;
  STK_PRIC: number;
  TRX_CODE: string;
  TRX_TYPE: string; // field tambahan
}

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


export class BrokerDataRGTNNGCalculator {
  constructor() { }

  private async findAllDtFiles(): Promise<string[]> {
    console.log('🔍 Scanning for DT files in done-summary folder...');
    try {
      const allFiles = await listPaths({ prefix: 'done-summary/' });
      console.log(`📁 Found ${allFiles.length} total files in done-summary folder`);
      const dtFiles = allFiles.filter(file => file.includes('/DT') && file.endsWith('.csv'));
      
      console.log(`📊 Found ${dtFiles.length} DT files (no date range filter - processing all)`);
      
      // Sort by date descending (newest first)
      const sortedFiles = dtFiles.sort((a, b) => {
        const dateA = a.split('/')[1] || '';
        const dateB = b.split('/')[1] || '';
        return dateB.localeCompare(dateA); // Descending order
      });
      
      if (sortedFiles.length > 0) {
        console.log(`📋 Processing order (newest first):`);
        const dates = sortedFiles.map(f => f.split('/')[1]).filter((v, i, arr) => arr.indexOf(v) === i);
        dates.slice(0, 10).forEach((date, idx) => {
          console.log(`   ${idx + 1}. ${date}`);
        });
        if (dates.length > 10) {
          console.log(`   ... and ${dates.length - 10} more dates`);
        }
      }
      
      return sortedFiles;
    } catch (error: any) {
      console.error('❌ Error finding DT files:', error.message);
      return [];
    }
  }

  private async loadAndProcessSingleDtFile(blobName: string): Promise<{ data: TransactionData[], dateSuffix: string } | null> {
    try {
      console.log(`📥 Downloading file: ${blobName}`);
      const content = await downloadText(blobName);
      if (!content || content.trim().length === 0) {
        console.warn(`⚠️ Empty file or no content: ${blobName}`);
        return null;
      }
      console.log(`✅ Downloaded ${blobName} (${content.length} characters)`);
      const pathParts = blobName.split('/');
      const dateFolder = pathParts[1] || 'unknown';
      const dateSuffix = dateFolder;
      console.log(`📅 Extracted date suffix: ${dateSuffix} from ${blobName}`);
      const data = this.parseTransactionData(content);
      console.log(`✅ Parsed ${data.length} transactions from ${blobName}`);
      return { data, dateSuffix };
    } catch (error: any) {
      console.error(`❌ Error loading file ${blobName}:`, error.message);
      return null;
    }
  }

  private parseTransactionData(content: string): TransactionData[] {
    const lines = content.trim().split('\n');
    const header = lines[0]?.split(';') || [];
    const getIdx = (col: string) => header.findIndex(h => h.trim() === col);
    const iSTK_CODE = getIdx('STK_CODE');
    const iBRK_COD1 = getIdx('BRK_COD1');
    const iBRK_COD2 = getIdx('BRK_COD2');
    const iSTK_VOLM = getIdx('STK_VOLM');
    const iSTK_PRIC = getIdx('STK_PRIC');
    const iTRX_CODE = getIdx('TRX_CODE');
    const iTRX_TYPE = getIdx('TRX_TYPE');
    if ([iSTK_CODE, iBRK_COD1, iBRK_COD2, iSTK_VOLM, iSTK_PRIC, iTRX_CODE, iTRX_TYPE].some(k => k === -1)) return [];
    const data: TransactionData[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line || line.trim().length === 0) continue;
      const values = line.split(';');
      const stockCode = values[iSTK_CODE]?.trim() || '';
      if (stockCode.length === 4) {
        const base: TransactionData = {
          STK_CODE: stockCode,
          BRK_COD1: values[iBRK_COD1]?.trim() || '',
          BRK_COD2: values[iBRK_COD2]?.trim() || '',
          STK_VOLM: parseFloat(values[iSTK_VOLM]?.trim() || '0') || 0,
          STK_PRIC: parseFloat(values[iSTK_PRIC]?.trim() || '0') || 0,
          TRX_CODE: values[iTRX_CODE]?.trim() || '',
          TRX_TYPE: values[iTRX_TYPE]?.trim() || '',
        };
        data.push(base);
      }
    }
    return data;
  }

  private filterByType(data: TransactionData[], type: TransactionType): TransactionData[] {
    return data.filter(row => row.TRX_TYPE === type);
  }

  private getSummaryPaths(type: TransactionType, dateSuffix: string) {
    // Use lowercase type directly (RG -> rg, TN -> tn, NG -> ng)
    const name = type.toLowerCase();
    return {
      brokerSummary: `broker_summary_${name}/broker_summary_${name}_${dateSuffix}`
    };
  }

  private async createBrokerSummaryPerEmiten(data: TransactionData[], dateSuffix: string, type: TransactionType): Promise<string[]> {
    const paths = this.getSummaryPaths(type, dateSuffix);
    const uniqueEmiten = [...new Set(data.map(row => row.STK_CODE))];
    const createdFiles: string[] = [];
    const skippedFiles: string[] = [];
    
    for (const emiten of uniqueEmiten) {
      const filename = `${paths.brokerSummary}/${emiten}.csv`;
      
      // Check if file already exists - skip if exists
      try {
        const fileExists = await exists(filename);
        if (fileExists) {
          console.log(`⏭️ Skipping ${filename} - file already exists`);
          skippedFiles.push(filename);
          continue;
        }
      } catch (error: any) {
        // If check fails, continue with generation (might be folder not found yet)
        console.log(`ℹ️ Could not check existence of ${filename}, proceeding with generation`);
      }
      
      const emitenData = data.filter(row => row.STK_CODE === emiten);
      const buyerGroups = new Map<string, TransactionData[]>();
      emitenData.forEach(row => {
        const broker = row.BRK_COD2;
        if (!buyerGroups.has(broker)) buyerGroups.set(broker, []);
        buyerGroups.get(broker)!.push(row);
      });
      const buyerSummary = new Map<string, { totalVol: number; avgPrice: number; transactionCount: number; totalValue: number }>();
      buyerGroups.forEach((txs, broker) => {
        const totalVol = txs.reduce((s, t) => s + t.STK_VOLM, 0);
        const totalValue = txs.reduce((s, t) => s + (t.STK_VOLM * t.STK_PRIC), 0);
        const avgPrice = totalVol > 0 ? totalValue / totalVol : 0;
        buyerSummary.set(broker, { totalVol, avgPrice, transactionCount: txs.length, totalValue });
      });
      const sellerGroups = new Map<string, TransactionData[]>();
      emitenData.forEach(row => {
        const broker = row.BRK_COD1;
        if (!sellerGroups.has(broker)) sellerGroups.set(broker, []);
        sellerGroups.get(broker)!.push(row);
      });
      const sellerSummary = new Map<string, { totalVol: number; avgPrice: number; transactionCount: number; totalValue: number }>();
      sellerGroups.forEach((txs, broker) => {
        const totalVol = txs.reduce((s, t) => s + t.STK_VOLM, 0);
        const totalValue = txs.reduce((s, t) => s + (t.STK_VOLM * t.STK_PRIC), 0);
        const avgPrice = totalVol > 0 ? totalValue / totalVol : 0;
        sellerSummary.set(broker, { totalVol, avgPrice, transactionCount: txs.length, totalValue });
      });
      const allBrokers = new Set([...buyerSummary.keys(), ...sellerSummary.keys()]);
      const finalSummary: BrokerSummary[] = [];
      allBrokers.forEach(broker => {
        const buyer = buyerSummary.get(broker) || { totalVol: 0, avgPrice: 0, transactionCount: 0, totalValue: 0 };
        const seller = sellerSummary.get(broker) || { totalVol: 0, avgPrice: 0, transactionCount: 0, totalValue: 0 };
        
        // Calculate net values (before SWAPPED)
        const rawNetBuyVol = buyer.totalVol - seller.totalVol;
        const rawNetBuyValue = buyer.totalValue - seller.totalValue;
        let netBuyVol = 0;
        let netBuyValue = 0;
        let netSellVol = 0;
        let netSellValue = 0;
        
        // If NetBuy is negative, it becomes NetSell (and NetBuy is set to 0)
        // If NetBuy is positive, NetSell is 0 (and NetBuy keeps the value)
        if (rawNetBuyVol < 0 || rawNetBuyValue < 0) {
          // NetBuy is negative, so it becomes NetSell
          netSellVol = Math.abs(rawNetBuyVol);
          netSellValue = Math.abs(rawNetBuyValue);
          netBuyVol = 0;
          netBuyValue = 0;
        } else {
          // NetBuy is positive or zero, keep it and NetSell is 0
          netBuyVol = rawNetBuyVol;
          netBuyValue = rawNetBuyValue;
          netSellVol = 0;
          netSellValue = 0;
        }
        
        // Calculate averages
        const netBuyerAvg = netBuyVol > 0 ? netBuyValue / netBuyVol : 0;
        const netSellerAvg = netSellVol > 0 ? netSellValue / netSellVol : 0;
        
        // SWAPPED: Kolom Buyer isinya data Seller, kolom Seller isinya data Buyer
        // Ini agar frontend tidak perlu swap lagi (sesuai dengan CSV yang kolomnya tertukar)
        finalSummary.push({
          BrokerCode: broker,
          BuyerVol: seller.totalVol,      // SWAPPED: Kolom Buyer = data Seller
          BuyerValue: seller.totalValue,  // SWAPPED: Kolom Buyer = data Seller
          SellerVol: buyer.totalVol,      // SWAPPED: Kolom Seller = data Buyer
          SellerValue: buyer.totalValue,  // SWAPPED: Kolom Seller = data Buyer
          NetBuyVol: netBuyVol,
          NetBuyValue: netBuyValue,
          NetSellVol: netSellVol,
          NetSellValue: netSellValue,
          BuyerAvg: seller.avgPrice,      // SWAPPED: Kolom BuyerAvg = SellerAvg
          SellerAvg: buyer.avgPrice,      // SWAPPED: Kolom SellerAvg = BuyerAvg
          NetBuyerAvg: netBuyerAvg,
          NetSellerAvg: netSellerAvg
        });
      });
      finalSummary.sort((a, b) => b.NetBuyValue - a.NetBuyValue);
      await this.saveToAzure(filename, finalSummary);
      createdFiles.push(filename);
    }
    
    if (skippedFiles.length > 0) {
      console.log(`⏭️ Skipped ${skippedFiles.length} files that already exist`);
    }
    
    return createdFiles;
  }


  private async saveToAzure(filename: string, data: any[]): Promise<string> {
    if (!data || data.length === 0) {
      console.warn(`⚠️ No data to save for ${filename}, skipping upload`);
      return filename;
    }
    try {
      const headers = Object.keys(data[0]);
      const csvContent = [headers.join(','), ...data.map(row => headers.map(header => row[header]).join(','))].join('\n');
      console.log(`📤 Uploading ${filename} (${data.length} rows, ${csvContent.length} bytes)...`);
      await uploadText(filename, csvContent, 'text/csv');
      console.log(`✅ Successfully uploaded ${filename}`);
      return filename;
    } catch (error: any) {
      console.error(`❌ Failed to upload ${filename}:`, error.message);
      throw error;
    }
  }

  public async generateBrokerData(_dateSuffix?: string): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      const dtFiles = await this.findAllDtFiles();
      if (dtFiles.length === 0) return { success: true, message: `No DT files found - skipped broker data generation` };
      
      // Process files in batches
      const BATCH_SIZE = BATCH_SIZE_PHASE_4; // Phase 4: 6 files at a time
      const MAX_CONCURRENT = MAX_CONCURRENT_REQUESTS_PHASE_4; // Phase 4: 3 concurrent
      let processed = 0;
      let successful = 0;
      let skipped = 0;
      
      for (let i = 0; i < dtFiles.length; i += BATCH_SIZE) {
        const batch = dtFiles.slice(i, i + BATCH_SIZE);
        const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
        console.log(`📦 Processing batch ${batchNumber}/${Math.ceil(dtFiles.length / BATCH_SIZE)} (${batch.length} files)`);
        
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
        const batchPromises = batch.map(async (blobName) => {
            try {
              // Extract date from blob name first (before loading input)
              const pathParts = blobName.split('/');
              const dateFolder = pathParts[1] || 'unknown'; // 20251021
              const dateSuffix = dateFolder;
              
              // Check if output already exists for this date BEFORE loading input
              // Check key output files for each type (RG, TN, NG)
              let shouldSkip = true;
              
              for (const type of ['RG', 'TN', 'NG'] as const) {
                const paths = this.getSummaryPaths(type, dateSuffix);
                // Check if at least one output file exists for this type and date
                try {
                  // List files in broker_summary folder for this type and date
                  const summaryPrefix = `${paths.brokerSummary}/`;
                  const summaryFiles = await listPaths({ prefix: summaryPrefix, maxResults: 1 });
                  if (summaryFiles.length === 0) {
                    shouldSkip = false;
                    break; // At least one type is missing, need to process
                  }
                } catch (error) {
                  // If check fails, continue with processing
                  shouldSkip = false;
                  break;
                }
              }
              
              if (shouldSkip) {
                console.log(`⏭️ Broker data (RG/TN/NG) already exists for date ${dateSuffix} - skipping`);
                return { success: true, skipped: true, dateSuffix };
              }
              
              // Only load input if output doesn't exist
              const result = await this.loadAndProcessSingleDtFile(blobName);
              if (!result) {
                return { success: false, skipped: false, dateSuffix };
              }
              
              const { data, dateSuffix: date } = result;
              
              for (const type of ['RG', 'TN', 'NG'] as const) {
                const filtered = this.filterByType(data, type);
                if (filtered.length === 0) continue;
                await this.createBrokerSummaryPerEmiten(filtered, date, type);
              }
              
              return { success: true, skipped: false, dateSuffix: date };
            } catch (error: any) {
              console.error(`❌ Error processing ${blobName}:`, error.message);
              return { success: false, skipped: false, error: error.message };
            }
          });
        const batchResults = await limitConcurrency(batchPromises, MAX_CONCURRENT);
        
        // Collect results
        batchResults.forEach((result) => {
          if (result) {
            processed++;
            if (result.success) {
              successful++;
              if (result.skipped) {
                skipped++;
              }
            }
          } else {
            processed++;
          }
        });
        
        console.log(`📊 Batch ${batchNumber} complete: ✅ ${successful}/${processed} successful, ⏭️ ${skipped} skipped`);
        
        // Memory cleanup after batch
        if (global.gc) {
          global.gc();
          const memAfter = process.memoryUsage();
          const heapUsedMB = memAfter.heapUsed / 1024 / 1024;
          console.log(`📊 Batch ${batchNumber} complete - Memory: ${heapUsedMB.toFixed(2)}MB`);
        }
        
        // Small delay between batches
        if (i + BATCH_SIZE < dtFiles.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      return { success: true, message: `Broker RG/TN/NG data generated: ${successful}/${processed} successful, ${skipped} skipped` };
    } catch (e) {
      const error = e as Error;
      return { success: false, message: error.message };
    }
  }

  // Wrapper to align with scheduler service API
  public async generateBrokerSummarySplitPerType(): Promise<{ success: boolean; message: string }> {
    const result = await this.generateBrokerData('all');
    return { success: result.success, message: result.message };
  }

  // Generate broker data for specific type only (RG, TN, or NG)
  public async generateBrokerDataForType(type: 'RG' | 'TN' | 'NG'): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      console.log(`🔄 Starting Broker ${type} data generation...`);
      const dtFiles = await this.findAllDtFiles();
      console.log(`📊 Found ${dtFiles.length} DT files to process`);
      
      if (dtFiles.length === 0) {
        console.warn(`⚠️ No DT files found - skipped broker data generation for ${type}`);
        return { success: true, message: `No DT files found - skipped broker data generation for ${type}` };
      }
      
      let processedDates = 0;
      let totalFilesCreated = 0;
      
      for (const blobName of dtFiles) {
        try {
          console.log(`📂 Processing file: ${blobName}`);
          const result = await this.loadAndProcessSingleDtFile(blobName);
          if (!result) {
            console.warn(`⚠️ Failed to load file: ${blobName}`);
            continue;
          }
          
          const { data, dateSuffix: date } = result;
          console.log(`📊 Loaded ${data.length} transactions from ${date}`);
          
          const filtered = this.filterByType(data, type);
          console.log(`🔍 Filtered to ${filtered.length} transactions for type ${type}`);
          
          if (filtered.length === 0) {
            console.log(`⏭️ Skipping ${date} - no ${type} transactions found`);
            continue;
          }
          
          console.log(`📝 Creating broker summary for ${date} (${type})...`);
          const summaryFiles = await this.createBrokerSummaryPerEmiten(filtered, date, type);
          console.log(`✅ Created ${summaryFiles.length} broker summary files for ${date} (skipped files that already exist)`);
          
          processedDates++;
          totalFilesCreated += summaryFiles.length;
        } catch (error: any) {
          console.error(`❌ Error processing file ${blobName}:`, error.message);
          continue;
        }
      }
      
      const message = `Broker ${type} data generated for ${processedDates} dates (${totalFilesCreated} files created)`;
      console.log(`✅ ${message}`);
      return { success: true, message };
    } catch (e) {
      const error = e as Error;
      console.error(`❌ Error in generateBrokerDataForType (${type}):`, error.message);
      return { success: false, message: error.message };
    }
  }
}

export default BrokerDataRGTNNGCalculator;
