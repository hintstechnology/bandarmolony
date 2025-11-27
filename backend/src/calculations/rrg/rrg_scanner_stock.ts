// rrg_scanner_stock.ts
// ------------------------------------------------------------
// Relative Rotation Graph (RRG) Scanner for individual stocks
// Membaca data RRG dari file output dan membuat scanner tabel
// Output: CSV file dengan nama "o3-rrg.csv" di folder rrg_output/scanner
// ------------------------------------------------------------

import { downloadText, uploadText, listPaths, exists } from '../../utils/azureBlob';
import { BATCH_SIZE_PHASE_2 } from '../../services/dataUpdateService';

// Helper function to limit concurrency for Phase 2
async function limitConcurrency<T>(promises: Promise<T>[], maxConcurrency: number): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < promises.length; i += maxConcurrency) {
    const batch = promises.slice(i, i + maxConcurrency);
    const batchResults = await Promise.allSettled(batch);
    batchResults.forEach((result) => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      }
    });
  }
  return results;
}

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


// Sector mapping cache (same as stockDataUpdateService.ts)
const SECTOR_MAPPING: { [key: string]: string[] } = {
  'Basic Materials': [],
  'Consumer Cyclicals': [],
  'Consumer Non-Cyclicals': [],
  'Energy': [],
  'Financials': [],
  'Healthcare': [],
  'Industrials': [],
  'Infrastructures': [],
  'Properties & Real Estate': [],
  'Technology': [],
  'Transportation & Logistic': []
};

/**
 * Build sector mapping from Azure Storage (same as stockDataUpdateService.ts)
 */
async function buildSectorMappingFromAzure(): Promise<void> {
  console.log('🔍 Building sector mapping from Azure Storage...');
  
  try {
    const stockBlobs = await listPaths({ prefix: 'stock/' });
    
    Object.keys(SECTOR_MAPPING).forEach(sector => {
      SECTOR_MAPPING[sector] = [];
    });
    
    for (const blobName of stockBlobs) {
      const pathParts = blobName.replace('stock/', '').split('/');
      if (pathParts.length === 2 && pathParts[0] && pathParts[1]) {
        const sector = pathParts[0];
        const emiten = pathParts[1].replace('.csv', '');
        
        if (SECTOR_MAPPING[sector]) {
          SECTOR_MAPPING[sector].push(emiten);
        }
      }
    }
    
    console.log('📊 Sector mapping built successfully');
  } catch (error) {
    console.warn('⚠️ Could not build sector mapping from Azure, using default');
  }
}

/**
 * Get sector for emiten using mapping (same as stockDataUpdateService.ts)
 */
function getSectorForEmiten(emiten: string): string {
  // Check if emiten already exists in mapping
  for (const [sector, emitens] of Object.entries(SECTOR_MAPPING)) {
    if (emitens.includes(emiten)) {
      return sector;
    }
  }
  
  // If not found, distribute based on hash
  const sectors = Object.keys(SECTOR_MAPPING);
  if (sectors.length === 0) {
    return 'Financials'; // Default fallback
  }
  
  const hash = emiten.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0);
  const sectorIndex = Math.abs(hash) % sectors.length;
  const selectedSector = sectors[sectorIndex];
  
  if (!selectedSector) {
    return 'Financials'; // Default fallback
  }
  
  if (!SECTOR_MAPPING[selectedSector]) {
    SECTOR_MAPPING[selectedSector] = [];
  }
  SECTOR_MAPPING[selectedSector].push(emiten);
  
  return selectedSector;
}

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
 * Read stock price data from CSV using proper sector mapping
 */
async function readStockData(stockCode: string): Promise<StockData | null> {
  // Get sector for this stock using mapping
  const sector = getSectorForEmiten(stockCode);
  const stockPath = `stock/${sector}/${stockCode}.csv`;
  
  try {
    if (!(await exists(stockPath))) {
      console.log(`⚠️ No stock data for ${stockCode} in sector ${sector}`);
      return null;
    }
    
    const raw = await downloadText(stockPath);
    const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
    
    if (lines.length === 0) return null;
    
    // Parse header
    const header = parseCsvLine(lines[0] || '');
    const lower = header.map((c) => c.replace(/^\uFEFF/, "").trim().toLowerCase());
    
    // Look for date and close columns
    let dateIdx = lower.indexOf("date");
    if (dateIdx < 0) dateIdx = lower.indexOf("time");
    const closeIdx = lower.indexOf("close");
    
    if (dateIdx < 0 || closeIdx < 0) return null;
    
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
  } catch (error) {
    console.log(`⚠️ Error reading stock data for ${stockCode}: ${error}`);
    return null;
  }
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
 * Scan all available stocks and generate scanner data using CSV input
 */
async function scanAllStocks(): Promise<ScannerResult[]> {
  const results: ScannerResult[] = [];
  
  // Build sector mapping first
  await buildSectorMappingFromAzure();
  
  // Get list of stocks from CSV input (same as stockDataUpdateService.ts)
  let stockList: string[] = [];
  try {
    const emitensCsvData = await downloadText('csv_input/emiten_list.csv');
    stockList = emitensCsvData.split('\n')
      .map(line => line.trim())
      .filter(line => line && line.length > 0);
    console.log(`📊 Found ${stockList.length} stocks from CSV input`);
  } catch (error) {
    console.log(`⚠️ Could not read CSV input, trying to get from RRG files`);
    
    // Fallback: Get all o1-rrg-*.csv files from rrg_output/stock
    const rrgOutputDir = "rrg_output/stock";
    const files = await listPaths({ prefix: rrgOutputDir });
    const rrgFiles = files.filter(f => f.includes("o1-rrg-") && f.endsWith(".csv"));
    
    if (rrgFiles.length === 0) {
      console.log(`⚠️ No RRG stock files found in ${rrgOutputDir} - generate RRG data first`);
      return results;
    }
    
    stockList = rrgFiles.map(file => file.replace("o1-rrg-", "").replace(".csv", ""));
    console.log(`📊 Found ${stockList.length} stocks from RRG files`);
  }
  
  let processedCount = 0;
  let successCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  
  // Process stocks in batches for better performance
  const BATCH_SIZE = BATCH_SIZE_PHASE_2; // Phase 2: 500 stocks at a time
  console.log(`📦 Processing stocks in batches of ${BATCH_SIZE}...`);
  
  for (let i = 0; i < stockList.length; i += BATCH_SIZE) {
    const batch = stockList.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
    console.log(`📦 Processing stock batch ${batchNumber}/${Math.ceil(stockList.length / BATCH_SIZE)}: ${batch.slice(0, 5).join(', ')}${batch.length > 5 ? `... (+${batch.length - 5} more)` : ''}`);
    
    // Memory check before batch
    if (global.gc) {
      const memBefore = process.memoryUsage();
      const heapUsedMB = memBefore.heapUsed / 1024 / 1024;
      if (heapUsedMB > 10240) { // 10GB threshold
        console.log(`⚠️ High memory usage detected: ${heapUsedMB.toFixed(2)}MB, forcing GC...`);
        global.gc();
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    // Process batch in parallel with concurrency limit 250
    const batchPromises = batch.map(async (stockCode) => {
      processedCount++;
      
      try {
        // Read RRG data
        const rrgData = await readRRGData(stockCode);
        if (!rrgData) {
          console.log(`⚠️ No RRG data for rrg_output/stock/o1-rrg-${stockCode}`);
          return { status: 'skipped', stockCode, reason: 'No RRG data' };
        }
        
        // Read stock price data using proper sector mapping
        const stockData = await readStockData(stockCode);
        if (!stockData) {
          console.log(`⚠️ No stock price data for ${stockCode}`);
          return { status: 'skipped', stockCode, reason: 'No stock data' };
        }
        
        // Calculate performance
        const performance = calculatePerformance(stockData);
        
        // Get sector using mapping
        const sector = getSectorForEmiten(stockCode);
        
        // Determine trend
        const trend = determineTrend(rrgData.rs_ratio, rrgData.rs_momentum, performance);
        
        const result = {
          symbol: stockCode,
          sector: sector,
          rs_ratio: Number(rrgData.rs_ratio.toFixed(1)),
          rs_momentum: Number(rrgData.rs_momentum.toFixed(1)),
          performance: Number(performance.toFixed(1)),
          trend: trend
        };
        
        console.log(`✅ Processed ${stockCode} (${sector}): RS-Ratio=${result.rs_ratio}, RS-Momentum=${result.rs_momentum}, Trend=${trend}`);
        
        return { status: 'success', stockCode, result };
        
      } catch (error) {
        console.log(`⚠️ Error processing ${stockCode}: ${error}`);
        return { status: 'error', stockCode, error: error instanceof Error ? error.message : String(error) };
      }
    });
    const batchResults = await limitConcurrency(batchPromises, 250);
    
    // Process batch results
    for (const batchResult of batchResults) {
      if (batchResult && typeof batchResult === 'object' && 'status' in batchResult) {
        const { status, result } = batchResult;
        
        if (status === 'success' && result) {
          results.push(result);
          successCount++;
        } else if (status === 'skipped') {
          skippedCount++;
        } else if (status === 'error') {
          errorCount++;
        }
      } else {
        errorCount++;
      }
    }
    
    // Log batch progress
    const batchSuccess = batchResults.filter(r => r && r.status === 'success').length;
    const batchSkipped = batchResults.filter(r => r && r.status === 'skipped').length;
    const batchErrors = batchResults.filter(r => !r || r.status === 'error').length;
    
    console.log(`📦 Batch ${batchNumber} complete: ✅ ${batchSuccess} success, ⏭️ ${batchSkipped} skipped, ❌ ${batchErrors} errors`);
    
    // Memory cleanup after batch
    if (global.gc) {
      global.gc();
      const memAfter = process.memoryUsage();
      const heapUsedMB = memAfter.heapUsed / 1024 / 1024;
      console.log(`📊 Batch ${batchNumber} complete - Memory: ${heapUsedMB.toFixed(2)}MB`);
    }
    
    // Small delay to give event loop breathing room
    if (i + BATCH_SIZE < stockList.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  // Final summary
  console.log(`\n📊 Processing Summary:`);
  console.log(`   Total processed: ${processedCount}`);
  console.log(`   Success: ${successCount}`);
  console.log(`   Skipped: ${skippedCount}`);
  console.log(`   Errors: ${errorCount}`);
  console.log(`   Results generated: ${results.length}`);
  
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
    const outputPath = "rrg_output/scanner/o3-rrg.csv";
    try {
      await uploadText(outputPath, csvOutput, 'text/csv');
      console.log(`✅ RRG Stock Scanner completed`);
      console.log(`📊 Processed ${results.length} stocks`);
      console.log(`📁 Output saved to: ${outputPath}`);
    } catch (error) {
      console.error(`❌ Error uploading to Azure: ${error}`);
      throw error;
    }
    
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
  try {
    console.log("🚀 Starting RRG Stock Scanner...");
    const startTime = Date.now();
    
    // Scan all stocks
    console.log("📊 Building sector mapping and loading stock list...");
    const results = await scanAllStocks();
    
    if (results.length === 0) {
      console.log("❌ No valid stock data found");
      return results;
    }
    
    console.log(`\n📊 Converting ${results.length} results to CSV format...`);
    // Convert to CSV
    const csvOutput = resultsToCsv(results);
    
    console.log("📤 Uploading to Azure Storage...");
    // Write to Azure
    const outputPath = "rrg_output/scanner/o3-rrg.csv";
    try {
      await uploadText(outputPath, csvOutput, 'text/csv');
      const endTime = Date.now();
      const duration = ((endTime - startTime) / 1000).toFixed(1);
      
      console.log(`✅ RRG Stock Scanner completed in ${duration}s`);
      console.log(`📊 Processed ${results.length} stocks`);
      console.log(`📁 Output saved to: ${outputPath}`);
    } catch (error) {
      console.error(`❌ Error uploading to Azure: ${error}`);
      throw error;
    }
    
    // Show summary by trend
    const trendCounts = results.reduce((acc, r) => {
      acc[r.trend] = (acc[r.trend] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    console.log("\n📈 Trend Distribution:");
    Object.entries(trendCounts).forEach(([trend, count]) => {
      console.log(`   ${trend}: ${count} stocks`);
    });
    
    // Show top performers
    console.log("\n🏆 Top 5 Stocks by RS-Ratio:");
    results.slice(0, 5).forEach((result, index) => {
      console.log(`   ${index + 1}. ${result.symbol} (${result.sector}): ${result.rs_ratio} (${result.trend})`);
    });
    
    return results;
  } catch (error) {
    console.error(`❌ Error in generateRrgStockScanner: ${error}`);
    throw error;
  }
}

// Execute if run directly
if (require.main === module) {
  main().catch((err) => {
    console.error(err?.stack || String(err));
    process.exit(1);
  });
}
