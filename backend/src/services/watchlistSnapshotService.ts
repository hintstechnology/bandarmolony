import WatchlistCalculator, { WatchlistStock } from '../calculations/watchlist/watchlist';
import { uploadText } from '../utils/azureBlob';

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

export async function updateWatchlistSnapshot(): Promise<void> {
  console.log('📊 Watchlist Snapshot: starting generation');

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
    return;
  }

  console.log(`📊 Watchlist Snapshot: generating data for ${tickers.length} tickers`);
  const emitenDetails = await calculator.loadEmitenDetailsFromAzure();
  const data = await calculator.getWatchlistData(tickers, { stockLookup, emitenDetails });
  const csvContent = buildCsvContent(data);

  await uploadText(SNAPSHOT_BLOB_PATH, csvContent, 'text/csv');
  console.log(`✅ Watchlist Snapshot: uploaded ${data.length} records to ${SNAPSHOT_BLOB_PATH}`);
}
