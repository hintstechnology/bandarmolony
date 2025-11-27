// rrgAutoGenerate.ts
// RRG Auto-generation service similar to RRC

import { 
  calculateRrgStock, 
  listAvailableStocks,
  listAvailableIndexesForRrg
} from '../calculations/rrg/rrg_stock';
import { 
  calculateRrgSector as calculateRrgSectorFromSector,
  listAvailableSectors as listAvailableSectorsFromSector
} from '../calculations/rrg/rrg_sector';
import { generateRrgStockScanner } from '../calculations/rrg/rrg_scanner_stock';
import { generateRrgSectorScanner } from '../calculations/rrg/rrg_scanner_sector';
import { exists } from '../utils/azureBlob';
import { SchedulerLogService } from './schedulerLogService';
import { BATCH_SIZE_PHASE_2, MAX_CONCURRENT_REQUESTS_PHASE_2 } from './dataUpdateService';

let isGenerating = false;
let lastGenerationTime: Date | null = null;
let generationProgress = {
  total: 0,
  completed: 0,
  current: '',
  errors: 0
};

// Helper function to limit concurrency for Phase 2
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

// Main RRG auto-generation function
export async function preGenerateAllRRG(forceOverride: boolean = false, triggerType: 'startup' | 'scheduled' | 'manual' | 'debug' = 'startup', logId?: string | null): Promise<void> {
  if (isGenerating) {
    console.warn('⚠️ RRG generation already in progress, skipping');
    return;
  }

  isGenerating = true;
  lastGenerationTime = new Date();
  
  // Only create log entry if logId is not provided (called from scheduler, not manual trigger)
  let finalLogId = logId;
  if (!finalLogId) {
    const logEntry = await SchedulerLogService.createLog({
      feature_name: 'rrg',
      trigger_type: triggerType,
      triggered_by: triggerType === 'manual' ? 'user' : 'system',
      status: 'running',
      environment: process.env['NODE_ENV'] || 'development'
    });

    if (!logEntry) {
      console.error('❌ Failed to create scheduler log entry');
      isGenerating = false;
      return;
    }

    finalLogId = logEntry.id!;
  }
  
  try {
    console.log(`🚀 RRG auto-generation started (${triggerType}) - ${forceOverride ? 'FORCE OVERRIDE' : 'SKIP EXISTING FILES'}`);
    
    // Get available data
    const [stocks, sectors, indexes] = await Promise.all([
      listAvailableStocks(),
      listAvailableSectorsFromSector(),
      listAvailableIndexesForRrg()
    ]);

    console.log(`📊 Found ${stocks.length} stocks, ${sectors.length} sectors, ${indexes.length} indexes`);
    console.log(`🔧 Force Override: ${forceOverride ? 'YES (will regenerate all)' : 'NO (will skip existing)'}`);

    // Check if processing is complete (when not forcing override)
    if (!forceOverride) {
      console.log('🔍 Checking if processing is already complete...');
      const completenessCheck = await SchedulerLogService.isProcessingComplete('rrg', {
        stocks: stocks.length,
        sectors: sectors.length,
        indexes: indexes.length
      });
      
      console.log(`📋 Completeness check result:`, completenessCheck);
      
      if (completenessCheck.isComplete) {
        console.log('✅ All RRG files already processed, skipping generation');
        console.log(`   - Stocks: ${completenessCheck.missingCounts.stocks} files exist`);
        console.log(`   - Sectors: ${completenessCheck.missingCounts.sectors} files exist`);
        console.log(`   - Indexes: ${completenessCheck.missingCounts.indexes} files exist`);
        if (finalLogId) {
          const totalProcessed = completenessCheck.missingCounts.stocks + completenessCheck.missingCounts.sectors + completenessCheck.missingCounts.indexes;
          await SchedulerLogService.markCompleted(finalLogId, {
            total_files_processed: totalProcessed,
            files_created: 0,
            files_skipped: totalProcessed,
            files_failed: 0
          });
        }
        isGenerating = false;
        return;
      }
      
      console.log(`📝 Processing will continue - missing files detected`);
      console.log(`   - Missing stocks: ${stocks.length - (completenessCheck.missingCounts.stocks || 0)}`);
      console.log(`   - Missing sectors: ${sectors.length - (completenessCheck.missingCounts.sectors || 0)}`);
      console.log(`   - Missing indexes: ${indexes.length - (completenessCheck.missingCounts.indexes || 0)}`);
    }

    // Calculate total work
    const totalWork = stocks.length + sectors.length + indexes.length + 2; // +2 for scanners
    generationProgress = {
      total: totalWork,
      completed: 0,
      current: 'Starting RRG generation...',
      errors: 0
    };

    // Counters for logging
    let stockProcessed = 0, stockSuccess = 0, stockFailed = 0;
    let sectorProcessed = 0, sectorSuccess = 0, sectorFailed = 0;
    let indexProcessed = 0, indexSuccess = 0, indexFailed = 0;
    let filesCreated = 0, filesUpdated = 0, filesSkipped = 0, filesFailed = 0;

    // Process stocks in BATCHES (parallel) for better performance
    const STOCK_BATCH_SIZE = BATCH_SIZE_PHASE_2; // Phase 2: 500 stocks at a time
    console.log(`📦 Processing ${stocks.length} stocks in batches of ${STOCK_BATCH_SIZE}...`);
    
    for (let i = 0; i < stocks.length; i += STOCK_BATCH_SIZE) {
      const batch = stocks.slice(i, i + STOCK_BATCH_SIZE);
      const batchNumber = Math.floor(i / STOCK_BATCH_SIZE) + 1;
      console.log(`📦 Processing stock batch ${batchNumber}/${Math.ceil(stocks.length / STOCK_BATCH_SIZE)}: ${batch.join(', ')}`);
      
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
      
      // Process batch in parallel with concurrency limit 250
      const batchPromises = batch.map(async (stock) => {
        const cleanedStock = stock.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        
        stockProcessed++;
        
        // Always regenerate RRG data to ensure latest data is included
        // Skip logic removed to ensure data is always fresh

        try {
          const csvContent = await calculateRrgStock(cleanedStock, 'COMPOSITE');
          if (csvContent && csvContent.length > 0) {
            stockSuccess++;
            filesCreated++;
            console.log(`✅ Generated RRG data for stock: ${cleanedStock}`);
          } else {
            stockFailed++;
            filesFailed++;
            console.log(`❌ Failed to generate RRG data for stock: ${cleanedStock}`);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          
          // Skip stocks that don't have CSV files (they may have been delisted or moved)
          if (errorMessage.includes('tidak ditemukan') || errorMessage.includes('not found') || errorMessage.includes('CSV')) {
            filesSkipped++;
            console.log(`⏭️ Skipping stock ${cleanedStock}: CSV file not found (may be delisted)`);
          } else {
            stockFailed++;
            filesFailed++;
            console.error(`❌ Error generating RRG data for stock ${cleanedStock}:`, error);
          }
        }
      });
      await limitConcurrency(batchPromises, MAX_CONCURRENT_REQUESTS_PHASE_2);
      
      // Update progress after batch
      generationProgress.completed = stockProcessed;
      generationProgress.errors = stockFailed;
      
      if (finalLogId) {
        await SchedulerLogService.updateLog(finalLogId, {
          progress_percentage: Math.round((generationProgress.completed / generationProgress.total) * 100),
          current_processing: `Completed stock batch ${Math.floor(i / STOCK_BATCH_SIZE) + 1}/${Math.ceil(stocks.length / STOCK_BATCH_SIZE)} - ${stockProcessed}/${stocks.length} stocks`
        });
      }
      
      // Memory cleanup after batch
      if (global.gc) {
        global.gc();
        const memAfter = process.memoryUsage();
        const heapUsedMB = memAfter.heapUsed / 1024 / 1024;
        console.log(`📊 Stock batch ${batchNumber} complete - Memory: ${heapUsedMB.toFixed(2)}MB`);
      }
      
      // Small delay for event loop breathing room
      if (i + STOCK_BATCH_SIZE < stocks.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Process sectors
    console.log('🏢 Processing sectors...');
    for (const sector of sectors) {
      const cleanedSector = sector.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      const filePath = `rrg_output/sector/o2-rrg-${cleanedSector}.csv`;
      
      generationProgress.current = `Processing sector: ${cleanedSector}`;
      generationProgress.completed = stockProcessed + sectorProcessed;
      generationProgress.errors = stockFailed + sectorFailed;
      
      if (finalLogId) {
        await SchedulerLogService.updateLog(finalLogId, {
          progress_percentage: Math.round((generationProgress.completed / generationProgress.total) * 100),
          current_processing: generationProgress.current
        });
      }

      sectorProcessed++;
      
      if (!forceOverride && await exists(filePath)) {
        filesSkipped++;
        console.log(`⏭️ Skipping existing sector: ${cleanedSector}`);
        continue;
      }

      try {
        // Use original sector name (with spaces) for calculation, cleanedSector for filename only
        const csvContent = await calculateRrgSectorFromSector(sector, 'COMPOSITE');
        if (csvContent && csvContent.length > 0) {
          sectorSuccess++;
          filesCreated++;
          console.log(`✅ Generated RRG data for sector: ${sector} -> ${cleanedSector}`);
        } else {
          sectorFailed++;
          filesFailed++;
          console.log(`❌ Failed to generate RRG data for sector: ${sector}`);
        }
      } catch (error) {
        sectorFailed++;
        filesFailed++;
        console.error(`❌ Error generating RRG data for sector ${sector}:`, error);
      }
    }

    // Process indexes
    console.log('📊 Processing indexes...');
    for (const index of indexes) {
      const cleanedIndex = index.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      const filePath = `rrg_output/index/o1-rrg-${cleanedIndex}.csv`;
      
      generationProgress.current = `Processing index: ${cleanedIndex}`;
      generationProgress.completed = stockProcessed + sectorProcessed + indexProcessed;
      generationProgress.errors = stockFailed + sectorFailed + indexFailed;
      
      if (finalLogId) {
        await SchedulerLogService.updateLog(finalLogId, {
          progress_percentage: Math.round((generationProgress.completed / generationProgress.total) * 100),
          current_processing: generationProgress.current
        });
      }

      indexProcessed++;
      
      if (!forceOverride && await exists(filePath)) {
        filesSkipped++;
        console.log(`⏭️ Skipping existing index: ${cleanedIndex}`);
        continue;
      }

      try {
        // For indexes, we might need a different calculation function
        // For now, we'll skip index processing
        indexSuccess++;
        filesSkipped++;
        console.log(`⏭️ Skipping index processing: ${cleanedIndex}`);
      } catch (error) {
        indexFailed++;
        filesFailed++;
        console.error(`❌ Error processing index ${cleanedIndex}:`, error);
      }
    }

    // Generate scanners
    console.log('🔍 Generating scanners...');
    generationProgress.current = 'Generating stock scanner...';
    generationProgress.completed = stockProcessed + sectorProcessed + indexProcessed;
    
    if (finalLogId) {
      await SchedulerLogService.updateLog(finalLogId, {
        progress_percentage: Math.round((generationProgress.completed / generationProgress.total) * 100),
        current_processing: generationProgress.current
      });
    }

    try {
      await generateRrgStockScanner();
      filesCreated++;
      console.log('✅ Generated stock scanner');
    } catch (error) {
      filesFailed++;
      console.error('❌ Error generating stock scanner:', error);
    }

    generationProgress.current = 'Generating sector scanner...';
    generationProgress.completed = stockProcessed + sectorProcessed + indexProcessed + 1;
    
    if (finalLogId) {
      await SchedulerLogService.updateLog(finalLogId, {
        progress_percentage: Math.round((generationProgress.completed / generationProgress.total) * 100),
        current_processing: generationProgress.current
      });
    }

    try {
      await generateRrgSectorScanner();
      filesCreated++;
      console.log('✅ Generated sector scanner');
    } catch (error) {
      filesFailed++;
      console.error('❌ Error generating sector scanner:', error);
    }

    // Mark as completed
    generationProgress.completed = generationProgress.total;
    generationProgress.current = 'Completed';
    
    if (finalLogId) {
      // Store stock/sector/index stats in error_details for reference
      await SchedulerLogService.updateLog(finalLogId, {
        error_details: {
          stock_processed: stockProcessed,
          stock_success: stockSuccess,
          stock_failed: stockFailed,
          sector_processed: sectorProcessed,
          sector_success: sectorSuccess,
          sector_failed: sectorFailed,
          index_processed: indexProcessed,
          index_success: indexSuccess,
          index_failed: indexFailed
        }
      });
      
      await SchedulerLogService.markCompleted(finalLogId, {
        total_files_processed: stockProcessed + sectorProcessed + indexProcessed + 2,
        files_created: filesCreated,
        files_updated: filesUpdated,
        files_skipped: filesSkipped,
        files_failed: filesFailed
      });
    }

    const totalProcessed = stockProcessed + sectorProcessed + indexProcessed;
    console.log(`✅ RRG scheduler completed - Success: ${filesCreated}, Skipped: ${filesSkipped}, Failed: ${filesFailed}, Total: ${totalProcessed}`);
    console.log(`📊 Processed: ${stockProcessed} stocks, ${sectorProcessed} sectors, ${indexProcessed} indexes`);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ RRG scheduler error: ${errorMessage}`);
    
    if (finalLogId) {
      await SchedulerLogService.markFailed(finalLogId, 'RRG auto-generation failed', error);
    }
    
    generationProgress.errors++;
  } finally {
    isGenerating = false;
  }
}

// Force regenerate all RRG data
export async function forceRegenerate(): Promise<void> {
  await preGenerateAllRRG(true, 'manual'); // Changed from 'scheduled' to 'manual'
}

// Get generation status
export function getGenerationStatus(): { isGenerating: boolean; lastGenerationTime: Date | null; progress: typeof generationProgress } {
  return {
    isGenerating,
    lastGenerationTime,
    progress: generationProgress
  };
}
