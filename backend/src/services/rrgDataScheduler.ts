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
import { AzureLogger } from './azureLoggingService';
import { BATCH_SIZE_PHASE_1_2 } from './dataUpdateService';

let isGenerating = false;
let lastGenerationTime: Date | null = null;
let generationProgress = {
  total: 0,
  completed: 0,
  current: '',
  errors: 0
};

// Helper functions removed as they're not used in current implementation

// Main RRG auto-generation function
export async function preGenerateAllRRG(forceOverride: boolean = false, triggerType: 'startup' | 'scheduled' | 'manual' | 'debug' = 'startup'): Promise<void> {
  const SCHEDULER_TYPE = 'rrg';
  
  if (isGenerating) {
    await AzureLogger.logWarning(SCHEDULER_TYPE, 'Generation already in progress, skipping');
    return;
  }

  isGenerating = true;
  lastGenerationTime = new Date();
  
  // Create log entry
  const logEntry = await SchedulerLogService.createLog({
    feature_name: 'rrg',
    trigger_type: triggerType,
    triggered_by: triggerType === 'manual' ? 'user' : 'system',
    status: 'running',
    force_override: forceOverride,
    environment: process.env['NODE_ENV'] || 'development'
  });

  if (!logEntry) {
    console.error('❌ Failed to create scheduler log entry');
    isGenerating = false;
    return;
  }

  const logId = logEntry.id!;
  
  try {
    await AzureLogger.logSchedulerStart(SCHEDULER_TYPE, `RRG auto-generation (${triggerType}) - ${forceOverride ? 'FORCE OVERRIDE' : 'SKIP EXISTING FILES'}`);
    
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
        await SchedulerLogService.updateLog(logId, {
          status: 'completed',
          progress_percentage: 100.00,
          current_processing: 'All files already processed',
          total_files_processed: completenessCheck.missingCounts.stocks + completenessCheck.missingCounts.sectors + completenessCheck.missingCounts.indexes,
          files_skipped: completenessCheck.missingCounts.stocks + completenessCheck.missingCounts.sectors + completenessCheck.missingCounts.indexes
        });
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
    const STOCK_BATCH_SIZE = BATCH_SIZE_PHASE_1_2; // Phase 1-2: 250 stocks at a time
    console.log(`📦 Processing ${stocks.length} stocks in batches of ${STOCK_BATCH_SIZE}...`);
    
    for (let i = 0; i < stocks.length; i += STOCK_BATCH_SIZE) {
      const batch = stocks.slice(i, i + STOCK_BATCH_SIZE);
      console.log(`📦 Processing stock batch ${Math.floor(i / STOCK_BATCH_SIZE) + 1}/${Math.ceil(stocks.length / STOCK_BATCH_SIZE)}: ${batch.join(', ')}`);
      
      // Process batch in parallel
      await Promise.all(batch.map(async (stock) => {
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
      }));
      
      // Update progress after batch
      generationProgress.completed = stockProcessed;
      generationProgress.errors = stockFailed;
      
      await SchedulerLogService.updateLog(logId, {
        progress_percentage: Math.round((generationProgress.completed / generationProgress.total) * 100),
        current_processing: `Completed stock batch ${Math.floor(i / STOCK_BATCH_SIZE) + 1}/${Math.ceil(stocks.length / STOCK_BATCH_SIZE)} - ${stockProcessed}/${stocks.length} stocks`
      });
      
      // Small delay for event loop breathing room
      if (i + STOCK_BATCH_SIZE < stocks.length) {
        await new Promise(resolve => setTimeout(resolve, 10));
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
      
      await SchedulerLogService.updateLog(logId, {
        progress_percentage: Math.round((generationProgress.completed / generationProgress.total) * 100),
        current_processing: generationProgress.current
      });

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
      
      await SchedulerLogService.updateLog(logId, {
        progress_percentage: Math.round((generationProgress.completed / generationProgress.total) * 100),
        current_processing: generationProgress.current
      });

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
    
    await SchedulerLogService.updateLog(logId, {
      progress_percentage: Math.round((generationProgress.completed / generationProgress.total) * 100),
      current_processing: generationProgress.current
    });

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
    
    await SchedulerLogService.updateLog(logId, {
      progress_percentage: Math.round((generationProgress.completed / generationProgress.total) * 100),
      current_processing: generationProgress.current
    });

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
    
    await SchedulerLogService.markCompleted(logId, {
      total_files_processed: stockProcessed + sectorProcessed + indexProcessed + 2,
      files_created: filesCreated,
      files_updated: filesUpdated,
      files_skipped: filesSkipped,
      files_failed: filesFailed,
      stock_processed: stockProcessed,
      stock_success: stockSuccess,
      stock_failed: stockFailed,
      sector_processed: sectorProcessed,
      sector_success: sectorSuccess,
      sector_failed: sectorFailed,
      index_processed: indexProcessed,
      index_success: indexSuccess,
      index_failed: indexFailed
    });

    await AzureLogger.logSchedulerEnd(SCHEDULER_TYPE, {
      success: filesCreated,
      skipped: filesSkipped,
      failed: filesFailed,
      total: stockProcessed + sectorProcessed + indexProcessed
    });
    
    await AzureLogger.logInfo(SCHEDULER_TYPE, `Processed: ${stockProcessed} stocks, ${sectorProcessed} sectors, ${indexProcessed} indexes`);

  } catch (error) {
    await AzureLogger.logSchedulerError(SCHEDULER_TYPE, error instanceof Error ? error.message : 'Unknown error');
    
    await SchedulerLogService.markFailed(logId, 'RRG auto-generation failed', error);
    
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
