
import WatchlistCalculator, { WatchlistStock } from '../calculations/watchlist/watchlist';
import { uploadText } from '../utils/azureBlob';
import { SchedulerLogService } from './schedulerLogService';
import { BATCH_SIZE_PHASE_2, OptimizedAzureStorageService, getEmitenListFromCsv, getSectorFallback } from './dataUpdateService';

const SNAPSHOT_BLOB_PATH = 'watchlist/watchlist.csv';

// Interface for sector mapping
interface SectorLookup {
  [key: string]: string[];
}

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
      trigger_type: triggeredBy && !triggeredBy.startsWith('Phase') && !triggeredBy.startsWith('phase') ? 'manual' : 'scheduled',
      triggered_by: triggeredBy || 'Phase 2 Market Rotation',
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
    const azureStorage = new OptimizedAzureStorageService();
    await azureStorage.ensureContainerExists();

    if (finalLogId) {
      await SchedulerLogService.updateLog(finalLogId, {
        progress_percentage: 0,
        current_processing: 'Loading stock lists and mappings...'
      });
    }

    const calculator = new WatchlistCalculator();

    // 1. Load Sector Mapping (Source of Truth for Sectors)
    const sectorMapping: SectorLookup = {};
    try {
      const mappingCsv = await azureStorage.downloadCsvData('csv_input/sector_mapping.csv');
      const lines = mappingCsv.split('\n').map(l => l.trim()).filter(l => l);
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        const parts = line.split(',');
        if (parts.length >= 2) {
          const part0 = parts[0];
          const part1 = parts[1];
          if (part0 && part1) {
            const sector = part0.trim();
            const emiten = part1.trim();
            if (sector && emiten) {
              if (!sectorMapping[sector]) sectorMapping[sector] = [];
              sectorMapping[sector]?.push(emiten);
            }
          }
        }
      }
    } catch (e) {
      console.warn('⚠️ Could not load sector_mapping.csv, using default sectors');
      // Initialize default sectors for hash fallback
      ['Basic Materials', 'Consumer Cyclicals', 'Financials', 'Infrastructure', 'Technology'].forEach(s => sectorMapping[s] = []);
    }
    const availableSectors = Object.keys(sectorMapping);

    // 2. Load Emiten List (Source of Truth for Tickers) using shared helper
    let emitenList: string[] = await getEmitenListFromCsv(azureStorage);
    if (!emitenList || emitenList.length === 0) {
      // Fallback to Azure folder scan if empty (though unexpected)
      console.warn('⚠️ emiten_list.csv empty or failed, falling back to Azure folder scan');
    }

    // 3. Scan Azure folders (Backup source / existing files check)
    const stockMetadata = await calculator.getAllStocksFromAzure();
    const stockLookup = new Map<string, { sector: string; ticker: string }>();

    // Populate lookup from existing files first
    stockMetadata.forEach((entry) => {
      if (entry.ticker) {
        stockLookup.set(entry.ticker.toUpperCase(), { sector: entry.sector, ticker: entry.ticker });
      }
    });

    // 4. Merge and Fallback Logic
    // For every stock in emitenList, ensure it's in stockLookup with a sector
    emitenList.forEach(ticker => {
      if (!stockLookup.has(ticker)) {
        // Determine sector
        let sector = '';
        // Try to find in sector mapping
        for (const s of availableSectors) {
          if (sectorMapping[s]?.includes(ticker)) {
            sector = s;
            break;
          }
        }
        // Fallback if not found
        if (!sector) {
          sector = getSectorFallback(ticker, availableSectors);
        }

        stockLookup.set(ticker, { sector: sector, ticker: ticker });
      }
    });

    // Final list of tickers to process
    const tickers = Array.from(stockLookup.keys()).sort();

    if (!tickers.length) {
      console.warn('⚠️ Watchlist Snapshot: no tickers found, skipping upload');
      if (finalLogId) {
        await SchedulerLogService.markFailed(finalLogId, 'No tickers found');
      }
      return;
    }

    if (finalLogId) {
      await SchedulerLogService.updateLog(finalLogId, {
        progress_percentage: 10,
        current_processing: `Generating data for ${tickers.length} tickers...`
      });
    }

    console.log(`📊 Watchlist Snapshot: generating data for ${tickers.length} tickers (Merged List)`);
    const emitenDetails = await calculator.loadEmitenDetailsFromAzure();

    // Process in batches with progress tracking
    const BATCH_SIZE = BATCH_SIZE_PHASE_2; // Phase 2: 500
    const allData: any[] = [];
    for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
      const batch = tickers.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;

      // Update progress
      if (finalLogId) {
        await SchedulerLogService.updateLog(finalLogId, {
          progress_percentage: 10 + Math.round((i / tickers.length) * 80),
          current_processing: `Processing batch ${batchNumber}/${Math.ceil(tickers.length / BATCH_SIZE)} (${i + batch.length}/${tickers.length} tickers)`
        });
      }

      // Pass the updated stockLookup
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
