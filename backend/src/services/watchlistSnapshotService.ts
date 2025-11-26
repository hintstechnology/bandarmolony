import WatchlistCalculator, { WatchlistStock } from '../calculations/watchlist/watchlist';
import { uploadText } from '../utils/azureBlob';
import { SchedulerLogService } from './schedulerLogService';

const SNAPSHOT_BLOB_PATH = 'watchlist/watchlist.csv';

function toCsvRow(values: (string | number | null | undefined)[]): string {
  return values
    .map((value) => {
      if (value === null || value === undefined) {
        return '';
      }
      const stringValue = String(value);
      if (/[",\n]/.test(stringValue)) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    })
    .join(',');
}

function buildCsvContent(stocks: WatchlistStock[]): string {
  const header = ['symbol', 'name', 'last_price', 'change', 'change_percent', 'last_update'];
  const rows = stocks.map((stock) =>
    toCsvRow([
      stock.symbol,
      stock.name,
      Number.isFinite(stock.price) ? stock.price : '',
      Number.isFinite(stock.change) ? stock.change : '',
      Number.isFinite(stock.changePercent) ? stock.changePercent : '',
      stock.lastUpdate || '',
    ]),
  );
  return [header.join(','), ...rows].join('\n');
}

export async function updateWatchlistSnapshot(logId?: string | null, triggeredBy?: string): Promise<void> {
  // Only create log entry if logId is not provided (called from scheduler, not manual trigger)
  let finalLogId = logId;
  if (!finalLogId) {
    const logEntry = await SchedulerLogService.createLog({
      feature_name: 'watchlist_snapshot',
      trigger_type: triggeredBy ? 'manual' : 'scheduled',
      triggered_by: triggeredBy || 'system',
      status: 'running',
      environment: process.env['NODE_ENV'] || 'development'
    });

    if (!logEntry) {
      console.error('❌ Failed to create scheduler log entry');
      return;
    }

    finalLogId = logEntry.id!;
  }

  console.log('📊 Watchlist Snapshot: starting generation');

  try {
    if (finalLogId) {
      await SchedulerLogService.updateLog(finalLogId, {
        progress_percentage: 0,
        current_processing: 'Starting watchlist snapshot generation...'
      });
    }

    const calculator = new WatchlistCalculator();
    const stockMetadata = await calculator.getAllStocksFromAzure();
    const stockLookup = new Map<string, { sector: string; ticker: string }>();
    stockMetadata.forEach((entry) => {
      if (entry.ticker) {
        stockLookup.set(entry.ticker.toUpperCase(), { sector: entry.sector, ticker: entry.ticker });
      }
    });
    const tickers = Array.from(stockLookup.keys());

    if (!tickers.length) {
      console.warn('⚠️ Watchlist Snapshot: no tickers found, skipping upload');
      if (finalLogId) {
        await SchedulerLogService.markFailed(finalLogId, 'No tickers found');
      }
      return;
    }

    if (finalLogId) {
      await SchedulerLogService.updateLog(finalLogId, {
        progress_percentage: 50,
        current_processing: `Generating data for ${tickers.length} tickers...`
      });
    }

    console.log(`📊 Watchlist Snapshot: generating data for ${tickers.length} tickers`);
    const emitenDetails = await calculator.loadEmitenDetailsFromAzure();
    
    // Process in batches with progress tracking
    const BATCH_SIZE = 500;
    const allData: any[] = [];
    for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
      const batch = tickers.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      
      // Update progress
      if (finalLogId) {
        await SchedulerLogService.updateLog(finalLogId, {
          progress_percentage: 50 + Math.round((i / tickers.length) * 50), // Second 50% for processing
          current_processing: `Processing batch ${batchNumber}/${Math.ceil(tickers.length / BATCH_SIZE)} (${i + batch.length}/${tickers.length} tickers)`
        });
      }
      
      const batchData = await calculator.getWatchlistData(batch, { stockLookup, emitenDetails });
      allData.push(...batchData);
      
      console.log(`📊 Processed batch ${batchNumber}/${Math.ceil(tickers.length / BATCH_SIZE)} - ${batchData.length} valid tickers`);
    }
    
    const data = allData;
    const csvContent = buildCsvContent(data);

    await uploadText(SNAPSHOT_BLOB_PATH, csvContent, 'text/csv');
    console.log(`✅ Watchlist Snapshot: uploaded ${data.length} records to ${SNAPSHOT_BLOB_PATH}`);

    if (finalLogId) {
      await SchedulerLogService.markCompleted(finalLogId, {
        total_files_processed: 1,
        files_created: 1,
        files_failed: 0
      });
    }
  } catch (error) {
    console.error('❌ Error generating watchlist snapshot:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    if (finalLogId) {
      await SchedulerLogService.markFailed(finalLogId, errorMessage, error);
    }
    throw error;
  }
}
