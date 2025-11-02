import express from 'express';
import { downloadText } from '../utils/azureBlob';

const router = express.Router();
const SNAPSHOT_BLOB_PATH = 'watchlist/watchlist.csv';

interface WatchlistSnapshotRow {
  symbol: string;
  name: string;
  last_price: number;
  change: number;
  change_percent: number;
  last_update?: string;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        const nextChar = line[i + 1];
        if (nextChar === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
  }

  result.push(current);
  return result;
}

function parseSnapshotCsv(content: string): WatchlistSnapshotRow[] {
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
  if (!lines.length) {
    return [];
  }

  const headerLine = lines[0];
  if (typeof headerLine !== 'string' || !headerLine.trim()) {
    return [];
  }

  const header = parseCsvLine(headerLine).map((value) => (value ?? '').trim().toLowerCase());
  const symbolIdx = header.indexOf('symbol');
  if (symbolIdx < 0) {
    throw new Error('snapshot is missing symbol column');
  }

  const nameIdx = header.indexOf('name');
  const priceIdx = header.indexOf('last_price');
  const changeIdx = header.indexOf('change');
  const changePercentIdx = header.indexOf('change_percent');
  const lastUpdateIdx = header.indexOf('last_update');

  const rows: WatchlistSnapshotRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    const columns = parseCsvLine(line);
    const symbolRaw = columns[symbolIdx]?.trim();
    if (!symbolRaw) continue;

    const toNumber = (value: string | undefined): number => {
      if (value === undefined || value.trim() === '') return NaN;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : NaN;
    };

    const lastPrice = toNumber(priceIdx >= 0 ? columns[priceIdx] : undefined);
    const change = toNumber(changeIdx >= 0 ? columns[changeIdx] : undefined);
    const changePercent = toNumber(changePercentIdx >= 0 ? columns[changePercentIdx] : undefined);

    const row: WatchlistSnapshotRow = {
      symbol: symbolRaw.toUpperCase(),
      name: nameIdx >= 0 ? (columns[nameIdx]?.trim() || symbolRaw.toUpperCase()) : symbolRaw.toUpperCase(),
      last_price: Number.isFinite(lastPrice) ? lastPrice : 0,
      change: Number.isFinite(change) ? change : 0,
      change_percent: Number.isFinite(changePercent) ? changePercent : 0,
    };

    if (lastUpdateIdx >= 0) {
      const lastUpdateValue = columns[lastUpdateIdx]?.trim();
      if (lastUpdateValue) {
        row.last_update = lastUpdateValue;
      }
    }

    rows.push(row);
  }

  return rows;
}

async function loadSnapshot(): Promise<WatchlistSnapshotRow[]> {
  try {
    const csvContent = await downloadText(SNAPSHOT_BLOB_PATH);
    return parseSnapshotCsv(csvContent);
  } catch (error) {
    console.error('❌ Failed to load watchlist snapshot:', error);
    throw error;
  }
}

function filterSnapshot(rows: WatchlistSnapshotRow[], symbols?: string[]): WatchlistSnapshotRow[] {
  if (!symbols || !symbols.length) {
    return rows;
  }
  const symbolSet = new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean));
  return rows.filter((row) => symbolSet.has(row.symbol));
}

router.get('/', async (req, res) => {
  try {
    const { symbols } = req.query;
    const snapshot = await loadSnapshot();

    let filtered: WatchlistSnapshotRow[];
    if (Array.isArray(symbols)) {
      const normalizedArray = (symbols as string[]).map((value) => value?.toString?.() ?? '').filter(Boolean);
      filtered = filterSnapshot(snapshot, normalizedArray);
    } else if (typeof symbols === 'string' && symbols.trim().length > 0) {
      filtered = filterSnapshot(snapshot, symbols.split(','));
    } else {
      filtered = snapshot;
    }

    return res.json({
      success: true,
      data: {
        stocks: filtered.map((row) => ({
          symbol: row.symbol,
          name: row.name,
          price: Number.isFinite(row.last_price) ? row.last_price : 0,
          change: Number.isFinite(row.change) ? row.change : 0,
          changePercent: Number.isFinite(row.change_percent) ? row.change_percent : 0,
          lastUpdate: row.last_update,
        })),
        total: filtered.length,
        source: 'snapshot',
      },
    });
  } catch (error) {
    console.error('❌ Error getting watchlist snapshot:', error);
    return res.status(500).json({
      success: false,
      error: `Failed to get watchlist snapshot: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
  }
});

router.post('/', async (req, res) => {
  try {
    const { symbols } = req.body;

    if (!symbols || !Array.isArray(symbols) || !symbols.length) {
      return res.status(400).json({
        success: false,
        error: 'symbols array is required in request body',
      });
    }

    const snapshot = await loadSnapshot();
    const normalizedSymbols = symbols.map((value: unknown) => (typeof value === 'string' ? value : String(value)));
    const filtered = filterSnapshot(snapshot, normalizedSymbols);

    return res.json({
      success: true,
      data: {
        stocks: filtered.map((row) => ({
          symbol: row.symbol,
          name: row.name,
          price: Number.isFinite(row.last_price) ? row.last_price : 0,
          change: Number.isFinite(row.change) ? row.change : 0,
          changePercent: Number.isFinite(row.change_percent) ? row.change_percent : 0,
          lastUpdate: row.last_update,
        })),
        total: filtered.length,
        requested: symbols.length,
        source: 'snapshot',
      },
    });
  } catch (error) {
    console.error('❌ Error getting watchlist snapshot:', error);
    return res.status(500).json({
      success: false,
      error: `Failed to get watchlist snapshot: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
  }
});

export default router;
