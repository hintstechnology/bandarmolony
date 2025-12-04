// rrg_saham_api.ts
// ------------------------------------------------------------
// Relative Rotation Graph (RRG) analysis for individual stocks
// Input: nama emiten (parameter). Data diambil dari CSV files.
// Output: CSV file dengan nama "o1-rrg-{emitter}.csv"
// ------------------------------------------------------------

import { downloadText, uploadText, listPaths, exists } from '../../utils/azureBlob';
import { stockCache } from '../../cache/stockCacheService';
import { indexCache } from '../../cache/indexCacheService';
import * as path from 'path';

type NumericArray = number[];
type DateArray = string[];

interface StockData {
  dates: DateArray;
  close: NumericArray;
}

interface RRGPoint {
  date: string;
  rs_ratio: number;
  rs_momentum: number;
}

interface RRGResult {
  emitter: string;
  benchmark: string;
  lookback_points: number;
  total_points: number;
  latest_point: RRGPoint | null;
  quadrant: string;
  trajectory: RRGPoint[];
}


/**
 * Calculate RS Ratio (Relative Strength Ratio)
 * RS Ratio = (Asset Price / Benchmark Price) * 100
 * Use raw RS for all data (no moving average smoothing)
 */
function calculateRSRatio(assetPrices: NumericArray, benchmarkPrices: NumericArray, _period: number = 14): NumericArray {
  // Calculate relative strength directly for all data
  const rs = assetPrices.map((price, i) => {
    const benchmarkPrice = benchmarkPrices[i];
    if (benchmarkPrice === undefined) return NaN;
    return (price / benchmarkPrice) * 100;
  });
  
  return rs;
}

/**
 * Calculate RS Momentum
 * RS Momentum = (Current RS Ratio / RS Ratio n periods ago) * 100
 * Use 1-day period for all data (same as original)
 */
function calculateRSMomentum(rsRatio: NumericArray, _period: number = 14): NumericArray {
  const result: NumericArray = [];
  
  for (let i = 0; i < rsRatio.length; i++) {
    const currentRatio = rsRatio[i];
    const pastRatio = rsRatio[i - 1];
    
    if (i >= 1 && currentRatio !== undefined && pastRatio !== undefined && !isNaN(currentRatio) && !isNaN(pastRatio)) {
      // Use 1-day period for all data (same as original)
      result.push((currentRatio / pastRatio) * 100);
    } else if (i === 0 && currentRatio !== undefined && !isNaN(currentRatio)) {
      // For first data point (latest date), use 100 as neutral momentum
      result.push(100);
    } else {
      result.push(NaN);
    }
  }
  
  return result;
}

/**
 * Determine quadrant based on RS Ratio and RS Momentum
 */
function determineQuadrant(rsRatio: number | undefined, rsMomentum: number | undefined): string {
  if (rsRatio === undefined || rsMomentum === undefined || isNaN(rsRatio) || isNaN(rsMomentum)) {
    return "Unknown";
  }
  
  if (rsRatio > 100 && rsMomentum > 100) {
    return "Leading";
  } else if (rsRatio < 100 && rsMomentum > 100) {
    return "Improving";
  } else if (rsRatio > 100 && rsMomentum < 100) {
    return "Weakening";
  } else {
    return "Lagging";
  }
}

// ---------------------- CSV Utilities ----------------------
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

async function readCsvData(filePath: string): Promise<StockData> {
  // Use appropriate cache based on file path
  const raw = filePath.startsWith('stock/')
    ? await stockCache.getRawContent(filePath) || ''
    : filePath.startsWith('index/')
    ? await indexCache.getRawContent(filePath) || ''
    : await downloadText(filePath);
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  
  if (lines.length === 0) {
    throw new Error(`CSV kosong: ${filePath}`);
  }
  
  // Parse header
  const header = parseCsvLine(lines[0] || '');
  const lower = header.map((c) => c.replace(/^\uFEFF/, "").trim().toLowerCase());
  
  // Look for date column (can be "date" or "time")
  let dateIdx = lower.indexOf("date");
  if (dateIdx < 0) {
    dateIdx = lower.indexOf("time");
  }
  const closeIdx = lower.indexOf("close");
  
  if (dateIdx < 0) {
    throw new Error(`Kolom 'date' atau 'time' tidak ditemukan di ${filePath}`);
  }
  if (closeIdx < 0) {
    throw new Error(`Kolom 'close' tidak ditemukan di ${filePath}`);
  }
  
  const dates: string[] = [];
  const close: number[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i] || '');
    if (cols.length <= Math.max(dateIdx, closeIdx)) continue;
    
    const rawDate = cols[dateIdx]?.trim();
    const rawClose = cols[closeIdx]?.trim();
    
    if (!rawDate || !rawClose) continue;
    
    // Parse close price (remove thousand separators)
    const normalized = rawClose.replace(/,/g, "");
    const num = Number.parseFloat(normalized);
    
    if (Number.isFinite(num)) {
      dates.push(rawDate);
      close.push(num);
    }
  }
  
  // Data sudah terurut descending dari stock scheduler (data terbaru di atas)
  // Tidak perlu sorting lagi, langsung return data asli
  return { dates, close };
}

async function fileExists(p: string): Promise<boolean> {
  return await exists(p);
}

async function findEmitterCsv(emitter: string, dir: string): Promise<string | null> {
  const upper = emitter.toUpperCase();
  
  // Define sector folders to search
  const sectorFolders = [
    "Basic Materials", "Consumer Cyclicals", "Consumer Non-Cyclicals",
    "Energy", "Financials", "Healthcare", "Industrials", 
    "Infrastructures", "Properties & Real Estate", "Technology",
    "Transportation & Logistic"
  ];
  
  // Search in each sector folder
  for (const sectorFolder of sectorFolders) {
    const sectorPath = `${dir}/${sectorFolder}`;
    let files: string[] = [];
    try {
      files = await listPaths({ prefix: sectorPath });
    } catch {
      continue; // Skip if sector folder doesn't exist
    }
    
    // Filter CSV files only
    const csvs = files.filter((f) => f.toLowerCase().endsWith(".csv"));
    
    // Find file that matches the stock code
    // Match pattern: "stock/{Sector}/{STOCKCODE}.csv"
    const stockFile = csvs.find(f => {
      const filename = f.split('/').pop() || '';
      return filename.toLowerCase() === `${upper}.csv`.toLowerCase();
    });
    
    if (stockFile) {
      return stockFile;
    }
  }
  
  return null;
}

async function findBenchmarkCsv(dir: string): Promise<string | null> {
  const patterns = [
    "IDX_DLY_COMPOSITE, 1D.csv",
    "COMPOSITE.csv",
    "composite.csv",
    "IHSG.csv",
    "ihsg.csv"
  ];
  
  for (const pattern of patterns) {
    const filePath = `${dir}/${pattern}`;
    if (await fileExists(filePath)) {
      return filePath;
    }
  }
  
  // Fallback: scan for any file containing "composite" or "ihsg"
  let files: string[] = [];
  try {
    files = await listPaths({ prefix: dir });
  } catch {
    return null;
  }
  
  const csvs = files.filter((f) => f.toLowerCase().endsWith(".csv"));
  const benchmarkFile = csvs.find(f => {
    const lower = f.toLowerCase();
    return lower.includes("composite") || lower.includes("ihsg");
  });
  
  if (benchmarkFile) {
    return `${dir}/${benchmarkFile}`;
  }
  
  return null;
}

async function findIndexCsv(indexName: string, indexDir: string): Promise<string | null> {
  const indexPath = `${indexDir}/${indexName}.csv`;
  if (await fileExists(indexPath)) {
    return indexPath;
  }
  return null;
}

async function listAvailableIndexes(indexDir: string): Promise<string[]> {
  try {
    const items = await listPaths({ prefix: indexDir });
    const indexes: string[] = [];
    
    for (const item of items) {
      if (item.toLowerCase().endsWith('.csv')) {
        // Remove both 'index/' prefix and '.csv' suffix
        const cleanName = item.replace(/^index\//, '').replace('.csv', '');
        indexes.push(cleanName);
      }
    }
    
    return indexes.sort();
  } catch (err) {
    throw new Error(`Tidak bisa baca folder index: ${err}`);
  }
}

/**
 * Generate RRG data for a single stock
 */
async function generateRRGData(emitter: string, stockDir: string, indexDir: string, lookbackPoints: number = 10, indexName?: string): Promise<RRGResult | null> {
  const activeFiles: string[] = [];
  
  try {
    // Find stock CSV
    const stockPath = await findEmitterCsv(emitter, stockDir);
    if (!stockPath) {
      throw new Error(`CSV untuk emiten '${emitter}' tidak ditemukan di '${stockDir}'`);
    }
    
    // Find index CSV - use specified index or default to COMPOSITE
    let indexPath: string | null = null;
    let benchmarkName = "COMPOSITE";
    
    if (indexName) {
      indexPath = await findIndexCsv(indexName, indexDir);
      if (!indexPath) {
        throw new Error(`Index '${indexName}' tidak ditemukan di '${indexDir}'`);
      }
      benchmarkName = indexName.toUpperCase();
    } else {
      // Fallback to default COMPOSITE search
      indexPath = await findBenchmarkCsv(indexDir);
      if (!indexPath) {
        throw new Error(`CSV index tidak ditemukan di '${indexDir}'. Gunakan --index untuk memilih index yang tersedia.`);
      }
    }
    
    // Set active processing files HANYA untuk file yang benar-benar akan diproses
    if (stockPath.startsWith('stock/')) {
      stockCache.addActiveProcessingFile(stockPath);
      activeFiles.push(stockPath);
    }
    if (indexPath && indexPath.startsWith('index/')) {
      indexCache.addActiveProcessingFile(indexPath);
      activeFiles.push(indexPath);
    }
    
    // Read data
    console.log(`📖 Reading stock data from: ${stockPath}`);
    console.log(`📖 Reading index data from: ${indexPath}`);
    const stockData = await readCsvData(stockPath);
    const indexData = await readCsvData(indexPath);
    
    if (!stockData || stockData.close.length < 50) {
      throw new Error(`Data emiten '${emitter}' terlalu sedikit (minimum 50 data points)`);
    }
    
    if (!indexData || indexData.close.length < 50) {
      throw new Error(`Data index terlalu sedikit (minimum 50 data points)`);
    }
    
    // Align data by dates (use stock dates as reference)
    // Data terbaru ada di atas (index 0), jadi kita ambil data dari atas
    const alignedIndex: NumericArray = [];
    const alignedStock: NumericArray = [];
    const alignedDates: DateArray = [];
    
    // Normalize date formats untuk comparison
    function normalizeDate(dateStr: string): string {
      // Convert M/D/YYYY to YYYY-MM-DD
      if (dateStr.includes('/')) {
        const parts = dateStr.split('/');
        const month = parts[0];
        const day = parts[1];
        const year = parts[2];
        if (!month || !day || !year) return dateStr;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
      return dateStr; // Already in YYYY-MM-DD format
    }
    
    // Create a map for index data for faster lookup
    const indexMap = new Map<string, number>();
    for (let j = 0; j < indexData.dates.length; j++) {
      const indexDate = indexData.dates[j];
      if (!indexDate) continue;
      
      const indexClose = indexData.close[j];
      if (indexClose === undefined) continue;
      
      const normalizedIndexDate = normalizeDate(indexDate);
      indexMap.set(normalizedIndexDate, indexClose);
    }
    
    // Log first few dates from both datasets for debugging
    if (emitter.toUpperCase() === 'TRIL') {
      console.log(`🔍 RRG Debug for ${emitter}:`);
      console.log(`📊 Stock dates (first 5): ${stockData.dates.slice(0, 5).join(', ')}`);
      console.log(`📈 Index dates (first 5): ${indexData.dates.slice(0, 5).join(', ')}`);
      console.log(`🗺️ Index map keys (first 5): ${Array.from(indexMap.keys()).slice(0, 5).join(', ')}`);
      console.log(`📦 Stock total dates: ${stockData.dates.length}`);
      console.log(`📦 Index total dates: ${indexData.dates.length}`);
      
      // Check if 2025-10-28 exists in both datasets
      const hasStock20251028 = stockData.dates.includes('2025-10-28');
      const hasIndex20251028 = indexMap.has('2025-10-28');
      console.log(`🔍 Has stock 2025-10-28: ${hasStock20251028}`);
      console.log(`🔍 Has index 2025-10-28: ${hasIndex20251028}`);
    }
    
    // Cari tanggal yang cocok antara stock dan index data
    for (let i = 0; i < stockData.dates.length; i++) {
      const stockDate = stockData.dates[i];
      if (!stockDate) continue;
      
      const stockClose = stockData.close[i];
      if (stockClose === undefined) continue;
      
      const normalizedStockDate = normalizeDate(stockDate);
      
      // Cari tanggal yang sama di index data menggunakan map
      const indexClose = indexMap.get(normalizedStockDate);
      
      if (indexClose !== undefined) {
        alignedDates.push(stockDate); // Gunakan format asli dari stock
        alignedStock.push(stockClose);
        alignedIndex.push(indexClose);
      } else if (i < 5) { // Debug first few mismatches
        console.log(`❌ No index data for stock date: ${stockDate} (normalized: ${normalizedStockDate})`);
      }
    }
    
    console.log(`✅ Aligned dates count: ${alignedDates.length}`);
    if (emitter.toUpperCase() === 'TRIL') {
      console.log(`🔍 First 3 aligned dates: ${alignedDates.slice(0, 3).join(', ')}`);
    }
    
    if (alignedDates.length < 10) {
      throw new Error(`Data yang ter-align terlalu sedikit (minimum 10 data points)`);
    }
    
    // Calculate RS Ratio and RS Momentum using proper functions
    const rsRatio = calculateRSRatio(alignedStock, alignedIndex, 14);
    const rsMomentum = calculateRSMomentum(rsRatio, 14);
    
    // Create valid data points (remove NaN values)
    const validPoints: RRGPoint[] = [];
    for (let i = 0; i < alignedDates.length; i++) {
      const currentRatio = rsRatio[i];
      const currentMomentum = rsMomentum[i];
      const currentDate = alignedDates[i];
      
      if (currentRatio !== undefined && currentMomentum !== undefined && currentDate && 
          !isNaN(currentRatio) && !isNaN(currentMomentum)) {
        validPoints.push({
          date: currentDate,
          rs_ratio: Number(currentRatio.toFixed(2)),
          rs_momentum: Number(currentMomentum.toFixed(2))
        });
      }
    }
    
    
    if (validPoints.length < 10) {
      throw new Error(`Data RRG yang valid terlalu sedikit (minimum 10 data points)`);
    }
    
    // Get latest N points for trajectory (data terbaru ada di atas)
    const trajectory = validPoints.slice(0, lookbackPoints);
    const latestPoint = trajectory[0]; // Data terbaru ada di index 0
    
    // Determine quadrant
    const quadrant = determineQuadrant(latestPoint?.rs_ratio, latestPoint?.rs_momentum);
    
    return {
      emitter: emitter.toUpperCase(),
      benchmark: benchmarkName,
      lookback_points: lookbackPoints,
      total_points: validPoints.length,
      latest_point: latestPoint || null,
      quadrant,
      trajectory
    };
    
  } catch (error) {
    throw new Error(`Error processing ${emitter}: ${error}`);
  } finally {
    // Cleanup: Remove active processing files setelah selesai
    for (const file of activeFiles) {
      if (file.startsWith('stock/')) {
        stockCache.removeActiveProcessingFile(file);
      } else if (file.startsWith('index/')) {
        indexCache.removeActiveProcessingFile(file);
      }
    }
    if (activeFiles.length > 0) {
      console.log(`🧹 Cleaned up ${activeFiles.length} active processing files from cache`);
    }
  }
}

/**
 * Convert RRGResult to CSV format
 */
function resultToCsv(result: RRGResult): string {
  const header = "date,rs_ratio,rs_momentum";
  // Data terbaru sudah ada di atas (index 0), jadi tidak perlu reverse
  const rows = result.trajectory.map(point => 
    `${point.date},${point.rs_ratio},${point.rs_momentum}`
  );
  return `${header}\n${rows.join('\n')}`;
}

// -------------------------- CLI --------------------------
// Usage examples:
//   npx ts-node rrg_saham_api.ts --emitter BBCA
//   npx ts-node rrg_saham_api.ts -e EMTK --stock-dir ./Final --index-dir ..
//   npx ts-node rrg_saham_api.ts --emitter FILM --lookback 10
//   npx ts-node rrg_saham_api.ts --emitter BBCA --index IDX30
//   npx ts-node rrg_saham_api.ts --list-indexes
// Output: CSV file dengan nama "o1-rrg-{EMITTER}.csv" di direktori yang sama dengan input file
// Format: 3 kolom - date, rs_ratio, rs_momentum

function printUsageAndExit(message?: string): never {
  if (message) {
    console.error(message);
  }
  console.error(
    "\nUsage:\n  ts-node rrg_saham_api.ts --emitter <NAME> [--stock-dir <DIR>] [--index-dir <DIR>] [--index <INDEX_NAME>] [--lookback <POINTS>]\n  ts-node rrg_saham_api.ts --list-indexes [--index-dir <DIR>]\n\nKeterangan:\n  - --emitter: Nama emiten yang akan dianalisis\n  - --stock-dir: Direktori untuk file CSV saham (default: .)\n  - --index-dir: Direktori untuk file CSV index/benchmark (default: ..)\n  - --index: Nama index yang akan digunakan sebagai benchmark (default: COMPOSITE)\n  - --lookback: Jumlah titik untuk trajectory (default: 10)\n  - --list-indexes: Tampilkan daftar index yang tersedia\n"
  );
  process.exit(1);
}

function parseArgs(argv: string[]): { emitter?: string; stockDir?: string; indexDir?: string; index?: string; lookback?: number; listIndexes?: boolean } {
  const out: { emitter?: string; stockDir?: string; indexDir?: string; index?: string; lookback?: number; listIndexes?: boolean } = {};
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--emitter" || token === "-e") {
      const next = argv[i + 1];
      if (!next || next.startsWith("-")) printUsageAndExit("Missing value for --emitter");
      out.emitter = next;
      i++;
    } else if (token === "--stock-dir" || token === "-sd") {
      const next = argv[i + 1];
      if (!next || next.startsWith("-")) printUsageAndExit("Missing value for --stock-dir");
      out.stockDir = next;
      i++;
    } else if (token === "--index-dir" || token === "-id") {
      const next = argv[i + 1];
      if (!next || next.startsWith("-")) printUsageAndExit("Missing value for --index-dir");
      out.indexDir = next;
      i++;
    } else if (token === "--index") {
      const next = argv[i + 1];
      if (!next || next.startsWith("-")) printUsageAndExit("Missing value for --index");
      out.index = next;
      i++;
    } else if (token === "--lookback" || token === "-l") {
      const next = argv[i + 1];
      if (!next || next.startsWith("-")) printUsageAndExit("Missing value for --lookback");
      const num = Number.parseInt(next);
      if (isNaN(num) || num < 1) printUsageAndExit("Invalid value for --lookback (must be positive integer)");
      out.lookback = num;
      i++;
    } else if (token === "--list-indexes") {
      out.listIndexes = true;
    }
  }
  return out;
}

async function main(): Promise<void> {
  const { emitter, stockDir, indexDir, index, lookback, listIndexes } = parseArgs(process.argv);
  
  // List available indexes if requested
  if (listIndexes) {
    try {
      const indexBaseDir = path.resolve(indexDir || "..");
      const indexes = await listAvailableIndexes(indexBaseDir);
      console.log(`\nIndex yang tersedia di ${indexBaseDir}:`);
      indexes.forEach((idx, i) => {
        console.log(`  ${i + 1}. ${idx}`);
      });
      console.log(`\nTotal: ${indexes.length} index`);
    } catch (err) {
      console.error(`Error: ${err}`);
      process.exit(1);
    }
    return;
  }
  
  if (!emitter) {
    printUsageAndExit("--emitter is required");
  }

  const stockBaseDir = path.resolve(stockDir || ".");
  const indexBaseDir = path.resolve(indexDir || "..");
  const lookbackPoints = lookback || 10;

  try {
    const result = await generateRRGData(emitter, stockBaseDir, indexBaseDir, lookbackPoints, index);
    
    if (!result) {
      throw new Error("Failed to generate RRG data");
    }
    
    const csvOutput = resultToCsv(result);
    
    // Generate output filename
    const outputFilename = `o1-rrg-${emitter.toUpperCase()}.csv`;
    const outputPath = `rrg_output/stock/${outputFilename}`;
    
    // Write CSV to Azure
    await uploadText(outputPath, csvOutput);
    
    console.log(`✅ RRG data generated for ${emitter}`);
    console.log(`📊 Total points: ${result.total_points}`);
    console.log(`📈 Latest point: RS-Ratio=${result.latest_point?.rs_ratio}, RS-Momentum=${result.latest_point?.rs_momentum}`);
    console.log(`🎯 Quadrant: ${result.quadrant}`);
    console.log(`📁 Output saved to: ${outputPath}`);
    
  } catch (error) {
    console.error(`❌ Error: ${error}`);
    process.exit(1);
  }
}

// Export functions for backend use
export async function calculateRrgStock(stockCode: string, indexName: string = 'COMPOSITE', config?: { stockDir: string; indexDir: string; outputDir: string }): Promise<string> {
  const stockDir = config?.stockDir || 'stock';
  const indexDir = config?.indexDir || 'index';
  const outputDir = config?.outputDir || 'rrg_output';
  const lookbackPoints = 1000; // Calculate all available data (up to 1000 points)
  
  try {
    // Silent processing for better performance
    
    const result = await generateRRGData(stockCode, stockDir, indexDir, lookbackPoints, indexName);
    
    if (!result) {
      throw new Error(`Failed to generate RRG data for ${stockCode}`);
    }
    
    // Convert result to CSV
    const csvOutput = resultToCsv(result);
    
    // Generate output filename with subfolder
    const stockCodeClean = stockCode.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const outputFilename = `o1-rrg-${stockCodeClean}.csv`;
    const outputPath = `${outputDir}/stock/${outputFilename}`;
    
    // Upload to Azure
    await uploadText(outputPath, csvOutput, 'text/csv');
    
    console.log(`✅ Stock RRG completed: ${outputPath}`);
    console.log(`📊 Total points: ${result.total_points}`);
    console.log(`📈 Latest point: RS-Ratio=${result.latest_point?.rs_ratio?.toFixed(2)}, RS-Momentum=${result.latest_point?.rs_momentum?.toFixed(2)}`);
    console.log(`🎯 Quadrant: ${result.quadrant}`);
    
    return csvOutput;
  } catch (error) {
    console.error(`❌ Error calculating RRG for ${stockCode}:`, error);
    throw error;
  }
}

export async function listAvailableStocks(): Promise<string[]> {
  const stockDir = 'stock';
  const sectorFolders = [
    "Basic Materials", "Consumer Cyclicals", "Consumer Non-Cyclicals",
    "Energy", "Financials", "Healthcare", "Industrials", 
    "Infrastructures", "Properties & Real Estate", "Technology",
    "Transportation & Logistic"
  ];
  
  const allStocks: string[] = [];
  
  for (const sectorFolder of sectorFolders) {
    try {
      const sectorPath = `${stockDir}/${sectorFolder}`;
      const files = await listPaths({ prefix: sectorPath });
      const csvFiles = files.filter(f => f.toLowerCase().endsWith('.csv'));
      const stockCodes = csvFiles.map(f => {
        // Extract just the filename from full path: "stock/Basic Materials/ADMG.csv" -> "ADMG"
        const filename = f.split('/').pop() || '';
        return filename.replace('.csv', '');
      }).filter(code => code !== '');
      allStocks.push(...stockCodes);
    } catch (error) {
      // Skip if sector folder doesn't exist
      continue;
    }
  }
  
  return [...new Set(allStocks)].sort();
}

export async function listAvailableIndexesForRrg(): Promise<string[]> {
  const indexDir = 'index';
  return await listAvailableIndexes(indexDir);
}

// Execute if run directly
if (require.main === module) {
  main().catch((err) => {
    console.error(err?.stack || String(err));
    process.exit(1);
  });
}

