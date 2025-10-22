// rrg_sector_api.ts
// ------------------------------------------------------------
// Relative Rotation Graph (RRG) analysis for sectors
// Input: nama sector (parameter). Data diambil dari CSV files sector dan stock.
// Output: CSV file dengan nama "o2-rrg-{sector}.csv" di folder rrg_output
// ------------------------------------------------------------

import { downloadText, uploadText, listPaths, exists } from '../../utils/azureBlob';
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
  sector: string;
  benchmark: string;
  lookback_points: number;
  total_points: number;
  latest_point: RRGPoint | null;
  quadrant: string;
  trajectory: RRGPoint[];
  stocks_analyzed: number;
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
  const raw = await downloadText(filePath);
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
  
  return { dates, close };
}


async function fileExists(p: string): Promise<boolean> {
  return await exists(p);
}

async function getSectorStockCodes(sector: string, stockDir: string): Promise<string[]> {
  // Map sector names to folder names (with typo normalization)
  const sectorFolderMap: { [key: string]: string } = {
    'financials': 'Financials',
    'technology': 'Technology', 
    'energy': 'Energy',
    'healthcare': 'Healthcare',
    'industrials': 'Industrials',
    'infrastructures': 'Infrastructures',
    'properties': 'Properties & Real Estate',
    'properties & real estate': 'Properties & Real Estate',
    'properties & reaal estate': 'Properties & Real Estate', // Fix typo
    'transportation': 'Transportation & Logistic',
    'transportation & logistic': 'Transportation & Logistic',
    'transportation && logistic': 'Transportation & Logistic', // Fix typo
    'consumer cyclicals': 'Consumer Cyclicals',
    'consumer cyclicaals': 'Consumer Cyclicals', // Fix typo
    'consumer non-cyclicals': 'Consumer Non-Cyclicals',
    'consumer non-cycclicals': 'Consumer Non-Cyclicals', // Fix typo
    'basic materials': 'Basic Materials'
  };
  
  const normalizedSector = sector.toLowerCase();
  const folderName = sectorFolderMap[normalizedSector];
  
  if (!folderName) {
    throw new Error(`Sector '${sector}' tidak dikenali. Sector yang tersedia: ${Object.keys(sectorFolderMap).join(', ')}`);
  }
  
  const sectorPath = `${stockDir}/${folderName}`;
  
  // Read all CSV files in the sector folder
  let files: string[] = [];
  try {
    files = await listPaths({ prefix: sectorPath });
  } catch (error) {
    throw new Error(`Tidak dapat membaca folder '${sectorPath}': ${error}`);
  }
  
  if (files.length === 0) {
    throw new Error(`Folder sector '${folderName}' tidak ditemukan atau kosong di '${stockDir}'`);
  }
  
  const csvFiles = files.filter((f) => f.toLowerCase().endsWith(".csv"));
  // Extract only the filename (without path and .csv extension)
  const stockCodes = csvFiles.map(f => {
    const filename = f.split('/').pop() || f; // Get last part after /
    return filename.replace('.csv', '');
  });
  
  if (stockCodes.length === 0) {
    throw new Error(`Tidak ada file CSV stock ditemukan di folder '${folderName}'`);
  }
  
  return stockCodes;
}

async function findStockCsv(stockCode: string, sectorFolder: string): Promise<string | null> {
  try {
    const upper = stockCode.toUpperCase();
    const stockPath = `${sectorFolder}/${upper}.csv`;
    
    if (await exists(stockPath)) {
      return stockPath;
    }
    return null;
  } catch (error) {
    console.error(`❌ Error finding stock CSV for ${stockCode}:`, error);
    return null;
  }
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
        indexes.push(item.replace('.csv', ''));
      }
    }
    
    return indexes.sort();
  } catch (err) {
    throw new Error(`Tidak bisa baca folder index: ${err}`);
  }
}

/**
 * Calculate sector average price from multiple stocks
 */
async function calculateSectorAverage(sectorCodes: string[], sectorFolder: string, indexData: StockData): Promise<StockData | null> {
  const stockDataList: StockData[] = [];
  
  console.log(`📊 Calculating sector average from ${sectorCodes.length} stocks in ${sectorFolder}`);
  
  // Read data for each stock in the sector using batch processing
  let foundCount = 0;
  let validCount = 0;
  
  // Process stocks in batches for better performance
  const BATCH_SIZE = 20; // Process 20 stocks at a time
  console.log(`📦 Processing ${sectorCodes.length} stocks in batches of ${BATCH_SIZE}...`);
  
  for (let i = 0; i < sectorCodes.length; i += BATCH_SIZE) {
    const batch = sectorCodes.slice(i, i + BATCH_SIZE);
    console.log(`📦 Processing stock batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(sectorCodes.length / BATCH_SIZE)} (${batch.length} stocks)`);
    
    // Process batch in parallel
    const batchResults = await Promise.allSettled(batch.map(async (code) => {
      const stockPath = await findStockCsv(code, sectorFolder);
      if (stockPath) {
        try {
          const stockData = await readCsvData(stockPath);
          if (stockData.close.length >= 50) { // Minimum data requirement
            return { success: true, data: stockData, code };
          } else {
            return { success: false, reason: 'insufficient_data', code, length: stockData.close.length };
          }
        } catch (error) {
          return { success: false, reason: 'error', code, error };
        }
      }
      return { success: false, reason: 'not_found', code };
    }));
    
    // Process batch results
    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        const { success, data, code, reason, error } = result.value;
        if (success && data) {
          stockDataList.push(data);
          validCount++;
          foundCount++;
        } else if (reason === 'not_found') {
          // File not found - don't count as found
        } else {
          foundCount++;
          if (reason === 'insufficient_data') {
            // Silent skip for insufficient data
          } else if (reason === 'error') {
            console.error(`❌ ${code}: Error reading CSV:`, error);
          }
        }
      }
    }
    
    // Small delay between batches
    if (i + BATCH_SIZE < sectorCodes.length) {
      await new Promise(resolve => setTimeout(resolve, 5));
    }
  }
  
  console.log(`📊 Sector average calculation: Found ${foundCount}/${sectorCodes.length} files, ${validCount} valid stocks`);
  
  if (stockDataList.length === 0) {
    console.error(`❌ No valid stock data found in ${sectorFolder}`);
    return null;
  }
  
  // Use the first stock's dates as reference
  const referenceData = stockDataList[0];
  if (!referenceData) {
    throw new Error("No reference data available");
  }
  
  const alignedDates: DateArray = [];
  const sectorAverages: NumericArray = [];
  
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
  
  // Calculate average for each date
  for (let i = 0; i < referenceData.dates.length; i++) {
    const refDate = referenceData.dates[i];
    if (!refDate) continue;
    
    const normalizedRefDate = normalizeDate(refDate);
    
    // Find matching date in index data
    let indexPrice: number | null = null;
    for (let j = 0; j < indexData.dates.length; j++) {
      const indexDate = indexData.dates[j];
      if (!indexDate) continue;
      
      const normalizedIndexDate = normalizeDate(indexDate);
      
      if (normalizedRefDate === normalizedIndexDate) {
        const closePrice = indexData.close[j];
        indexPrice = closePrice !== undefined ? closePrice : null;
        break;
      }
    }
    
    if (indexPrice === null) continue;
    
    // Calculate average price for this date across all stocks
    let sum = 0;
    let count = 0;
    
    for (const stockData of stockDataList) {
      // Find matching date in this stock's data
      for (let k = 0; k < stockData.dates.length; k++) {
        const stockDate = stockData.dates[k];
        if (!stockDate) continue;
        
        const normalizedStockDate = normalizeDate(stockDate);
        
        if (normalizedStockDate === normalizedRefDate) {
          const closePrice = stockData.close[k];
          if (closePrice !== undefined) {
            sum += closePrice;
            count++;
          }
          break;
        }
      }
    }
    
    if (count > 0) {
      alignedDates.push(refDate);
      sectorAverages.push(sum / count);
    }
  }
  
  return {
    dates: alignedDates,
    close: sectorAverages
  };
}

/**
 * Generate RRG data for a sector
 */
async function generateRRGSectorData(sector: string, stockDir: string, indexDir: string, lookbackPoints: number = 10, indexName?: string): Promise<RRGResult | null> {
  try {
    // Get sector stock codes from folder
    const sectorCodes = await getSectorStockCodes(sector, stockDir);
    
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
    
    // Read index data
    const indexData = await readCsvData(indexPath);
    
    console.log(`Found ${sectorCodes.length} stocks in sector ${sector}`);
    
    if (indexData.close.length < 50) {
      throw new Error(`Data index terlalu sedikit (minimum 50 data points)`);
    }
    
    // Get sector folder path (with typo normalization)
    const sectorFolderMap: { [key: string]: string } = {
      'financials': 'Financials',
      'technology': 'Technology', 
      'energy': 'Energy',
      'healthcare': 'Healthcare',
      'industrials': 'Industrials',
      'infrastructures': 'Infrastructures',
      'properties': 'Properties & Real Estate',
      'properties & real estate': 'Properties & Real Estate',
      'properties & reaal estate': 'Properties & Real Estate', // Fix typo
      'transportation': 'Transportation & Logistic',
      'transportation & logistic': 'Transportation & Logistic',
      'transportation && logistic': 'Transportation & Logistic', // Fix typo
      'consumer cyclicals': 'Consumer Cyclicals',
      'consumer cyclicaals': 'Consumer Cyclicals', // Fix typo
      'consumer non-cyclicals': 'Consumer Non-Cyclicals',
      'consumer non-cycclicals': 'Consumer Non-Cyclicals', // Fix typo
      'basic materials': 'Basic Materials'
    };
    
    const normalizedSector = sector.toLowerCase();
    const folderName = sectorFolderMap[normalizedSector];
    
    if (!folderName) {
      throw new Error(`Unknown sector mapping for: ${sector}. Available sectors: ${Object.keys(sectorFolderMap).join(', ')}`);
    }
    
    const sectorFolder = `${stockDir}/${folderName}`;
    console.log(`📁 Sector folder: ${sectorFolder}`);
    
    // Calculate sector average
    const sectorData = await calculateSectorAverage(sectorCodes, sectorFolder, indexData);
    if (!sectorData) {
      throw new Error(`Tidak ada data stock yang valid untuk sector ${sector}. Checked folder: ${sectorFolder}`);
    }
    
    console.log(`Calculated sector average from ${sectorCodes.length} stocks`);
    
    if (sectorData.close.length < 10) {
      throw new Error(`Data sector yang ter-align terlalu sedikit (minimum 10 data points)`);
    }
    
    // Calculate RS Ratio and RS Momentum using proper functions
    const rsRatio = sectorData.close.map((price, i) => {
      const indexPrice = indexData.close[i];
      if (!indexPrice || indexPrice === 0) return NaN;
      return (price / indexPrice) * 100;
    });
    
    // Calculate RS Momentum using 1-day period for all data (same as original)
    const rsMomentum: NumericArray = [];
    for (let i = 0; i < rsRatio.length; i++) {
      const currentRatio = rsRatio[i];
      const pastRatio = rsRatio[i - 1];
      
      if (i >= 1 && currentRatio !== undefined && pastRatio !== undefined && !isNaN(currentRatio) && !isNaN(pastRatio)) {
        // Use 1-day period for all data (same as original)
        rsMomentum.push((currentRatio / pastRatio) * 100);
      } else {
        rsMomentum.push(NaN);
      }
    }
    
    // Create valid data points (remove NaN values)
    const validPoints: RRGPoint[] = [];
    for (let i = 0; i < sectorData.dates.length; i++) {
      const currentRatio = rsRatio[i];
      const currentMomentum = rsMomentum[i];
      const currentDate = sectorData.dates[i];
      
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
      sector: sector.toUpperCase(),
      benchmark: benchmarkName,
      lookback_points: lookbackPoints,
      total_points: validPoints.length,
      latest_point: latestPoint || null,
      quadrant,
      trajectory,
      stocks_analyzed: sectorCodes.length
    };
    
  } catch (error) {
    throw new Error(`Error processing sector ${sector}: ${error}`);
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
//   npx ts-node rrg_sector_api.ts --sector Financials
//   npx ts-node rrg_sector_api.ts -s Technology --stock-dir ./stock --index-dir ./index
//   npx ts-node rrg_sector_api.ts --sector Energy --lookback 10
//   npx ts-node rrg_sector_api.ts --sector Financials --index IDX30
//   npx ts-node rrg_sector_api.ts --list-indexes
// Output: CSV file dengan nama "o2-rrg-{SECTOR}.csv" di folder rrg_output
// Format: 3 kolom - date, rs_ratio, rs_momentum

function printUsageAndExit(message?: string): never {
  if (message) {
    console.error(message);
  }
  console.error(
    "\nUsage:\n  ts-node rrg_sector_api.ts --sector <NAME> [--stock-dir <DIR>] [--index-dir <DIR>] [--index <INDEX_NAME>] [--lookback <POINTS>]\n  ts-node rrg_sector_api.ts --list-indexes [--index-dir <DIR>]\n\nKeterangan:\n  - --sector: Nama sector yang akan dianalisis\n  - --stock-dir: Direktori untuk file CSV saham (default: ./stock)\n  - --index-dir: Direktori untuk file CSV index/benchmark (default: ./index)\n  - --index: Nama index yang akan digunakan sebagai benchmark (default: COMPOSITE)\n  - --lookback: Jumlah titik untuk trajectory (default: 10)\n  - --list-indexes: Tampilkan daftar index yang tersedia\n\nSector yang tersedia:\n  - Financials, Technology, Energy, Healthcare, Industrials\n  - Infrastructures, Properties, Transportation\n  - Consumer Cyclicals, Consumer Non-Cyclicals, Basic Materials\n"
  );
  process.exit(1);
}

function parseArgs(argv: string[]): { sector?: string; stockDir?: string; indexDir?: string; index?: string; lookback?: number; listIndexes?: boolean } {
  const out: { sector?: string; stockDir?: string; indexDir?: string; index?: string; lookback?: number; listIndexes?: boolean } = {};
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--sector" || token === "-s") {
      const next = argv[i + 1];
      if (!next || next.startsWith("-")) printUsageAndExit("Missing value for --sector");
      out.sector = next;
      i++;
    } else if (token === "--stock-dir" || token === "-std") {
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
  const { sector, stockDir, indexDir, index, lookback, listIndexes } = parseArgs(process.argv);
  
  // List available indexes if requested
  if (listIndexes) {
    try {
      const indexBaseDir = path.resolve(indexDir || "./index");
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
  
  if (!sector) {
    printUsageAndExit("--sector is required");
  }

  const stockBaseDir = path.resolve(stockDir || "./stock");
  const indexBaseDir = path.resolve(indexDir || "./index");
  const lookbackPoints = lookback || 10;

  try {
    const result = await generateRRGSectorData(sector, stockBaseDir, indexBaseDir, lookbackPoints, index);
    
    if (!result) {
      throw new Error("Failed to generate RRG sector data");
    }
    
    const csvOutput = resultToCsv(result);
    
    // Generate output filename
    const outputFilename = `o2-rrg-${sector.toUpperCase()}.csv`;
    const outputPath = `rrg_output/sector/${outputFilename}`;
    
    // Write CSV to Azure
    await uploadText(outputPath, csvOutput);
    
    console.log(`✅ RRG sector data generated for ${sector}`);
    console.log(`📊 Total points: ${result.total_points}`);
    console.log(`📈 Latest point: RS-Ratio=${result.latest_point?.rs_ratio}, RS-Momentum=${result.latest_point?.rs_momentum}`);
    console.log(`🎯 Quadrant: ${result.quadrant}`);
    console.log(`📈 Stocks analyzed: ${result.stocks_analyzed}`);
    console.log(`📁 Output saved to: ${outputPath}`);
    
  } catch (error) {
    console.error(`❌ Error: ${error}`);
    process.exit(1);
  }
}

// Export functions for backend use
export async function calculateRrgSector(sectorName: string, indexName: string = 'COMPOSITE', config?: { stockDir: string; indexDir: string; outputDir: string }): Promise<string> {
  const stockDir = config?.stockDir || 'stock';
  const indexDir = config?.indexDir || 'index';
  const outputDir = config?.outputDir || 'rrg_output';
  const lookbackPoints = 1000; // Calculate all available data (up to 1000 points)
  
  try {
    console.log(`🏢 Calculating RRG for sector: ${sectorName} vs ${indexName}`);
    
    const result = await generateRRGSectorData(sectorName, stockDir, indexDir, lookbackPoints, indexName);
    
    if (!result) {
      throw new Error(`Failed to generate RRG data for sector ${sectorName}`);
    }
    
    // Convert result to CSV
    const csvOutput = resultToCsv(result);
    
    // Generate output filename with subfolder
    const sectorNameClean = sectorName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const outputFilename = `o2-rrg-${sectorNameClean}.csv`;
    const outputPath = `${outputDir}/sector/${outputFilename}`;
    
    // Upload to Azure
    await uploadText(outputPath, csvOutput, 'text/csv');
    
    console.log(`✅ Sector RRG completed: ${outputPath}`);
    console.log(`📊 Total points: ${result.total_points}`);
    console.log(`📈 Latest point: RS-Ratio=${result.latest_point?.rs_ratio?.toFixed(2)}, RS-Momentum=${result.latest_point?.rs_momentum?.toFixed(2)}`);
    console.log(`🎯 Quadrant: ${result.quadrant}`);
    
    return csvOutput;
  } catch (error) {
    console.error(`❌ Error calculating RRG for sector ${sectorName}:`, error);
    throw error;
  }
}

export async function listAvailableSectors(): Promise<string[]> {
  const stockDir = 'stock';
  
  try {
    // List all files in stock directory
    const files = await listPaths({ prefix: stockDir });
    const sectors = new Set<string>();
    
    // Sector name normalization map to fix typos in Azure folder names
    const sectorNormalizationMap: { [key: string]: string } = {
      'Properties & Reaal Estate': 'Properties & Real Estate',
      'Properties & Real Estate': 'Properties & Real Estate',
      'Transportation && Logistic': 'Transportation & Logistic',
      'Transportation & Logistic': 'Transportation & Logistic',
      'Consumer Cyclicaals': 'Consumer Cyclicals',
      'Consumer Cyclicals': 'Consumer Cyclicals',
      'Consumer Non-Cycclicals': 'Consumer Non-Cyclicals',
      'Consumer Non-Cyclicals': 'Consumer Non-Cyclicals'
    };
    
    for (const file of files) {
      const parts = file.split('/');
      if (parts.length >= 2) {
        let sector = parts[1];
        if (sector && sector !== '' && !sector.includes('.')) { // Exclude files, only folders
          // Normalize sector name to fix typos
          sector = sectorNormalizationMap[sector] || sector;
          sectors.add(sector);
        }
      }
    }
    
    return Array.from(sectors).sort();
  } catch (err) {
    console.error('Error listing sectors:', err);
    return [];
  }
}

export async function listAvailableIndexesForRrgSector(): Promise<string[]> {
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
