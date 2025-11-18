// rrcAutoGenerate.ts
// Auto-generate RRC outputs on server start and scheduled updates

import { 
  calculateRrcSector, 
  calculateRrcStock, 
  calculateRrcIndex,
  listAvailableSectors,
  listAvailableIndexes 
} from '../calculations/rrc/rrc_sector';
import { exists } from '../utils/azureBlob';
import { SchedulerLogService, SchedulerLog } from './schedulerLogService';
import { BATCH_SIZE_PHASE_1_2 } from './dataUpdateService';

// Global state for tracking generation status
let isGenerating = false;
let lastGenerationTime: Date | null = null;
let generationProgress = {
  total: 0,
  completed: 0,
  current: '',
  errors: 0
};

// Current log entry for database tracking
let currentLogId: string | null = null;

// Azure configuration
const AZURE_CONFIG = {
  stockDir: 'stock',
  indexDir: 'index', 
  outputDir: 'rrc_output'
};

/**
 * Get current generation status
 */
export function getGenerationStatus() {
  return {
    isGenerating,
    lastGenerationTime,
    progress: generationProgress
  };
}

/**
 * Pre-generate all possible RRC outputs with optional force override
 */
export async function preGenerateAllRRC(forceOverride: boolean = false, triggerType: 'startup' | 'scheduled' | 'manual' | 'debug' = 'startup', logId?: string | null): Promise<void> {
  if (isGenerating) {
    console.warn('⚠️ RRC generation already in progress, skipping');
    return;
  }

  isGenerating = true;
  generationProgress = {
    total: 0,
    completed: 0,
    current: '',
    errors: 0
  };

  console.log(`🚀 RRC auto-generation started ${forceOverride ? '(FORCE OVERRIDE MODE)' : '(SKIP EXISTING FILES)'}`);
  const startTime = new Date();

  // Only create log entry if logId is not provided (called from scheduler, not manual trigger)
  let finalLogId = logId;
  if (!finalLogId) {
    const logData: Partial<SchedulerLog> = {
      feature_name: 'rrc',
      trigger_type: triggerType,
      triggered_by: triggerType === 'manual' || triggerType === 'debug' ? 'user' : 'system',
      status: 'running',
      progress_percentage: 0.00,
      current_processing: 'Initializing...'
    };

    const logEntry = await SchedulerLogService.createLog(logData);
    if (logEntry) {
      finalLogId = logEntry.id!;
      console.log('📊 Database log created:', finalLogId);
    }
  }
  
  currentLogId = finalLogId || null;

  try {
    // Get all available data
    const [sectors, indexes] = await Promise.all([
      listAvailableSectors(AZURE_CONFIG.stockDir),
      listAvailableIndexes(AZURE_CONFIG.indexDir)
    ]);

    // Calculate total items to process
    const totalSectors = sectors.length;
    const totalIndexes = indexes.length;
    const totalStocks = await getTotalStockCount(sectors);
    const totalItems = totalSectors + totalIndexes + totalStocks;

    generationProgress.total = totalItems;
    console.log(`📊 Total items to process: ${totalItems} (${totalSectors} sectors, ${totalIndexes} indexes, ${totalStocks} stocks)`);
    console.log(`📁 Available sectors: ${sectors.join(', ')}`);
    console.log(`📁 Available indexes: ${indexes.join(', ')}`);

    // Check if processing is already complete (unless force override)
    if (!forceOverride) {
      const completeness = await SchedulerLogService.isProcessingComplete('rrc', {
        stocks: totalStocks,
        sectors: totalSectors,
        indexes: totalIndexes
      });

      if (completeness.isComplete) {
        console.log('✅ RRC processing already complete, skipping...');
        if (currentLogId) {
          await SchedulerLogService.markCompleted(currentLogId, {
            total_files_processed: totalItems,
            files_created: 0,
            files_skipped: totalItems,
            files_failed: 0
          });
        }
        return;
      } else {
        console.log('📊 Missing files detected:', completeness.missingCounts);
      }
    }

    // Initialize counters for database tracking
    let sectorProcessed = 0, sectorSuccess = 0, sectorFailed = 0;
    let indexProcessed = 0, indexSuccess = 0, indexFailed = 0;
    let stockProcessed = 0, stockSuccess = 0, stockFailed = 0;
    let filesCreated = 0, filesUpdated = 0, filesSkipped = 0, filesFailed = 0;

    // Process sectors in BATCHES (parallel) for better performance
    const BATCH_SIZE = BATCH_SIZE_PHASE_1_2; // Phase 1-2: 250 sectors at a time
    console.log(`📦 Processing sectors in batches of ${BATCH_SIZE}...`);
    
    for (let i = 0; i < sectors.length; i += BATCH_SIZE) {
      const batch = sectors.slice(i, i + BATCH_SIZE);
      console.log(`📦 Processing sector batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(sectors.length / BATCH_SIZE)}: ${batch.join(', ')}`);
      
      // Process batch in parallel
      const batchResults = await Promise.allSettled(batch.map(async (sector) => {
        try {
          sectorProcessed++;
          generationProgress.current = `Checking sector: ${sector}`;
          
          // Check if sector file already exists (unless force override)
          const sectorNameClean = sector.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
          const sectorFilePath = `${AZURE_CONFIG.outputDir}/sector/o2-rrc-${sectorNameClean}.csv`;
          const sectorExists = await exists(sectorFilePath);
          
          if (sectorExists && !forceOverride) {
            console.log(`⏭️ Sector file already exists, skipping: ${sector}`);
            filesSkipped++;
            sectorSuccess++;
            generationProgress.completed++;
            return { status: 'skipped', sector };
          } else if (sectorExists && forceOverride) {
            console.log(`🔄 Sector file exists, force regenerating: ${sector}`);
          }
          
          generationProgress.current = `Processing sector: ${sector}`;
          console.log(`🔄 ${generationProgress.current}`);
          
          const csvContent = await calculateRrcSector(sector, AZURE_CONFIG);
          
          if (csvContent && csvContent.length > 0) {
            sectorSuccess++;
            filesCreated++;
            generationProgress.completed++;
            console.log(`✅ Sector completed: ${sector} (${generationProgress.completed}/${totalItems})`);
            return { status: 'success', sector };
          } else {
            throw new Error('No CSV content generated');
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          
          // Skip sectors/stocks that don't have CSV files (they may have been delisted or moved)
          if (errorMessage.includes('tidak ditemukan') || errorMessage.includes('not found') || errorMessage.includes('CSV')) {
            console.log(`⏭️ Skipping sector ${sector}: CSV file not found (may be delisted)`);
            filesSkipped++;
            generationProgress.completed++;
            return { status: 'skipped', sector };
          }
          
          console.error(`❌ Error processing sector ${sector}:`, error);
          sectorFailed++;
          filesFailed++;
          generationProgress.errors++;
          generationProgress.completed++;
          return { status: 'failed', sector, error };
        }
      }));
      
      // Log batch results
      const succeeded = batchResults.filter(r => r.status === 'fulfilled' && r.value.status === 'success').length;
      const failed = batchResults.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.status === 'failed')).length;
      const skipped = batchResults.filter(r => r.status === 'fulfilled' && r.value.status === 'skipped').length;
      console.log(`📦 Batch ${Math.floor(i / BATCH_SIZE) + 1} complete: ✅ ${succeeded} success, ❌ ${failed} failed, ⏭️ ${skipped} skipped`);
      
      // Update progress in database after batch
      if (currentLogId) {
        await SchedulerLogService.updateLog(currentLogId, {
          current_processing: `Completed batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(sectors.length / BATCH_SIZE)} - ${generationProgress.completed}/${totalItems} total`,
          progress_percentage: Math.round((generationProgress.completed / totalItems) * 100)
        });
      }
      
      // Small delay to give event loop breathing room (keep server responsive)
      if (i + BATCH_SIZE < sectors.length) {
        await new Promise(resolve => setTimeout(resolve, 25));
      }
    }

    // Process indexes in BATCHES (parallel)
    console.log(`📦 Processing indexes in batches of ${BATCH_SIZE}...`);
    
    for (let i = 0; i < indexes.length; i += BATCH_SIZE) {
      const batch = indexes.slice(i, i + BATCH_SIZE);
      console.log(`📦 Processing index batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(indexes.length / BATCH_SIZE)}: ${batch.join(', ')}`);
      
      // Process batch in parallel
      await Promise.all(batch.map(async (index) => {
        try {
          indexProcessed++;
          generationProgress.current = `Checking index: ${index}`;
          
          // Check if index file already exists (unless force override)
          const indexNameClean = index.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
          const indexFilePath = `${AZURE_CONFIG.outputDir}/index/o1-rrc-${indexNameClean}.csv`;
          const indexExists = await exists(indexFilePath);
          
          if (indexExists && !forceOverride) {
            console.log(`⏭️ Index file already exists, skipping: ${index}`);
            filesSkipped++;
            indexSuccess++;
            generationProgress.completed++;
            return;
          } else if (indexExists && forceOverride) {
            console.log(`🔄 Index file exists, force regenerating: ${index}`);
          }
          
          generationProgress.current = `Processing index: ${index}`;
          console.log(`🔄 ${generationProgress.current}`);
          
          await calculateRrcIndex(index, AZURE_CONFIG);
          indexSuccess++;
          filesCreated++;
          generationProgress.completed++;
          
          console.log(`✅ Index completed: ${index} (${generationProgress.completed}/${totalItems})`);
        } catch (error) {
          console.error(`❌ Error processing index ${index}:`, error);
          indexFailed++;
          filesFailed++;
          generationProgress.errors++;
          generationProgress.completed++;
        }
      }));
      
      // Update progress in database after batch
      if (currentLogId) {
        await SchedulerLogService.updateLog(currentLogId, {
          current_processing: `Completed index batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(indexes.length / BATCH_SIZE)} - ${generationProgress.completed}/${totalItems} total`,
          progress_percentage: Math.round((generationProgress.completed / totalItems) * 100)
        });
      }
      
      // Small delay to give event loop breathing room
      if (i + BATCH_SIZE < indexes.length) {
        await new Promise(resolve => setTimeout(resolve, 25));
      }
    }

    // Process ALL individual stocks from each sector in BATCHES (parallel)
    const STOCK_BATCH_SIZE = BATCH_SIZE_PHASE_1_2; // Phase 1-2: 250 stocks at a time
    console.log(`📦 Processing stocks in batches of ${STOCK_BATCH_SIZE}...`);
    
    for (const sector of sectors) {
      try {
        const stocks = await getStocksFromSector(sector);
        console.log(`📈 Processing ${stocks.length} stocks from sector: ${sector}`);
        console.log(`📈 Stocks in ${sector}: ${stocks.slice(0, 10).join(', ')}${stocks.length > 10 ? `... (+${stocks.length - 10} more)` : ''}`);
        
        // Process stocks in batches
        for (let i = 0; i < stocks.length; i += STOCK_BATCH_SIZE) {
          const batch = stocks.slice(i, i + STOCK_BATCH_SIZE);
          console.log(`📦 Processing stock batch ${Math.floor(i / STOCK_BATCH_SIZE) + 1}/${Math.ceil(stocks.length / STOCK_BATCH_SIZE)} from ${sector}: ${batch.join(', ')}`);
          
          // Process batch in parallel
          await Promise.all(batch.map(async (stock) => {
            try {
              stockProcessed++;
              generationProgress.current = `Checking stock: ${stock}`;
              
              // Check if stock file already exists (unless force override)
              const stockNameClean = stock.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
              const stockFilePath = `${AZURE_CONFIG.outputDir}/stock/o1-rrc-${stockNameClean}.csv`;
              const stockExists = await exists(stockFilePath);
              
              if (stockExists && !forceOverride) {
                console.log(`⏭️ Stock file already exists, skipping: ${stock}`);
                filesSkipped++;
                stockSuccess++;
                generationProgress.completed++;
                return;
              } else if (stockExists && forceOverride) {
                console.log(`🔄 Stock file exists, force regenerating: ${stock}`);
              }
              
              generationProgress.current = `Processing stock: ${stock}`;
              console.log(`🔄 ${generationProgress.current}`);
              
              await calculateRrcStock(stock, AZURE_CONFIG);
              stockSuccess++;
              filesCreated++;
              generationProgress.completed++;
              
              console.log(`✅ Stock completed: ${stock} (${generationProgress.completed}/${totalItems})`);
            } catch (error) {
              console.error(`❌ Error processing stock ${stock}:`, error);
              stockFailed++;
              filesFailed++;
              generationProgress.errors++;
              generationProgress.completed++;
            }
          }));
          
          // Update progress in database after each stock batch
          if (currentLogId) {
            await SchedulerLogService.updateLog(currentLogId, {
              current_processing: `Completed stock batch ${Math.floor(i / STOCK_BATCH_SIZE) + 1}/${Math.ceil(stocks.length / STOCK_BATCH_SIZE)} from ${sector} - ${generationProgress.completed}/${totalItems} total`,
              progress_percentage: Math.round((generationProgress.completed / totalItems) * 100)
            });
          }
          
          // Small delay to give event loop breathing room (CRITICAL for server responsiveness)
          if (i + STOCK_BATCH_SIZE < stocks.length) {
            await new Promise(resolve => setTimeout(resolve, 10)); // 10ms delay for stocks (reduced for speed)
          }
        }
        
        // Delay between sectors untuk kasih breathing room lebih
        await new Promise(resolve => setTimeout(resolve, 50));
        
      } catch (error) {
        console.error(`❌ Error getting stocks from sector ${sector}:`, error);
      }
    }


    const endTime = new Date();
    const duration = Math.round((endTime.getTime() - startTime.getTime()) / 1000);
    
    console.log(`✅ RRC scheduler completed - Success: ${generationProgress.completed}, Failed: ${generationProgress.errors}, Total: ${totalItems}, Duration: ${duration}s`);
    
    lastGenerationTime = endTime;

    // Mark as completed in database
    if (currentLogId) {
      // Store stock/sector/index stats in error_details for reference
      await SchedulerLogService.updateLog(currentLogId, {
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
      
      await SchedulerLogService.markCompleted(currentLogId, {
        total_files_processed: generationProgress.completed,
        files_created: filesCreated,
        files_updated: filesUpdated,
        files_skipped: filesSkipped,
        files_failed: generationProgress.errors
      });
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ RRC scheduler error: ${errorMessage}`);
    
    // Mark as failed in database
    if (currentLogId) {
      await SchedulerLogService.markFailed(currentLogId, errorMessage, error);
    }
  } finally {
    isGenerating = false;
    generationProgress.current = '';
    currentLogId = null;
  }
}

/**
 * Get total stock count across all sectors
 */
async function getTotalStockCount(sectors: string[]): Promise<number> {
  let total = 0;
  for (const sector of sectors) {
    try {
      const stocks = await getStocksFromSector(sector);
      total += stocks.length; // Count ALL stocks in each sector
    } catch (error) {
      console.error(`Error counting stocks in sector ${sector}:`, error);
    }
  }
  return total;
}

/**
 * Get stocks from a specific sector
 */
async function getStocksFromSector(sector: string): Promise<string[]> {
  const { listPaths } = await import('../utils/azureBlob');
  const sectorPrefix = `${AZURE_CONFIG.stockDir}/${sector}/`;
  
  try {
    const files = await listPaths({ prefix: sectorPrefix });
    return files
      .filter(f => f.toLowerCase().endsWith('.csv'))
      .map(f => f.split('/').pop()?.replace('.csv', '') || '')
      .filter(name => name !== '');
  } catch (error) {
    console.error(`Error getting stocks from sector ${sector}:`, error);
    return [];
  }
}

/**
 * Check if generation is needed (for scheduled updates)
 */
export function shouldRegenerate(): boolean {
  if (!lastGenerationTime) return true;
  
  const now = new Date();
  const hoursSinceLastGeneration = (now.getTime() - lastGenerationTime.getTime()) / (1000 * 60 * 60);
  
  // Regenerate if more than 24 hours have passed
  return hoursSinceLastGeneration > 24;
}

/**
 * Force regeneration (for scheduled updates) - Override all files
 */
export async function forceRegenerate(): Promise<void> {
  console.log('🔄 Force regenerating RRC data...');
  lastGenerationTime = null;
  await preGenerateAllRRC(true, 'scheduled'); // Pass true to force override, trigger type 'scheduled'
}
