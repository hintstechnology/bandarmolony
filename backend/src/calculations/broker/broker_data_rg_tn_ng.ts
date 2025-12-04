import { uploadText, listPaths, exists } from '../../utils/azureBlob';
import { BATCH_SIZE_PHASE_4, MAX_CONCURRENT_REQUESTS_PHASE_4 } from '../../services/dataUpdateService';
import { SchedulerLogService } from '../../services/schedulerLogService';
import { doneSummaryCache } from '../../cache/doneSummaryCacheService';

// Progress tracker interface for thread-safe broker counting
interface ProgressTracker {
  totalBrokers: number;
  processedBrokers: number;
  logId: string | null;
  updateProgress: () => Promise<void>;
}

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

  /**
   * Find all DT files in done-summary folder
   * OPTIMIZED: Uses shared cache to avoid repeated listPaths calls
   * CRITICAL: Filter file yang outputnya sudah ada (RG, TN, NG semua sudah ada)
   */
  private async findAllDtFiles(): Promise<string[]> {
    console.log('🔍 Scanning for DT files in done-summary folder...');
    try {
      // Use shared cache for DT files list
      // Type assertion needed due to TypeScript type inference issue
      const allDtFiles = await (doneSummaryCache as any).getDtFilesList();
      console.log(`📁 Found ${allDtFiles.length} DT files from cache`);
      
      // Sort by date descending (newest first)
      const sortedFiles = allDtFiles.sort((a: string, b: string) => {
        const dateA = a.split('/')[1] || '';
        const dateB = b.split('/')[1] || '';
        return dateB.localeCompare(dateA); // Descending order
      });
      
      // OPTIMIZATION: Pre-check which dates already have broker_data_rg_tn_ng output (BATCH CHECKING for speed)
      console.log("🔍 Pre-checking existing broker_data_rg_tn_ng outputs (batch checking)...");
      const filesToProcess: string[] = [];
      let skippedCount = 0;
      
      // Process in batches for parallel checking (faster than sequential)
      const CHECK_BATCH_SIZE = 20; // Check 20 files in parallel
      const MAX_CONCURRENT_CHECKS = 10; // Max 10 concurrent checks
      
      for (let i = 0; i < sortedFiles.length; i += CHECK_BATCH_SIZE) {
        const batch = sortedFiles.slice(i, i + CHECK_BATCH_SIZE);
        const batchNumber = Math.floor(i / CHECK_BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(sortedFiles.length / CHECK_BATCH_SIZE);
        
        // Process batch checks in parallel with concurrency limit
        const checkPromises = batch.map(async (file: string) => {
          const dateFolder = file.split('/')[1] || '';
          const dateSuffix = dateFolder;
          
          // Check if all types (RG, TN, NG) already have output
          let allExist = true;
          for (const type of ['RG', 'TN', 'NG'] as const) {
            const paths = this.getSummaryPaths(type, dateSuffix);
            try {
              const summaryPrefix = `${paths.brokerSummary}/`;
              const summaryFiles = await listPaths({ prefix: summaryPrefix, maxResults: 1 });
              if (summaryFiles.length === 0) {
                allExist = false;
                break; // At least one type is missing, need to process
              }
            } catch (error) {
              // If check fails, proceed with processing (safer to process than skip)
              allExist = false;
              break;
            }
          }
          
          return { file, dateSuffix, exists: allExist };
        });
        
        // Limit concurrency for checks
        const checkResults: { file: string; dateSuffix: string; exists: boolean }[] = [];
        for (let j = 0; j < checkPromises.length; j += MAX_CONCURRENT_CHECKS) {
          const concurrentChecks = checkPromises.slice(j, j + MAX_CONCURRENT_CHECKS);
          const results = await Promise.all(concurrentChecks);
          checkResults.push(...results);
        }
        
        // Process results
        for (const result of checkResults) {
          if (result.exists) {
            skippedCount++;
            // Only log first few and last few to avoid spam
            if (skippedCount <= 5 || skippedCount > sortedFiles.length - 5) {
              console.log(`⏭️ Broker data (RG/TN/NG) already exists for date ${result.dateSuffix} - skipping`);
            }
          } else {
            // Only log first few to avoid spam
            if (filesToProcess.length < 5) {
              console.log(`✅ Date ${result.dateSuffix} needs processing`);
            }
            filesToProcess.push(result.file);
          }
        }
        
        // Progress update for large batches
        if (totalBatches > 1 && batchNumber % 5 === 0) {
          console.log(`📊 Checked ${Math.min(i + CHECK_BATCH_SIZE, sortedFiles.length)}/${sortedFiles.length} files (${skippedCount} skipped, ${filesToProcess.length} to process)...`);
        }
      }
      
      // Summary log
      if (skippedCount > 5) {
        console.log(`⏭️  ... and ${skippedCount - 5} more dates skipped`);
      }
      if (filesToProcess.length > 5) {
        console.log(`✅ ... and ${filesToProcess.length - 5} more dates need processing`);
      }
      console.log(`📊 Pre-check complete: ${filesToProcess.length} files to process, ${skippedCount} already exist`);
      
      if (filesToProcess.length > 0) {
        console.log(`📋 Processing order (newest first):`);
        const dates = filesToProcess.map((f: string) => f.split('/')[1]).filter((v: string | undefined, i: number, arr: (string | undefined)[]) => v !== undefined && arr.indexOf(v) === i) as string[];
        dates.slice(0, 10).forEach((date: string, idx: number) => {
          console.log(`   ${idx + 1}. ${date}`);
        });
        if (dates.length > 10) {
          console.log(`   ... and ${dates.length - 10} more dates`);
        }
      }
      
      return filesToProcess;
    } catch (error: any) {
      console.error('❌ Error finding DT files:', error.message);
      return [];
    }
  }

  /**
   * Load and process a single DT file
   * OPTIMIZED: Uses shared cache to avoid repeated downloads
   */
  private async loadAndProcessSingleDtFile(blobName: string): Promise<{ data: TransactionData[], dateSuffix: string } | null> {
    try {
      console.log(`📥 Loading file: ${blobName}`);
      
      // Use shared cache for raw content (will cache automatically if not exists)
      const content = await doneSummaryCache.getRawContent(blobName);
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

  private async createBrokerSummaryPerEmiten(data: TransactionData[], dateSuffix: string, type: TransactionType, progressTracker?: ProgressTracker): Promise<{ files: string[]; brokerCount: number }> {
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
    
    // Count total unique brokers processed across all emiten
    const allBrokersSet = new Set<string>();
    for (const emiten of uniqueEmiten) {
      const emitenData = data.filter(row => row.STK_CODE === emiten);
      emitenData.forEach(row => {
        if (row.BRK_COD1) allBrokersSet.add(row.BRK_COD1);
        if (row.BRK_COD2) allBrokersSet.add(row.BRK_COD2);
      });
    }
    const totalBrokerCount = allBrokersSet.size;
    
    // Update progress tracker
    if (progressTracker && totalBrokerCount > 0) {
      progressTracker.processedBrokers += totalBrokerCount;
      await progressTracker.updateProgress();
    }
    
    return { files: createdFiles, brokerCount: totalBrokerCount };
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


  public async generateBrokerData(_dateSuffix?: string, logId?: string | null): Promise<{ success: boolean; message: string; data?: any }> {
    let dtFiles: string[] = [];
    
    try {
      dtFiles = await this.findAllDtFiles();
      if (dtFiles.length === 0) return { success: true, message: `No DT files found - skipped broker data generation` };
      
      // CRITICAL: JANGAN PRE-COUNT - tidak boleh load input sebelum cek existing
      // Active dates akan ditambahkan saat file benar-benar akan diproses (di processSingleDtFile setelah check)
      
      // Create progress tracker based on files processed (not brokers)
      const progressTracker: ProgressTracker = {
        totalBrokers: 0, // No pre-count
        processedBrokers: 0,
        logId: logId || null,
        updateProgress: async () => {
          if (progressTracker.logId) {
            await SchedulerLogService.updateLog(progressTracker.logId, {
              progress_percentage: 0, // Will be updated based on files processed
              current_processing: `Processing broker data files...`
            });
          }
        }
      };
      
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
        
        // Update progress before batch
        if (logId) {
          await SchedulerLogService.updateLog(logId, {
            progress_percentage: Math.round((processed / dtFiles.length) * 100),
            current_processing: `Processing batch ${batchNumber}/${Math.ceil(dtFiles.length / BATCH_SIZE)} (${processed}/${dtFiles.length} dates)`
          });
        }
        
        // Process batch in parallel with concurrency limit, pass progress tracker
        // CRITICAL: File sudah di-filter di findAllDtFiles(), jadi tidak perlu check lagi di sini
        const batchPromises = batch.map(async (blobName) => {
            try {
              // Extract date from blob name first (before loading input)
              const pathParts = blobName.split('/');
              const dateFolder = pathParts[1] || 'unknown'; // 20251021
              const dateSuffix = dateFolder;
              
              // Set active processing date HANYA saat file benar-benar akan diproses (setelah filter)
              doneSummaryCache.addActiveProcessingDate(dateSuffix);
              
              // Only load input if output doesn't exist
              const result = await this.loadAndProcessSingleDtFile(blobName);
              if (!result) {
                return { success: false, skipped: false, dateSuffix, brokerCount: 0 };
              }
              
              const { data, dateSuffix: date } = result;
              
              let totalBrokerCount = 0;
              for (const type of ['RG', 'TN', 'NG'] as const) {
                const filtered = this.filterByType(data, type);
                if (filtered.length === 0) continue;
                const result = await this.createBrokerSummaryPerEmiten(filtered, date, type, progressTracker);
                totalBrokerCount += result.brokerCount;
              }
              
              return { success: true, skipped: false, dateSuffix: date, brokerCount: totalBrokerCount };
            } catch (error: any) {
              console.error(`❌ Error processing ${blobName}:`, error.message);
              return { success: false, skipped: false, error: error.message, brokerCount: 0 };
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
        
        const batchBrokerCount = batchResults.reduce((sum, r: any) => sum + (r?.brokerCount || 0), 0);
        console.log(`📊 Batch ${batchNumber} complete: ✅ ${successful}/${processed} successful, ⏭️ ${skipped} skipped, ${batchBrokerCount} brokers processed`);
        
        // Update progress after batch (based on files processed)
        if (logId) {
          await SchedulerLogService.updateLog(logId, {
            progress_percentage: Math.round((processed / dtFiles.length) * 100),
            current_processing: `Completed batch ${batchNumber}/${Math.ceil(dtFiles.length / BATCH_SIZE)} (${processed}/${dtFiles.length} dates)`
          });
        }
        
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
    } finally {
      // Cleanup: Remove active processing dates setelah selesai
      // NOTE: Untuk broker_data_rg_tn_ng, active dates ditambahkan per file di processSingleDtFile()
      // Jadi kita perlu cleanup semua tanggal yang mungkin sudah ditambahkan
      if (dtFiles && dtFiles.length > 0) {
        dtFiles.forEach(file => {
          const dateMatch = file.match(/done-summary\/(\d{8})\//);
          if (dateMatch && dateMatch[1]) {
            doneSummaryCache.removeActiveProcessingDate(dateMatch[1]);
          }
        });
        console.log(`🧹 Cleaned up active processing dates from cache`);
      }
    }
  }

  // Wrapper to align with scheduler service API
  public async generateBrokerSummarySplitPerType(logId?: string | null): Promise<{ success: boolean; message: string }> {
    const result = await this.generateBrokerData('all', logId);
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
          console.log(`✅ Created ${summaryFiles.files.length} broker summary files for ${date} (skipped files that already exist)`);
          
          processedDates++;
          totalFilesCreated += summaryFiles.files.length;
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
