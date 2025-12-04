// rrc_stock.ts
// ------------------------------------------------------------
// Transformasi: natural log + min–max normalisasi (0–1)
// Input: CSV files dari folder stock (berisi subfolder sector)
// Output: CSV files dengan nama "o1-rrc-{emitter}.csv" di folder rrc_output
// ------------------------------------------------------------

import * as fs from "fs";
import * as path from "path";
import { downloadText, uploadText, listPaths } from '../../utils/azureBlob';
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
  count: number;
  method: "log+minmax";
  domain: [number, number];
  scaled: NumericArray;
  logMin: number;
  logMax: number;
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
 * Lakukan log transform lalu min–max scaling, kembalikan object hasil transformasi.
 */
export function transformSeries(emitter: string, values: NumericArray, dates: string[]): TransformResult {
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
    count: values.length,
    method: "log+minmax",
    domain: [0, 1],
    scaled,
    logMin,
    logMax,
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
  // Use stock cache if file is from stock/ folder
  const { stockCache } = await import('../../cache/stockCacheService');
  const raw = filePath.startsWith('stock/') 
    ? await stockCache.getRawContent(filePath) || ''
    : await downloadText(filePath);
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

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.promises.access(p, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function findAllCsvFiles(stockDir: string): Promise<string[]> {
  try {
    const files = await listPaths({ prefix: stockDir });
    const csvFiles = files.filter(f => f.toLowerCase().endsWith('.csv'));
    return csvFiles;
  } catch (err) {
    throw new Error(`Tidak bisa baca folder stock: ${err}`);
  }
}

async function listAvailableIndexes(indexDir: string): Promise<string[]> {
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
//   npx ts-node rrc_stock.ts
//   npx ts-node rrc_stock.ts --stock-dir ./stock --output-dir ./rrc_output
//   npx ts-node rrc_stock.ts --index "COMPOSITE"
//   npx ts-node rrc_stock.ts --list-indexes
// Processes all CSV files in stock folder (including sector subfolders)
// Output: CSV files dengan nama "o1-rrc-{EMITTER}.csv" di folder rrc_output
// If --index is specified, also processes the selected index file

function printUsageAndExit(message?: string): never {
  if (message) {
    console.error(message);
  }
  console.error(
    "\nUsage:\n  ts-node rrc_stock.ts [--stock-dir <DIR>] [--output-dir <DIR>] [--index <INDEX_NAME>] [--index-dir <DIR>]\n  ts-node rrc_stock.ts --list-indexes [--index-dir <DIR>]\n\nKeterangan:\n  - --stock-dir: folder yang berisi subfolder sector dengan CSV files (default: ./stock)\n  - --output-dir: folder output untuk file hasil (default: ./rrc_output)\n  - --index: nama index yang akan diproses dari folder index (optional)\n  - --index-dir: folder yang berisi file index CSV (default: ./index)\n  - --list-indexes: tampilkan daftar index yang tersedia\n  - Script akan memproses semua CSV files di folder stock dan subfoldernya\n"
  );
  process.exit(1);
}

function parseArgs(argv: string[]): { stockDir?: string; outputDir?: string; index?: string; indexDir?: string; listIndexes?: boolean } {
  const out: { stockDir?: string; outputDir?: string; index?: string; indexDir?: string; listIndexes?: boolean } = {};
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--stock-dir" || token === "-s") {
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
    } else if (token === "--list-indexes") {
      out.listIndexes = true;
    }
  }
  return out;
}

async function main(): Promise<void> {
  const { stockDir = "./stock", outputDir = "./rrc_output", index, indexDir = "./index", listIndexes } = parseArgs(process.argv);
  
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
  
  // Ensure output directory exists
  try {
    await fs.promises.mkdir(outputDir, { recursive: true });
  } catch (err) {
    throw new Error(`Tidak bisa membuat folder output ${outputDir}: ${err}`);
  }
  
  // Find all CSV files in stock directory and subdirectories
  const csvFiles = await findAllCsvFiles(stockDir);
  if (csvFiles.length === 0) {
    console.log(`Tidak ada file CSV ditemukan di ${stockDir}`);
    return;
  }
  
  console.log(`Ditemukan ${csvFiles.length} file CSV di ${stockDir}`);
  
  // CRITICAL: Don't add active files before processing - add only when file needs processing
  const activeFiles: string[] = [];
  
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
        // CRITICAL: Add active file ONLY when processing starts
        if (csvFile.startsWith('stock/') && !activeFiles.includes(csvFile)) {
          const { stockCache } = await import('../../cache/stockCacheService');
          stockCache.addActiveProcessingFile(csvFile);
          activeFiles.push(csvFile);
        }
        
        const emitter = extractEmitterName(csvFile);
        console.log(`📈 Processing: ${path.basename(csvFile)} -> ${emitter}`);
        
        const {values, dates} = await readCsvCloseValues(csvFile, "close");
        if (values.length === 0) {
          console.warn(`⚠️ No valid 'close' values in ${csvFile}`);
          return { success: false, error: 'No valid values' };
        }
        
        const result = transformSeries(emitter, values, dates);
        const csvOutput = resultToCsv(result);
        
        // Generate output filename
        const outputFilename = `o1-rrc-${emitter}.csv`;
        const outputPath = path.join(outputDir, outputFilename);
        
        // Upload CSV to Azure
        await uploadText(outputPath, csvOutput, 'text/csv');
        console.log(`  ✅ Output: ${outputPath}`);
        return { success: true };
      } catch (err) {
        console.error(`❌ Error processing ${csvFile}: ${err}`);
        return { success: false, error: err };
      }
    });
    
    const batchResults = await limitConcurrency(batchPromises, MAX_CONCURRENT);
    
    // Count results
    batchResults.forEach((result) => {
      if (result && result.success) {
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
  
  console.log(`\nSelesai! Diproses: ${processed}, Error: ${errors}`);
  
  // Cleanup: Remove active processing files setelah selesai
  if (activeFiles.length > 0) {
    const { stockCache } = await import('../../cache/stockCacheService');
    for (const file of activeFiles) {
      stockCache.removeActiveProcessingFile(file);
    }
    console.log(`🧹 Cleaned up ${activeFiles.length} active processing stock files from cache`);
  }
  
  // Process index if specified
  if (index) {
    try {
      console.log(`\nMemproses index: ${index}`);
      const indexFilePath = path.join(indexDir, `${index}.csv`);
      
      if (!(await fileExists(indexFilePath))) {
        console.warn(`File index '${index}.csv' tidak ditemukan di ${indexDir}`);
      } else {
        const {values, dates} = await readIndexCsvCloseValues(indexFilePath);
        if (values.length === 0) {
          console.warn(`Tidak ada nilai 'close' yang valid pada ${indexFilePath}`);
        } else {
          const indexResult = transformSeries(index.toUpperCase(), values, dates);
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
}

// Execute if run directly
if (require.main === module) {
  main().catch((err) => {
    console.error(err?.stack || String(err));
    process.exit(1);
  });
}



