// seasonalityAutoGenerate.ts
// Service for auto-generating seasonality data (index, sector, stock)

import { 
  generateAllIndexesSeasonality
} from '../calculations/seasonal/seasonality_index_azure';
import { 
  generateAllSectorsSeasonality
} from '../calculations/seasonal/seasonality_sector_azure';
import { 
  generateAllStocksSeasonality
} from '../calculations/seasonal/seasonality_stock_azure';
import { SchedulerLogService, SchedulerLog } from './schedulerLogService';
import { AzureLogger } from './azureLoggingService';
import { uploadText } from '../utils/azureBlob';

// Global state for tracking generation status
let isGenerating = false;
let lastGenerationTime: Date | null = null;
let generationProgress = {
  total: 0,
  completed: 0,
  current: '',
  errors: 0
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
 * Pre-generate all possible Seasonality outputs with optional force override
 */
export async function preGenerateAllSeasonality(forceOverride: boolean = false, triggerType: 'startup' | 'scheduled' | 'manual' | 'debug' = 'startup'): Promise<void> {
  const SCHEDULER_TYPE = 'seasonal';
  
  if (isGenerating) {
    await AzureLogger.logWarning(SCHEDULER_TYPE, 'Generation already in progress, skipping');
    return;
  }

  isGenerating = true;
  generationProgress = {
    total: 0,
    completed: 0,
    current: '',
    errors: 0
  };

  await AzureLogger.logSchedulerStart(SCHEDULER_TYPE, `Seasonality auto-generation ${forceOverride ? '(FORCE OVERRIDE MODE)' : '(SKIP EXISTING FILES)'}`);
  const startTime = new Date();

  // Create database log entry
  const logData: Partial<SchedulerLog> = {
    feature_name: 'seasonal',
    trigger_type: triggerType,
    triggered_by: triggerType === 'manual' ? 'user' : 'system',
    status: 'running',
    force_override: forceOverride,
    environment: process.env['NODE_ENV'] || 'development'
  };

  const logEntry = await SchedulerLogService.createLog(logData);
  if (!logEntry) {
    await AzureLogger.logSchedulerError(SCHEDULER_TYPE, 'Failed to create database log entry');
    isGenerating = false;
    return;
  }

  const currentLogId = logEntry.id!;
  let filesCreated = 0;
  let filesSkipped = 0;
  let filesFailed = 0;

  try {
    // Process Indexes
    await AzureLogger.logInfo(SCHEDULER_TYPE, 'Starting index seasonality analysis...');
    generationProgress.current = 'Processing indexes';
    
    try {
      const indexResults = await generateAllIndexesSeasonality();
      const indexCsv = await convertResultsToCSV(indexResults, 'index');
      
      if (indexCsv && indexCsv.length > 0) {
        await uploadText('seasonal_output/o1-seasonal-indexes.csv', indexCsv);
        await AzureLogger.logItemProcess(SCHEDULER_TYPE, 'SUCCESS', 'indexes', `Generated ${indexResults.indexes.length} indexes`);
        filesCreated++;
      } else {
        await AzureLogger.logItemProcess(SCHEDULER_TYPE, 'SKIP', 'indexes', 'No data generated');
        filesSkipped++;
      }
    } catch (error) {
      await AzureLogger.logItemProcess(SCHEDULER_TYPE, 'ERROR', 'indexes', error instanceof Error ? error.message : 'Unknown error');
      filesFailed++;
    }

    // Process Sectors
    await AzureLogger.logInfo(SCHEDULER_TYPE, 'Starting sector seasonality analysis...');
    generationProgress.current = 'Processing sectors';
    
    try {
      const sectorResults = await generateAllSectorsSeasonality();
      const sectorCsv = await convertResultsToCSV(sectorResults, 'sector');
      
      if (sectorCsv && sectorCsv.length > 0) {
        await uploadText('seasonal_output/o3-seasonal-sectors.csv', sectorCsv);
        await AzureLogger.logItemProcess(SCHEDULER_TYPE, 'SUCCESS', 'sectors', `Generated ${sectorResults.sectors.length} sectors`);
        filesCreated++;
      } else {
        await AzureLogger.logItemProcess(SCHEDULER_TYPE, 'SKIP', 'sectors', 'No data generated');
        filesSkipped++;
      }
    } catch (error) {
      await AzureLogger.logItemProcess(SCHEDULER_TYPE, 'ERROR', 'sectors', error instanceof Error ? error.message : 'Unknown error');
      filesFailed++;
    }

    // Process Stocks
    await AzureLogger.logInfo(SCHEDULER_TYPE, 'Starting stock seasonality analysis...');
    generationProgress.current = 'Processing stocks';
    
    try {
      const stockResults = await generateAllStocksSeasonality();
      const stockCsv = await convertResultsToCSV(stockResults, 'stock');
      
      if (stockCsv && stockCsv.length > 0) {
        await uploadText('seasonal_output/o2-seasonal-stocks.csv', stockCsv);
        await AzureLogger.logItemProcess(SCHEDULER_TYPE, 'SUCCESS', 'stocks', `Generated ${stockResults.stocks.length} stocks`);
        filesCreated++;
      } else {
        await AzureLogger.logItemProcess(SCHEDULER_TYPE, 'SKIP', 'stocks', 'No data generated');
        filesSkipped++;
      }
    } catch (error) {
      await AzureLogger.logItemProcess(SCHEDULER_TYPE, 'ERROR', 'stocks', error instanceof Error ? error.message : 'Unknown error');
      filesFailed++;
    }

    const endTime = new Date();
    const duration = Math.round((endTime.getTime() - startTime.getTime()) / 1000);
    
    await AzureLogger.logSchedulerEnd(SCHEDULER_TYPE, {
      success: filesCreated,
      skipped: filesSkipped,
      failed: filesFailed,
      total: 3 // index, sector, stock
    });
    
    await AzureLogger.logInfo(SCHEDULER_TYPE, `Duration: ${duration}s`);
    
    lastGenerationTime = endTime;

    // Mark as completed in database
    if (currentLogId) {
      await SchedulerLogService.markCompleted(currentLogId, {
        total_files_processed: filesCreated,
        files_created: filesCreated,
        files_updated: 0,
        files_skipped: filesSkipped,
        files_failed: filesFailed,
        stock_processed: 0,
        stock_success: 0,
        stock_failed: 0,
        sector_processed: 0,
        sector_success: 0,
        sector_failed: 0,
        index_processed: 0,
        index_success: 0,
        index_failed: 0
      });
    }

  } catch (error) {
    await AzureLogger.logSchedulerError(SCHEDULER_TYPE, error instanceof Error ? error.message : 'Unknown error');
    
    // Mark as failed in database
    if (currentLogId) {
      await SchedulerLogService.markFailed(currentLogId, error instanceof Error ? error.message : 'Unknown error', error);
    }
  } finally {
    isGenerating = false;
    generationProgress.current = '';
    generationProgress.completed = 0;
  }
}

/**
 * Convert seasonality results to CSV format
 */
async function convertResultsToCSV(results: any, type: 'index' | 'sector' | 'stock'): Promise<string> {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  let csvContent = '';
  
  if (type === 'index') {
    csvContent = 'Ticker,Name,';
    csvContent += months.join(',') + ',';
    csvContent += 'BestMonth,BestReturn,WorstMonth,WorstReturn,Volatility\n';
    
    results.indexes.forEach((index: any) => {
      csvContent += `${index.ticker},"${index.name}",`;
      
      // Add monthly returns
      months.forEach(month => {
        const returnValue = index.monthly_returns[month] || 0;
        csvContent += `${returnValue},`;
      });
      
      // Add best/worst months and volatility
      csvContent += `${index.best_month?.month || ''},`;
      csvContent += `${index.best_month?.return || 0},`;
      csvContent += `${index.worst_month?.month || ''},`;
      csvContent += `${index.worst_month?.return || 0},`;
      csvContent += `${index.volatility}\n`;
    });
    
  } else if (type === 'sector') {
    csvContent = 'Sector,StockCount,';
    csvContent += months.join(',') + ',';
    csvContent += 'BestMonth,BestReturn,WorstMonth,WorstReturn,Volatility\n';
    
    results.sectors.forEach((sector: any) => {
      csvContent += `${sector.sector},${sector.stock_count},`;
      
      // Add monthly returns
      months.forEach(month => {
        const returnValue = sector.monthly_returns[month] || 0;
        csvContent += `${returnValue},`;
      });
      
      // Add best/worst months and volatility
      csvContent += `${sector.best_month?.month || ''},`;
      csvContent += `${sector.best_month?.return || 0},`;
      csvContent += `${sector.worst_month?.month || ''},`;
      csvContent += `${sector.worst_month?.return || 0},`;
      csvContent += `${sector.volatility}\n`;
    });
    
  } else if (type === 'stock') {
    csvContent = 'Ticker,Sector,';
    csvContent += months.join(',') + ',';
    csvContent += 'BestMonth,BestReturn,WorstMonth,WorstReturn,Volatility\n';
    
    results.stocks.forEach((stock: any) => {
      csvContent += `${stock.ticker},${stock.sector},`;
      
      // Add monthly returns
      months.forEach(month => {
        const returnValue = stock.monthly_returns[month] || 0;
        csvContent += `${returnValue},`;
      });
      
      // Add best/worst months and volatility
      csvContent += `${stock.best_month?.month || ''},`;
      csvContent += `${stock.best_month?.return || 0},`;
      csvContent += `${stock.worst_month?.month || ''},`;
      csvContent += `${stock.worst_month?.return || 0},`;
      csvContent += `${stock.volatility}\n`;
    });
  }
  
  return csvContent;
}

/**
 * Force regeneration (for scheduled updates) - Override all files
 */
export async function forceRegenerate(triggerType: 'manual' | 'scheduled' = 'manual'): Promise<void> {
  await preGenerateAllSeasonality(true, triggerType);
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
