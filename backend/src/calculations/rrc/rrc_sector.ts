// rrc_sector.ts
// ------------------------------------------------------------
// Transformasi: natural log + min–max normalisasi (0–1)
// Input: nama sector (parameter). Proses semua CSV dalam folder sector tersebut.
// Output: CSV files dengan nama "o2-rrc-{emitter}.csv" di folder rrc_output
// ------------------------------------------------------------

import * as path from "path";
import { downloadText, uploadText, listPaths, exists } from '../../utils/azureBlob';
import { BATCH_SIZE_PHASE_2, MAX_CONCURRENT_REQUESTS_PHASE_2 } from '../../services/dataUpdateService';

type NumericArray = number[];

/**
 * Natural log dengan penjagaan agar nilai tidak <= 0.
 */
export function safeLog(values: NumericArray, epsilon: number = 1e-12): NumericArray {
  return values.map((v) => Math.log(Math.max(v, epsilon)));
}

/**
 * Min–max scaling ke [0, 1]. Jika max <= min, kembalikan nol semua.
 */
export function minmaxScale(values: NumericArray): NumericArray {
  if (values.length === 0) return [];
  let vMin = Number.POSITIVE_INFINITY;
  let vMax = Number.NEGATIVE_INFINITY;
  for (const v of values) {
    if (v < vMin) vMin = v;
    if (v > vMax) vMax = v;
  }
  if (vMax <= vMin) {
    return new Array(values.length).fill(0);
  }
  const range = vMax - vMin;
  return values.map((v) => (v - vMin) / range);
}

export interface TransformResult {
  emitter: string;
  sector: string;
  count: number;
  method: "log+minmax";
  domain: [number, number];
  scaled: NumericArray;
  logMin: number;
  logMax: number;
  dates: string[];
}

export interface SectorResult {
  sector: string;
  count: number;
  emitterCount: number;
  method: "log+minmax";
  domain: [number, number];
  scaled: NumericArray;
  dates: string[];
}

/**
 * Convert TransformResult to CSV format with only date and scaled_values columns
 */
export function resultToCsv(result: TransformResult): string {
  const header = "date,scaled_values";
  const rows = result.dates.map((date, index) => {
    const scaledValue = result.scaled[index]?.toFixed(6) || '0.000000';
    return `${date},${scaledValue}`;
  });
  return `${header}\n${rows.join('\n')}`;
}

/**
 * Convert SectorResult to CSV format with only date and scaled_values columns
 */
export function sectorResultToCsv(result: SectorResult): string {
  const header = "date,scaled_values";
  const rows = result.dates.map((date, index) => {
    const scaledValue = result.scaled[index]?.toFixed(6) || '0.000000';
    return `${date},${scaledValue}`;
  });
  return `${header}\n${rows.join('\n')}`;
}

/**
 * Lakukan log transform lalu min–max scaling, kembalikan object hasil transformasi.
 */
export function transformSeries(emitter: string, sector: string, values: NumericArray, dates: string[]): TransformResult {
  const logValues = safeLog(values);
  let logMin = Number.POSITIVE_INFINITY;
  let logMax = Number.NEGATIVE_INFINITY;
  for (const v of logValues) {
    if (v < logMin) logMin = v;
    if (v > logMax) logMax = v;
  }
  const scaled = minmaxScale(logValues);
  return {
    emitter,
    sector,
    count: values.length,
    method: "log+minmax",
    domain: [0, 1],
    scaled,
    logMin,
    logMax,
    dates
  };
}

/**
 * Gabungkan hasil transformasi dari semua emiten dalam sector menjadi satu hasil sector
 */
export function combineSectorResults(sector: string, results: TransformResult[]): SectorResult {
  if (results.length === 0) {
    throw new Error(`Tidak ada hasil untuk sector ${sector}`);
  }
  
  // Ambil dates dari hasil pertama (asumsi semua emiten punya dates yang sama)
  const dates = results[0]?.dates || [];
  const emitterCount = results.length;
  
  // Hitung rata-rata dari semua scaled values per tanggal
  const averagedScaled: NumericArray = [];
  
  for (let i = 0; i < dates.length; i++) {
    let sum = 0;
    let validCount = 0;
    
    for (const result of results) {
      if (i < result.scaled.length && Number.isFinite(result.scaled[i])) {
        sum += result.scaled[i] || 0;
        validCount++;
      }
    }
    
    if (validCount > 0) {
      averagedScaled.push(sum / validCount);
    } else {
      averagedScaled.push(0);
    }
  }
  
  return {
    sector,
    count: dates.length,
    emitterCount,
    method: "log+minmax",
    domain: [0, 1],
    scaled: averagedScaled,
    dates
  };
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

async function readCsvCloseValues(filePath: string, closeColumnName: string = "close"): Promise<{values: NumericArray, dates: string[]}> {
  const raw = await downloadText(filePath);
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    throw new Error(`CSV kosong: ${filePath}`);
  }
  // Temukan header (baris pertama yang memiliki lebih dari 1 kolom)
  let headerIdx = 0;
  let headerCols: string[] | null = null;
  for (let i = 0; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i] || '');
    if (cols.length > 1) {
      headerIdx = i;
      headerCols = cols as string[];
      break;
    }
  }
  if (!headerCols) {
    throw new Error(`Header CSV tidak valid: ${filePath}`);
  }
  const lower = headerCols.map((c) => c.replace(/^\uFEFF/, "").trim().toLowerCase());
  const targetName = closeColumnName.toLowerCase();
  const closeIdx = lower.indexOf(targetName);
  if (closeIdx < 0) {
    throw new Error(`Kolom '${closeColumnName}' tidak ditemukan di ${filePath}`);
  }
  
  // Find date column (usually first column)
  const dateIdx = 0; // Assuming date is always the first column
  
  const values: number[] = [];
  const dates: string[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i] || '');
    if (cols.length <= closeIdx) continue;
    const rawVal = cols[closeIdx]?.trim();
    const rawDate = cols[dateIdx]?.trim();
    if (!rawVal || !rawDate) continue;
    // Hapus pemisah ribuan koma jika ada, lalu parse float
    const normalized = rawVal.replace(/,/g, "");
    const num = Number.parseFloat(normalized);
    if (Number.isFinite(num)) {
      values.push(num);
      dates.push(rawDate);
    }
  }
  return {values, dates};
}


async function findCsvFilesInSector(stockDir: string, sectorName: string): Promise<string[]> {
  const sectorPrefix = `${stockDir}/${sectorName}/`;
  
  try {
    const files = await listPaths({ prefix: sectorPrefix });
    const csvFiles = files.filter(f => f.toLowerCase().endsWith('.csv'));
    return csvFiles;
  } catch (err) {
    throw new Error(`Tidak bisa baca folder sector ${sectorName}: ${err}`);
  }
}

export async function listAvailableSectors(stockDir: string): Promise<string[]> {
  try {
    const files = await listPaths({ prefix: stockDir });
    const sectors = new Set<string>();
    
    for (const file of files) {
      const parts = file.split('/');
      if (parts.length >= 2) {
        const sector = parts[1];
        if (sector && sector !== '' && !sector.includes('.')) { // Exclude files, only folders
          sectors.add(sector);
        }
      }
    }
    
    return Array.from(sectors).sort();
  } catch (err) {
    throw new Error(`Tidak bisa baca folder stock: ${err}`);
  }
}

export async function listAvailableIndexes(indexDir: string): Promise<string[]> {
  try {
    const files = await listPaths({ prefix: indexDir });
    const indexes = files
      .filter(f => f.toLowerCase().endsWith('.csv'))
      .map(f => f.split('/').pop()?.replace('.csv', '') || '')
      .filter(name => name !== '');
    
    return indexes.sort();
  } catch (err) {
    throw new Error(`Tidak bisa baca folder index: ${err}`);
  }
}

export async function listAvailableStocks(stockDir: string): Promise<string[]> {
  try {
    const files = await listPaths({ prefix: stockDir });
    const stocks = new Set<string>();
    
    for (const file of files) {
      // Extract stock code from path like: stock/Financials/BBCA.csv
      if (file.toLowerCase().endsWith('.csv')) {
        const parts = file.split('/');
        const fileName = parts[parts.length - 1];
        if (fileName) {
          const stockCode = fileName.replace('.csv', '');
          if (stockCode && stockCode !== '') {
            stocks.add(stockCode);
          }
        }
      }
    }
    
    return Array.from(stocks).sort();
  } catch (err) {
    throw new Error(`Tidak bisa baca folder stock: ${err}`);
  }
}

// Wrapper functions for RRC calculations
export async function calculateRrcSector(sectorName: string, config: { stockDir: string; indexDir: string; outputDir: string }): Promise<string> {
  const csvFiles = await findCsvFilesInSector(config.stockDir, sectorName);
  
  if (csvFiles.length === 0) {
    throw new Error(`Tidak ada file CSV ditemukan di sector '${sectorName}'`);
  }
  
  console.log(`📊 Found ${csvFiles.length} CSV files in sector '${sectorName}'`);
  
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
  
  const sectorResults: TransformResult[] = [];
  let processed = 0;
  let errors = 0;
  
  // Process files in batches (Phase 2: 500 files at a time)
  const BATCH_SIZE = BATCH_SIZE_PHASE_2;
  const MAX_CONCURRENT = MAX_CONCURRENT_REQUESTS_PHASE_2;
  console.log(`📦 Processing ${csvFiles.length} CSV files in batches of ${BATCH_SIZE}...`);
  
  for (let i = 0; i < csvFiles.length; i += BATCH_SIZE) {
    const batch = csvFiles.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
    console.log(`📦 Processing batch ${batchNumber}/${Math.ceil(csvFiles.length / BATCH_SIZE)} (${batch.length} files)`);
    
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
    
    // Process batch in parallel with concurrency limit
    const batchPromises = batch.map(async (csvFile) => {
    try {
      const emitter = extractEmitterName(csvFile);
      console.log(`📈 Processing: ${csvFile.split('/').pop()} -> ${emitter}`);
      
      const {values, dates} = await readCsvCloseValues(csvFile, "close");
      if (values.length === 0) {
        console.warn(`⚠️ No valid 'close' values in ${csvFile}`);
          return null;
      }
      
      const result = transformSeries(emitter, sectorName, values, dates);
        return result;
      } catch (err) {
        console.error(`❌ Error processing ${csvFile}:`, err);
        return null;
      }
    });
    
    const batchResults = await limitConcurrency(batchPromises, MAX_CONCURRENT);
    
    // Collect valid results
    batchResults.forEach((result) => {
      if (result) {
      sectorResults.push(result);
      processed++;
      } else {
        errors++;
      }
    });
    
    // Memory cleanup after batch
    if (global.gc) {
      global.gc();
      const memAfter = process.memoryUsage();
      const heapUsedMB = memAfter.heapUsed / 1024 / 1024;
      console.log(`📊 Batch ${batchNumber} complete - Memory: ${heapUsedMB.toFixed(2)}MB`);
    }
  }
  
  // Combine all emitter results into one sector result
  if (sectorResults.length === 0) {
    throw new Error(`Tidak ada hasil valid untuk sector ${sectorName}`);
  }
  
  console.log(`🔄 Combining ${sectorResults.length} emitters into sector result...`);
  const sectorResult = combineSectorResults(sectorName, sectorResults);
  const csvOutput = sectorResultToCsv(sectorResult);
  
  // Generate output filename with subfolder
  const sectorNameClean = sectorName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const outputFilename = `o2-rrc-${sectorNameClean}.csv`;
  const outputPath = `${config.outputDir}/sector/${outputFilename}`;
  
  // Validate CSV content before upload
  if (!csvOutput || csvOutput.trim().length === 0) {
    throw new Error(`Generated CSV is empty for sector: ${sectorName}`);
  }
  
  const lines = csvOutput.trim().split('\n');
  if (lines.length < 2) { // At least header + 1 data row
    throw new Error(`Generated CSV has insufficient data for sector: ${sectorName} (only ${lines.length} lines)`);
  }
  
  // Upload to Azure
  await uploadText(outputPath, csvOutput, 'text/csv');
  
  console.log(`✅ Sector RRC completed: ${outputPath}`);
  console.log(`📊 Processed: ${processed}, Errors: ${errors}`);
  console.log(`📈 Emitters: ${sectorResult.emitterCount}, Data points: ${sectorResult.count}`);
  
  return csvOutput;
}

export async function calculateRrcStock(stockCode: string, config: { stockDir: string; indexDir: string; outputDir: string }): Promise<string> {
  // Find stock file in any sector folder
  const allFiles = await listPaths({ prefix: config.stockDir });
  const stockFile = allFiles.find(f => f.includes(`/${stockCode}.csv`));
  
  if (!stockFile) {
    throw new Error(`Stock file not found: ${stockCode}.csv in any sector folder`);
  }
  
  console.log(`📈 Found stock file: ${stockFile}`);
  
  const {values, dates} = await readCsvCloseValues(stockFile, "close");
  if (values.length === 0) {
    throw new Error(`No valid 'close' values in ${stockFile}`);
  }
  
  const result = transformSeries(stockCode, "STOCK", values, dates);
  const csvOutput = resultToCsv(result);
  
  // Generate output filename with subfolder
  const outputFilename = `o1-rrc-${stockCode.toUpperCase()}.csv`;
  const outputPath = `${config.outputDir}/stock/${outputFilename}`;
  
  // Upload to Azure
  await uploadText(outputPath, csvOutput, 'text/csv');
  
  console.log(`✅ Stock RRC completed: ${outputPath}`);
  console.log(`📊 Data points: ${result.count}`);
  
  return csvOutput;
}

export async function calculateRrcIndex(indexName: string, config: { stockDir: string; indexDir: string; outputDir: string }): Promise<string> {
  const indexFile = `${config.indexDir}/${indexName}.csv`;
  
  // Check if index file exists using Azure
  const indexExists = await exists(indexFile);
  if (!indexExists) {
    throw new Error(`Index file not found: ${indexFile}`);
  }
  
  const {values, dates} = await readIndexCsvCloseValues(indexFile);
  if (values.length === 0) {
    throw new Error(`No valid 'close' values in ${indexFile}`);
  }
  
  const result = transformSeries(indexName.toUpperCase(), "INDEX", values, dates);
  const csvOutput = resultToCsv(result);
  
  // Generate output filename with subfolder
  const indexNameClean = indexName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const outputFilename = `o1-rrc-${indexNameClean}.csv`;
  const outputPath = `${config.outputDir}/index/${outputFilename}`;
  
  // Upload to Azure
  await uploadText(outputPath, csvOutput, 'text/csv');
  
  console.log(`✅ Index RRC completed: ${outputPath}`);
  console.log(`📊 Data points: ${result.count}`);
  
  return csvOutput;
}


async function readIndexCsvCloseValues(filePath: string): Promise<{values: NumericArray, dates: string[]}> {
  const raw = await downloadText(filePath);
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    throw new Error(`CSV kosong: ${filePath}`);
  }
  
  // Parse header
  const headerCols = parseCsvLine(lines[0] || '');
  const lower = headerCols.map((c) => c.replace(/^\uFEFF/, "").trim().toLowerCase());
  
  // Find Close column
  const closeIdx = lower.indexOf('close');
  if (closeIdx < 0) {
    throw new Error(`Kolom 'close' tidak ditemukan di ${filePath}`);
  }
  
  // Find Date column (usually first column)
  const dateIdx = 0;
  
  const values: number[] = [];
  const dates: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i] || '');
    if (cols.length <= closeIdx) continue;
    const rawVal = cols[closeIdx]?.trim();
    const rawDate = cols[dateIdx]?.trim();
    if (!rawVal || !rawDate) continue;
    
    // Parse float value
    const num = Number.parseFloat(rawVal);
    if (Number.isFinite(num)) {
      values.push(num);
      dates.push(rawDate);
    }
  }
  return {values, dates};
}

function extractEmitterName(filePath: string): string {
  const fileName = path.basename(filePath, '.csv');
  // Extract emitter name from patterns like "IDX_DLY_CPIN, 1D" or similar
  const match = fileName.match(/IDX_DLY_([^,\s]+)/i);
  if (match && match[1]) {
    return match[1].toUpperCase();
  }
  // Fallback: use filename without extension
  return fileName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

// -------------------------- CLI --------------------------
// Usage examples:
//   npx ts-node rrc_sector.ts --sector "Basic Materials"
//   npx ts-node rrc_sector.ts -s "Technology" --stock-dir ./stock --output-dir ./rrc_output
//   npx ts-node rrc_sector.ts --sector "Basic Materials" --index "COMPOSITE"
//   npx ts-node rrc_sector.ts --list-sectors
//   npx ts-node rrc_sector.ts --list-indexes
// Processes all CSV files in the specified sector folder
// Output: CSV files dengan nama "o2-rrc-{EMITTER}.csv" di folder rrc_output
// If --index is specified, also processes the selected index file

function printUsageAndExit(message?: string): never {
  if (message) {
    console.error(message);
  }
  console.error(
    "\nUsage:\n  ts-node rrc_sector.ts --sector <SECTOR_NAME> [--stock-dir <DIR>] [--output-dir <DIR>] [--index <INDEX_NAME>] [--index-dir <DIR>]\n  ts-node rrc_sector.ts --list-sectors [--stock-dir <DIR>]\n  ts-node rrc_sector.ts --list-indexes [--index-dir <DIR>]\n\nKeterangan:\n  - --sector: nama folder sector yang akan diproses\n  - --stock-dir: folder yang berisi subfolder sector dengan CSV files (default: ./stock)\n  - --output-dir: folder output untuk file hasil (default: ./rrc_output)\n  - --index: nama index yang akan diproses dari folder index (optional)\n  - --index-dir: folder yang berisi file index CSV (default: ./index)\n  - --list-sectors: tampilkan daftar sector yang tersedia\n  - --list-indexes: tampilkan daftar index yang tersedia\n  - Script akan memproses semua CSV files di folder sector yang dipilih\n"
  );
  process.exit(1);
}

function parseArgs(argv: string[]): { sector?: string; stockDir?: string; outputDir?: string; index?: string; indexDir?: string; listSectors?: boolean; listIndexes?: boolean } {
  const out: { sector?: string; stockDir?: string; outputDir?: string; index?: string; indexDir?: string; listSectors?: boolean; listIndexes?: boolean } = {};
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--sector" || token === "-s") {
      const next = argv[i + 1];
      if (!next || next.startsWith("-")) printUsageAndExit("Missing value for --sector");
      out.sector = next;
      i++;
    } else if (token === "--stock-dir") {
      const next = argv[i + 1];
      if (!next || next.startsWith("-")) printUsageAndExit("Missing value for --stock-dir");
      out.stockDir = next;
      i++;
    } else if (token === "--output-dir" || token === "-o") {
      const next = argv[i + 1];
      if (!next || next.startsWith("-")) printUsageAndExit("Missing value for --output-dir");
      out.outputDir = next;
      i++;
    } else if (token === "--index") {
      const next = argv[i + 1];
      if (!next || next.startsWith("-")) printUsageAndExit("Missing value for --index");
      out.index = next;
      i++;
    } else if (token === "--index-dir") {
      const next = argv[i + 1];
      if (!next || next.startsWith("-")) printUsageAndExit("Missing value for --index-dir");
      out.indexDir = next;
      i++;
    } else if (token === "--list-sectors" || token === "-l") {
      out.listSectors = true;
    } else if (token === "--list-indexes") {
      out.listIndexes = true;
    }
  }
  return out;
}

async function main(): Promise<void> {
  const { sector, stockDir = "./stock", outputDir = "./rrc_output", index, indexDir = "./index", listSectors, listIndexes } = parseArgs(process.argv);
  
  // List available sectors if requested
  if (listSectors) {
    try {
      const sectors = await listAvailableSectors(stockDir);
      console.log(`\nSector yang tersedia di ${stockDir}:`);
      sectors.forEach((s, i) => {
        console.log(`  ${i + 1}. ${s}`);
      });
      console.log(`\nTotal: ${sectors.length} sector`);
    } catch (err) {
      console.error(`Error: ${err}`);
      process.exit(1);
    }
    return;
  }
  
  // List available indexes if requested
  if (listIndexes) {
    try {
      const indexes = await listAvailableIndexes(indexDir);
      console.log(`\nIndex yang tersedia di ${indexDir}:`);
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
    printUsageAndExit("--sector is required (or use --list-sectors to see available sectors)");
  }
  
  // Output directory is managed by Azure, no need to create locally
  
  // Find all CSV files in the specified sector
  const csvFiles = await findCsvFilesInSector(stockDir, sector);
  if (csvFiles.length === 0) {
    console.log(`Tidak ada file CSV ditemukan di sector '${sector}'`);
    return;
  }
  
  console.log(`Memproses sector: ${sector}`);
  console.log(`Ditemukan ${csvFiles.length} file CSV di sector '${sector}'`);
  
  const sectorResults: TransformResult[] = [];
  let processed = 0;
  let errors = 0;
  
  // Process all CSV files in the sector
  for (const csvFile of csvFiles) {
    try {
      const emitter = extractEmitterName(csvFile);
      console.log(`Memproses: ${path.basename(csvFile)} -> ${emitter}`);
      
      const {values, dates} = await readCsvCloseValues(csvFile, "close");
      if (values.length === 0) {
        console.warn(`Tidak ada nilai 'close' yang valid pada ${csvFile}`);
        errors++;
        continue;
      }
      
      const result = transformSeries(emitter, sector, values, dates);
      sectorResults.push(result);
      processed++;
      
    } catch (err) {
      console.error(`Error memproses ${csvFile}: ${err}`);
      errors++;
    }
  }
  
  // Combine all emitter results into one sector result
  if (sectorResults.length > 0) {
    console.log(`\nMenggabungkan ${sectorResults.length} emiten menjadi 1 hasil sector...`);
    const sectorResult = combineSectorResults(sector, sectorResults);
    const csvOutput = sectorResultToCsv(sectorResult);
    
    // Generate output filename with sector name
    const sectorName = sector.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const outputFilename = `o2-rrc-${sectorName}.csv`;
    const outputPath = path.join(outputDir, outputFilename);
    
    // Upload CSV to Azure
    await uploadText(outputPath, csvOutput, 'text/csv');
    console.log(`  -> Output: ${outputPath}`);
    console.log(`  -> Jumlah emiten: ${sectorResult.emitterCount}`);
    console.log(`  -> Jumlah data points: ${sectorResult.count}`);
  }
  
  // Process index if specified
  if (index) {
    try {
      console.log(`\nMemproses index: ${index}`);
      const indexFilePath = path.join(indexDir, `${index}.csv`);
      
      if (!(await exists(indexFilePath))) {
        console.warn(`File index '${index}.csv' tidak ditemukan di ${indexDir}`);
      } else {
        const {values, dates} = await readIndexCsvCloseValues(indexFilePath);
        if (values.length === 0) {
          console.warn(`Tidak ada nilai 'close' yang valid pada ${indexFilePath}`);
        } else {
          const indexResult = transformSeries(index.toUpperCase(), "INDEX", values, dates);
          const csvOutput = resultToCsv(indexResult);
          
          // Generate output filename for index
          const indexName = index.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
          const outputFilename = `o1-rrc-${indexName}.csv`;
          const outputPath = path.join(outputDir, outputFilename);
          
          // Upload CSV to Azure
          await uploadText(outputPath, csvOutput, 'text/csv');
          console.log(`  -> Index Output: ${outputPath}`);
          console.log(`  -> Jumlah data points: ${indexResult.count}`);
        }
      }
    } catch (err) {
      console.error(`Error memproses index ${index}: ${err}`);
    }
  }
  
  console.log(`\nSelesai! Sector: ${sector}, Diproses: ${processed}, Error: ${errors}`);
}

// Execute if run directly
if (require.main === module) {
  main().catch((err) => {
    console.error(err?.stack || String(err));
    process.exit(1);
  });
}