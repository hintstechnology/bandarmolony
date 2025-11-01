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
  const normalized = normalizeMarket(market) || 'RG';
  const type = normalized.toLowerCase(); // 'rg' | 'tn' | 'ng'
  const typeFolder = type === 'rg' ? 'rk' : type; // map RG to rk output
  const modernPrefix = `broker_summary_${typeFolder}/broker_summary_${typeFolder}_${date}/`;
  const legacyPrefix = `broker_summary/broker_summary_${date}/`;
  return { modernPrefix, legacyPrefix };
}

router.get('/stocks', async (req, res) => {
  try {
    const { date, market } = querySchema.parse(req.query);
    const { modernPrefix, legacyPrefix } = resolvePaths(date, market);

    let files = await listPaths({ prefix: modernPrefix });
    if (!files || files.length === 0) {
      files = await listPaths({ prefix: legacyPrefix });
    }

    const stocks = (files || [])
      .filter(path => path.endsWith('.csv') && !path.includes('ALLSUM'))
      .map(path => path.split('/').pop() || '')
      .map(name => name.replace('.csv', ''))
      .filter(code => code.length === 4)
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

    const { modernPrefix, legacyPrefix } = resolvePaths(date, market);
    const modernPath = `${modernPrefix}${stockCode}.csv`;
    const legacyPath = `${legacyPrefix}${stockCode}.csv`;

    // Try modern path first
    let csvData = await downloadText(modernPath);
    let usedPath = modernPath;
    if (!csvData) {
      csvData = await downloadText(legacyPath);
      usedPath = legacyPath;
    }

    if (!csvData) {
      return res.status(404).json({ success: false, error: `No data for ${stockCode} on ${date}` });
    }

    const lines = csvData.trim().split('\n');
    if (lines.length < 2) {
      return res.status(404).json({ success: false, error: 'Invalid CSV format' });
    }

    const headers = (lines[0] || '').split(',').map(h => h.trim());
    const brokerData: any[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = (lines[i] || '').split(',').map(v => v.trim());
      if (values.length !== headers.length) continue;
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

    return res.json({ success: true, data: { stockCode, date, market: normalizeMarket(market) || 'RG', path: usedPath, brokerData } });
  } catch (error: any) {
    console.error('broker-summary/summary error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to fetch summary' });
  }
});

router.get('/dates', async (_req, res) => {
  try {
    // Collect dates from all modern prefixes (rk/tn/ng) and legacy
    const prefixes = ['broker_summary_rk/', 'broker_summary_tn/', 'broker_summary_ng/', 'broker_summary/'];
    const dates = new Set<string>();
    for (const prefix of prefixes) {
      const files = await listPaths({ prefix });
      (files || []).forEach(file => {
        const m1 = file.match(/broker_summary_(rk|tn|ng)\/broker_summary_\1_(\d{8})\//);
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


