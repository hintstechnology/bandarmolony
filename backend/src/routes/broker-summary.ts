import { Router } from 'express';
import { z } from 'zod';
import { downloadText, listPaths } from '../utils/azureBlob';

const router = Router();

const querySchema = z.object({
  date: z.string().regex(/^\d{8}$/, 'Date must be in YYYYMMDD format'),
  market: z.string().optional(),
});

const paramsSchema = z.object({
  stockCode: z.string().min(1, 'Stock code is required')
});

// Resolve modern vs legacy path based on market
function normalizeMarket(m?: string): 'RG' | 'TN' | 'NG' | undefined {
  if (!m) return undefined;
  const up = String(m).toUpperCase();
  if (up === 'RK') return 'RG';
  if (up === 'RG' || up === 'TN' || up === 'NG') return up as 'RG' | 'TN' | 'NG';
  return undefined;
}

function resolvePaths(date: string, market?: string) {
  // If market is empty or undefined, use legacy path only (All Trade)
  if (!market || market === '') {
    return {
      modernPrefix: '', // No modern path for All Trade
      legacyPrefix: `broker_summary/broker_summary_${date}/`
    };
  }
  
  // For specific markets (RG/TN/NG), use modern paths
  const normalized = normalizeMarket(market);
  if (!normalized) {
    // If can't normalize, fallback to legacy
    return {
      modernPrefix: '',
      legacyPrefix: `broker_summary/broker_summary_${date}/`
    };
  }
  
  // Map market to folder name:
  // RG -> rg (folder is broker_summary_rg)
  // TN -> tn
  // NG -> ng
  const folderMap: { [key: string]: string } = {
    'RG': 'rg',
    'TN': 'tn',
    'NG': 'ng'
  };
  
  const folderType = folderMap[normalized] || normalized.toLowerCase();
  const modernPrefix = `broker_summary_${folderType}/broker_summary_${folderType}_${date}/`;
  const legacyPrefix = `broker_summary/broker_summary_${date}/`; // Keep legacy as fallback
  return { modernPrefix, legacyPrefix };
}

router.get('/stocks', async (req, res) => {
  try {
    const { date, market } = querySchema.parse(req.query);
    const { modernPrefix, legacyPrefix } = resolvePaths(date, market);

    let files: string[] = [];
    
    // If modernPrefix is empty (All Trade), only search in legacy path
    if (!modernPrefix) {
      files = await listPaths({ prefix: legacyPrefix });
    } else {
      // For specific markets (RG/TN/NG), only search in modern path - NO fallback to legacy
      // If not found, return empty instead of wrong data
      files = await listPaths({ prefix: modernPrefix });
    }

    const stocks = (files || [])
      .filter(path => path.endsWith('.csv') && !path.includes('ALLSUM'))
      .map(path => path.split('/').pop() || '')
      .map(name => name.replace('.csv', ''))
      .filter(code => code.length === 4 || code.toUpperCase() === 'IDX')
      .sort();

    return res.json({ success: true, data: { stocks, date, market: market || 'RG' } });
  } catch (error: any) {
    console.error('broker-summary/stocks error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to list stocks' });
  }
});

router.get('/summary/:stockCode', async (req, res) => {
  try {
    const { stockCode } = paramsSchema.parse(req.params);
    const { date, market } = querySchema.parse(req.query);

    console.log(`[BrokerSummary] Fetching data for ${stockCode} on ${date} with market: ${market || 'RG'}`);

    const { modernPrefix, legacyPrefix } = resolvePaths(date, market);
    
    let csvData: string | null = null;
    let usedPath = '';
    
    // If modernPrefix is empty (All Trade), only try legacy path
    if (!modernPrefix) {
      const legacyPath = `${legacyPrefix}${stockCode}.csv`;
      console.log(`[BrokerSummary] All Trade selected, trying legacy path: ${legacyPath}`);
      try {
        csvData = await downloadText(legacyPath);
        usedPath = legacyPath;
      } catch (error: any) {
        console.error(`[BrokerSummary] Legacy path not found: ${legacyPath}`, error.message);
        csvData = null;
      }
    } else {
      // For specific markets (RG/TN/NG), only try modern path - NO fallback to legacy
      // If not found, return empty (don't show wrong data from legacy path)
      const modernPath = `${modernPrefix}${stockCode}.csv`;

      console.log(`[BrokerSummary] Market: ${market}, trying modern path: ${modernPath}`);

      try {
        csvData = await downloadText(modernPath);
        usedPath = modernPath;
      } catch (error: any) {
        console.log(`[BrokerSummary] Modern path not found: ${modernPath}`, error.message);
        // Don't fallback to legacy - return empty instead of wrong data
        csvData = null;
      }
    }

    if (!csvData) {
      console.error(`[BrokerSummary] No data found for ${stockCode} on ${date} with market: ${market || 'All Trade'}`);
      return res.status(404).json({ success: false, error: `No data for ${stockCode} on ${date}` });
    }

    console.log(`[BrokerSummary] File found at: ${usedPath}, size: ${csvData.length} characters`);

    const lines = csvData.trim().split('\n');
    if (lines.length < 2) {
      console.error(`[BrokerSummary] Invalid CSV format: only ${lines.length} lines`);
      return res.status(404).json({ success: false, error: 'Invalid CSV format' });
    }

    console.log(`[BrokerSummary] CSV has ${lines.length} lines (including header)`);

    const headers = (lines[0] || '').split(',').map(h => h.trim());
    console.log(`[BrokerSummary] CSV headers:`, headers);

    const brokerData: any[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = (lines[i] || '').split(',').map(v => v.trim());
      if (values.length !== headers.length) {
        console.warn(`[BrokerSummary] Row ${i} skipped: ${values.length} values vs ${headers.length} headers`);
        continue;
      }
      const row: any = {};
      headers.forEach((h, idx) => {
        const raw = values[idx];
        if (['BuyerVol','BuyerValue','SellerVol','SellerValue','NetBuyVol','NetBuyValue','BuyerAvg','SellerAvg'].includes(h)) {
          row[h] = parseFloat(raw || '0') || 0;
        } else {
          row[h] = raw || '';
        }
      });
      brokerData.push(row);
    }

    console.log(`[BrokerSummary] Parsed ${brokerData.length} broker rows for ${stockCode} on ${date}`);
    if (brokerData.length > 0) {
      console.log(`[BrokerSummary] Sample row:`, brokerData[0]);
    }

    return res.json({ success: true, data: { stockCode, date, market: normalizeMarket(market) || 'RG', path: usedPath, brokerData } });
  } catch (error: any) {
    console.error('broker-summary/summary error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to fetch summary' });
  }
});

router.get('/dates', async (_req, res) => {
  try {
    // Collect dates from all modern prefixes (rg/tn/ng) and legacy
    const prefixes = ['broker_summary_rg/', 'broker_summary_tn/', 'broker_summary_ng/', 'broker_summary/'];
    const dates = new Set<string>();
    for (const prefix of prefixes) {
      const files = await listPaths({ prefix });
      (files || []).forEach(file => {
        // Match modern path: broker_summary_rg/broker_summary_rg_20241021/
        const m1 = file.match(/broker_summary_(rg|tn|ng)\/broker_summary_\1_(\d{8})\//);
        // Match legacy path: broker_summary/broker_summary_20241021/
        const m2 = file.match(/broker_summary\/broker_summary_(\d{8})\//);
        if (m1 && m1[2]) dates.add(m1[2]);
        if (m2 && m2[1]) dates.add(m2[1]);
      });
    }
    const sorted = Array.from(dates).sort().reverse();
    return res.json({ success: true, data: { dates: sorted } });
  } catch (error: any) {
    console.error('broker-summary/dates error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to list dates' });
  }
});

export default router;


