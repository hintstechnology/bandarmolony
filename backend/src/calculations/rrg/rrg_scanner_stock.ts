// rrc_scanner_stock.ts
// ------------------------------------------------------------
// Relative Rotation Graph (RRG) Scanner for individual stocks
// Membaca data RRG dari file output dan membuat scanner tabel
// Output: CSV file dengan nama "o3-rrg.csv" di folder rrg_output
// ------------------------------------------------------------

import { downloadText, uploadText, listPaths, exists } from '../../utils/azureBlob';

interface StockData {
  dates: string[];
  close: number[];
}

interface ScannerResult {
  symbol: string;
  sector: string;
  rs_ratio: number;
  rs_momentum: number;
  performance: number;
  trend: string;
}

// Cache for stock-to-sector mapping (will be populated dynamically from Azure)
const SECTOR_CACHE: { [key: string]: string } = {};

/**
 * Parse CSV line with proper quote handling
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === ',') {
        result.push(current);
        current = "";
      } else if (ch === '"') {
        inQuotes = true;
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result.map((s) => s.trim());
}

/**
 * Read stock price data from CSV
 */
async function readStockData(stockCode: string): Promise<StockData | null> {
  // Try to find stock CSV in different sector folders
  const stockDir = "stock";
  const sectorFolders = [
    "Basic Materials", "Consumer Cyclicals", "Consumer Non-Cyclicals",
    "Energy", "Financials", "Healthcare", "Industrials", 
    "Infrastructures", "Properties & Real Estate", "Technology",
    "Transportation & Logistic"
  ];
  
  for (const sectorFolder of sectorFolders) {
    const stockPath = `${stockDir}/${sectorFolder}/${stockCode}.csv`;
    
    try {
      if (await exists(stockPath)) {
        const raw = await downloadText(stockPath);
        const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
        
        if (lines.length === 0) continue;
        
        // Parse header
        const header = parseCsvLine(lines[0] || '');
        const lower = header.map((c) => c.replace(/^\uFEFF/, "").trim().toLowerCase());
        
        // Look for date and close columns
        let dateIdx = lower.indexOf("date");
        if (dateIdx < 0) dateIdx = lower.indexOf("time");
        const closeIdx = lower.indexOf("close");
        
        if (dateIdx < 0 || closeIdx < 0) continue;
        
        const dates: string[] = [];
        const close: number[] = [];
        
        for (let i = 1; i < lines.length; i++) {
          const cols = parseCsvLine(lines[i] || '');
          if (cols.length <= Math.max(dateIdx, closeIdx)) continue;
          
          const rawDate = cols[dateIdx]?.trim();
          const rawClose = cols[closeIdx]?.trim();
          
          if (!rawDate || !rawClose) continue;
          
          const normalized = rawClose.replace(/,/g, "");
          const num = Number.parseFloat(normalized);
          
          if (Number.isFinite(num)) {
            dates.push(rawDate);
            close.push(num);
          }
        }
        
        return { dates, close };
      }
    } catch (error) {
      continue;
    }
  }
  
  return null;
}

/**
 * Read RRG data from o1-rrg-{stock}.csv files
 */
async function readRRGData(stockCode: string): Promise<{rs_ratio: number, rs_momentum: number} | null> {
  const rrgPath = `rrg_output/stock/o1-rrg-${stockCode}.csv`;
  
  try {
    if (!(await exists(rrgPath))) return null;
    
    const raw = await downloadText(rrgPath);
    const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
    
    if (lines.length < 2) return null;
    
    // Get latest data (first data row after header)
    const header = parseCsvLine(lines[0] || '');
    const dataLine = parseCsvLine(lines[1] || '');
    
    const rsRatioIdx = header.indexOf("rs_ratio");
    const rsMomentumIdx = header.indexOf("rs_momentum");
    
    if (rsRatioIdx < 0 || rsMomentumIdx < 0) return null;
    
    const rsRatioVal = dataLine[rsRatioIdx];
    const rsMomentumVal = dataLine[rsMomentumIdx];
    
    if (!rsRatioVal || !rsMomentumVal) return null;
    
    const rsRatio = Number.parseFloat(rsRatioVal);
    const rsMomentum = Number.parseFloat(rsMomentumVal);
    
    if (!Number.isFinite(rsRatio) || !Number.isFinite(rsMomentum)) return null;
    
    return { rs_ratio: rsRatio, rs_momentum: rsMomentum };
    
  } catch (error) {
    return null;
  }
}

/**
 * Calculate performance (price change percentage)
 */
function calculatePerformance(stockData: StockData): number {
  if (stockData.close.length < 2) return 0;
  
  // Calculate performance from latest vs previous period
  const latest = stockData.close[0];  // Most recent
  const previous = stockData.close[Math.min(5, stockData.close.length - 1)]; // 5 days ago or oldest
  
  if (latest === undefined || previous === undefined || previous === 0) return 0;
  
  return ((latest - previous) / previous) * 100;
}

/**
 * Determine trend based on RS-Ratio and RS-Momentum
 */
function determineTrend(rsRatio: number, rsMomentum: number, performance: number): string {
  // Strong: RS-Ratio > 100 AND RS-Momentum > 100 AND positive performance
  if (rsRatio > 100 && rsMomentum > 100 && performance > 0) {
    return "STRONG";
  }
  
  // Improving: RS-Ratio < 100 BUT RS-Momentum > 100
  if (rsRatio < 100 && rsMomentum > 100) {
    return "IMPROVING";
  }
  
  // Weakening: RS-Ratio > 100 BUT RS-Momentum < 100
  if (rsRatio > 100 && rsMomentum < 100) {
    return "WEAKENING";
  }
  
  // Weak: RS-Ratio < 100 AND RS-Momentum < 100
  if (rsRatio < 100 && rsMomentum < 100) {
    return "WEAK";
  }
  
  return "NEUTRAL";
}

/**
 * Get sector for stock code (with caching)
 */
async function getSector(stockCode: string): Promise<string> {
  // Check cache first
  if (SECTOR_CACHE[stockCode]) {
    return SECTOR_CACHE[stockCode];
  }
  
  // Try to find from folder structure
  const stockDir = "stock";
  const sectorFolders = [
    "Basic Materials", "Consumer Cyclicals", "Consumer Non-Cyclicals",
    "Energy", "Financials", "Healthcare", "Industrials", 
    "Infrastructures", "Properties & Real Estate", "Technology",
    "Transportation & Logistic"
  ];
  
  for (const sectorFolder of sectorFolders) {
    const stockPath = `${stockDir}/${sectorFolder}/${stockCode}.csv`;
    if (await exists(stockPath)) {
      // Simplify sector names for display
      let sectorName = sectorFolder;
      if (sectorFolder.includes("Consumer Cyclicals")) sectorName = "Consumer Cyclicals";
      else if (sectorFolder.includes("Consumer Non-Cyclicals")) sectorName = "Consumer Non-Cyclicals";
      else if (sectorFolder.includes("Properties")) sectorName = "Properties";
      else if (sectorFolder.includes("Transportation")) sectorName = "Transportation";
      else if (sectorFolder.includes("Basic")) sectorName = "Basic Materials";
      
      // Cache the result
      SECTOR_CACHE[stockCode] = sectorName;
      return sectorName;
    }
  }
  
  // Cache "Unknown" too to avoid repeated lookups
  SECTOR_CACHE[stockCode] = "Unknown";
  return "Unknown";
}

/**
 * Scan all available stocks and generate scanner data
 */
async function scanAllStocks(): Promise<ScannerResult[]> {
  const results: ScannerResult[] = [];
  
  // Get all o1-rrg-*.csv files from rrg_output/stock
  const rrgOutputDir = "rrg_output/stock";
  
  const files = await listPaths({ prefix: rrgOutputDir });
  const rrgFiles = files.filter(f => f.includes("o1-rrg-") && f.endsWith(".csv"));
  
  if (rrgFiles.length === 0) {
    console.log(`⚠️ No RRG stock files found in ${rrgOutputDir} - generate RRG data first`);
    return results; // Return empty, scanner will be skipped
  }
  
  console.log(`📊 Found ${rrgFiles.length} RRG stock files`);
  
  for (const file of rrgFiles) {
    // Extract stock code from filename: o1-rrg-BBCA.csv -> BBCA
    const stockCode = file.replace("o1-rrg-", "").replace(".csv", "");
    
    try {
      // Read RRG data
      const rrgData = await readRRGData(stockCode);
      if (!rrgData) continue;
      
      // Read stock price data
      const stockData = await readStockData(stockCode);
      if (!stockData) continue;
      
      // Calculate performance
      const performance = calculatePerformance(stockData);
      
      // Get sector
      const sector = await getSector(stockCode);
      
      // Determine trend
      const trend = determineTrend(rrgData.rs_ratio, rrgData.rs_momentum, performance);
      
      results.push({
        symbol: stockCode,
        sector: sector,
        rs_ratio: Number(rrgData.rs_ratio.toFixed(1)),
        rs_momentum: Number(rrgData.rs_momentum.toFixed(1)),
        performance: Number(performance.toFixed(1)),
        trend: trend
      });
      
    } catch (error) {
      console.log(`⚠️  Error processing ${stockCode}: ${error}`);
      continue;
    }
  }
  
  // Sort by RS-Ratio descending
  results.sort((a, b) => b.rs_ratio - a.rs_ratio);
  
  return results;
}

/**
 * Convert scanner results to CSV format
 */
function resultsToCsv(results: ScannerResult[]): string {
  const header = "Symbol,Sector,RS-Ratio,RS-Momentum,Performance,Trend";
  const rows = results.map(result => 
    `${result.symbol},${result.sector},${result.rs_ratio},${result.rs_momentum},${result.performance > 0 ? '+' : ''}${result.performance}%,${result.trend}`
  );
  return `${header}\n${rows.join('\n')}`;
}

/**
 * Main function
 */
async function main(): Promise<void> {
  try {
    console.log("🚀 Starting RRG Stock Scanner...");
    
    // Scan all stocks
    const results = await scanAllStocks();
    
    if (results.length === 0) {
      console.log("❌ No valid stock data found");
      return;
    }
    
    // Convert to CSV
    const csvOutput = resultsToCsv(results);
    
    // Write to Azure
    const outputPath = "rrg_output/o3-rrg.csv";
    await uploadText(outputPath, csvOutput);
    
    console.log(`✅ RRG Stock Scanner completed`);
    console.log(`📊 Processed ${results.length} stocks`);
    console.log(`📁 Output saved to: ${outputPath}`);
    
    // Show summary by trend
    const trendCounts = results.reduce((acc, r) => {
      acc[r.trend] = (acc[r.trend] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    console.log("\n📈 Trend Distribution:");
    Object.entries(trendCounts).forEach(([trend, count]) => {
      console.log(`   ${trend}: ${count} stocks`);
    });
    
  } catch (error) {
    console.error(`❌ Error: ${error}`);
    process.exit(1);
  }
}

// Export function for backend use
export async function generateRrgStockScanner(): Promise<ScannerResult[]> {
  return await scanAllStocks();
}

// Execute if run directly
if (require.main === module) {
  main().catch((err) => {
    console.error(err?.stack || String(err));
    process.exit(1);
  });
}
