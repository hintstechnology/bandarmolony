// rrg_scanner_sector.ts
// ------------------------------------------------------------
// Relative Rotation Graph (RRG) Scanner for sectors
// Membaca data RRG dari file output sector dan membuat scanner tabel
// Output: CSV file dengan nama "o4-rrg.csv" di folder rrg_output/scanner
// ------------------------------------------------------------

import { downloadText, uploadText, listPaths, exists } from '../../utils/azureBlob';
import { BATCH_SIZE_PHASE_2, MAX_CONCURRENT_REQUESTS_PHASE_2 } from '../../services/dataUpdateService';

interface SectorScannerResult {
  sector: string;
  rs_ratio: number;
  rs_momentum: number;
  performance: number;
  trend: string;
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
 * Read sector RRG data from o2-rrg-{sector}.csv files
 */
async function readSectorRRGData(sectorFile: string): Promise<{rs_ratio: number, rs_momentum: number, dates: string[]} | null> {
  const rrgPath = `rrg_output/sector/${sectorFile}`;
  
  try {
    if (!(await exists(rrgPath))) return null;
    
    const raw = await downloadText(rrgPath);
    const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
    
    if (lines.length < 2) return null;
    
    // Get all data points for trend calculation
    const header = parseCsvLine(lines[0] || '');
    const rsRatioIdx = header.indexOf("rs_ratio");
    const rsMomentumIdx = header.indexOf("rs_momentum");
    const dateIdx = header.indexOf("date");
    
    if (rsRatioIdx < 0 || rsMomentumIdx < 0 || dateIdx < 0) return null;
    
    const dates: string[] = [];
    const rsRatios: number[] = [];
    const rsMomentums: number[] = [];
    
    // Read all data points
    for (let i = 1; i < lines.length; i++) {
      const dataLine = parseCsvLine(lines[i] || '');
      if (dataLine.length <= Math.max(rsRatioIdx, rsMomentumIdx, dateIdx)) continue;
      
      const rsRatioVal = dataLine[rsRatioIdx];
      const rsMomentumVal = dataLine[rsMomentumIdx];
      const date = dataLine[dateIdx];
      
      if (!rsRatioVal || !rsMomentumVal) continue;
      
      const rsRatio = Number.parseFloat(rsRatioVal);
      const rsMomentum = Number.parseFloat(rsMomentumVal);
      
      if (Number.isFinite(rsRatio) && Number.isFinite(rsMomentum) && date) {
        dates.push(date);
        rsRatios.push(rsRatio);
        rsMomentums.push(rsMomentum);
      }
    }
    
    if (rsRatios.length === 0 || rsMomentums.length === 0) return null;
    
    // Return latest values
    const latestRatio = rsRatios[0];
    const latestMomentum = rsMomentums[0];
    
    if (latestRatio === undefined || latestMomentum === undefined) return null;
    
    return { 
      rs_ratio: latestRatio, // Latest is at index 0
      rs_momentum: latestMomentum,
      dates: dates
    };
    
  } catch (error) {
    return null;
  }
}

/**
 * Calculate sector performance based on RS-Ratio trend
 */
function calculateSectorPerformance(rrgData: {rs_ratio: number, rs_momentum: number, dates: string[]}): number {
  // Simple performance calculation based on RS-Ratio vs 100 (benchmark)
  // If RS-Ratio > 100, it's outperforming the benchmark
  const deviation = rrgData.rs_ratio - 100;
  
  // Convert to approximate percentage performance
  // This is a simplified calculation - you might want to use actual price data
  return deviation * 0.05; // Scaling factor to convert to reasonable percentage
}

/**
 * Determine trend based on RS-Ratio and RS-Momentum for sectors
 */
function determineSectorTrend(rsRatio: number, rsMomentum: number, _performance: number): string {
  // Strong: RS-Ratio > 110 AND RS-Momentum > 100 (stricter for sectors)
  if (rsRatio > 110 && rsMomentum > 100) {
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
  
  // Weak: RS-Ratio < 90 AND RS-Momentum < 100 (stricter for sectors)
  if (rsRatio < 90 && rsMomentum < 100) {
    return "WEAK";
  }
  
  return "NEUTRAL";
}


/**
 * Get available RRG sector files directly from rrg_output/sector/
 */
async function getAvailableRRGSectorFiles(): Promise<string[]> {
  try {
    const files = await listPaths({ prefix: 'rrg_output/sector/' });
    const sectorFiles = files
      .filter(f => f.startsWith('rrg_output/sector/o2-rrg-') && f.endsWith('.csv'))
      .map(f => f.replace('rrg_output/sector/', ''));
    
    console.log(`📊 Found ${sectorFiles.length} RRG sector files: ${sectorFiles.join(', ')}`);
    return sectorFiles;
  } catch (err) {
    console.error(`Error getting RRG sector files: ${err}`);
    return [];
  }
}

/**
 * Convert sector filename to display name (same as original file)
 */
function getSectorDisplayName(filename: string): string {
  // Extract sector name from o2-rrg-SECTOR_NAME.csv
  let sectorName = filename.replace("o2-rrg-", "").replace(".csv", "");
  
  // Convert to proper display format
  const sectorMap: { [key: string]: string } = {
    "BASICMATERIALS": "Basic Materials",
    "CONSUMERCYCLICALS": "Consumer Cyclicals", 
    "CONSUMERNONCYCLICALS": "Consumer Non-Cyclicals",
    "ENERGY": "Energy",
    "FINANCIALS": "Financials",
    "HEALTHCARE": "Healthcare",
    "INDUSTRIALS": "Industrials",
    "INFRASTRUCTURES": "Infrastructures",
    "PROPERTIESREALESTATE": "Properties & Real Estate",
    "TECHNOLOGY": "Technology",
    "TRANSPORTATIONLOGISTIC": "Transportation & Logistic"
  };
  
  return sectorMap[sectorName] || sectorName;
}

/**
 * Scan all available sectors and generate scanner data (following original approach)
 */
async function scanAllSectors(): Promise<SectorScannerResult[]> {
  const results: SectorScannerResult[] = [];
  
  // Get available RRG sector files directly from rrg_output/sector/
  const sectorFiles = await getAvailableRRGSectorFiles();
  
  if (sectorFiles.length === 0) {
    console.log(`❌ No RRG sector files found in rrg_output/sector/`);
    return results;
  }
  
  console.log(`📊 Processing ${sectorFiles.length} RRG sector files...`);
  
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
  
  // Process files in batches (Phase 2: 500 files at a time)
  const BATCH_SIZE = BATCH_SIZE_PHASE_2;
  const MAX_CONCURRENT = MAX_CONCURRENT_REQUESTS_PHASE_2;
  console.log(`📦 Processing sector files in batches of ${BATCH_SIZE}...`);
  
  for (let i = 0; i < sectorFiles.length; i += BATCH_SIZE) {
    const batch = sectorFiles.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
    console.log(`📦 Processing batch ${batchNumber}/${Math.ceil(sectorFiles.length / BATCH_SIZE)} (${batch.length} files)`);
    
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
    const batchPromises = batch.map(async (file) => {
      try {
        // Read sector RRG data
        const rrgData = await readSectorRRGData(file);
        if (!rrgData) {
          console.log(`⚠️ Could not read RRG data from ${file}`);
          return null;
        }
        
        // Get sector display name
        const sectorDisplayName = getSectorDisplayName(file);
        
        // Calculate performance
        const performance = calculateSectorPerformance(rrgData);
        
        // Determine trend
        const trend = determineSectorTrend(rrgData.rs_ratio, rrgData.rs_momentum, performance);
        
        const result = {
          sector: sectorDisplayName,
          rs_ratio: Number(rrgData.rs_ratio.toFixed(1)),
          rs_momentum: Number(rrgData.rs_momentum.toFixed(1)),
          performance: Number(performance.toFixed(1)),
          trend: trend
        };
        
        console.log(`✅ Processed sector: ${sectorDisplayName} (RS-Ratio: ${rrgData.rs_ratio.toFixed(1)}, RS-Momentum: ${rrgData.rs_momentum.toFixed(1)}, Trend: ${trend})`);
        return result;
      } catch (error) {
        console.log(`⚠️ Error processing ${file}: ${error}`);
        return null;
      }
    });
    
    const batchResults = await limitConcurrency(batchPromises, MAX_CONCURRENT);
    
    // Collect valid results
    batchResults.forEach((result) => {
      if (result) {
        results.push(result);
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
  
  // Sort by RS-Ratio descending
  results.sort((a, b) => b.rs_ratio - a.rs_ratio);
  
  return results;
}

/**
 * Convert scanner results to CSV format
 */
function resultsToCsv(results: SectorScannerResult[]): string {
  const header = "Sector,RS-Ratio,RS-Momentum,Performance,Trend";
  const rows = results.map(result => 
    `${result.sector},${result.rs_ratio},${result.rs_momentum},${result.performance > 0 ? '+' : ''}${result.performance}%,${result.trend}`
  );
  return `${header}\n${rows.join('\n')}`;
}

/**
 * Main function
 */
async function main(): Promise<void> {
  try {
    console.log("🚀 Starting RRG Sector Scanner...");
    
    // Scan all sectors
    const results = await scanAllSectors();
    
    if (results.length === 0) {
      console.log("❌ No valid sector data found");
      return;
    }
    
    // Convert to CSV
    const csvOutput = resultsToCsv(results);
    
    // Write to Azure
    const outputPath = "rrg_output/scanner/o4-rrg.csv";
    try {
      await uploadText(outputPath, csvOutput, 'text/csv');
      console.log(`✅ RRG Sector Scanner completed`);
      console.log(`📊 Processed ${results.length} sectors`);
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
      console.log(`   ${trend}: ${count} sectors`);
    });
    
    // Show top performing sectors
    console.log("\n🏆 Top 3 Sectors by RS-Ratio:");
    results.slice(0, 3).forEach((result, index) => {
      console.log(`   ${index + 1}. ${result.sector}: ${result.rs_ratio} (${result.trend})`);
    });
    
  } catch (error) {
    console.error(`❌ Error: ${error}`);
    process.exit(1);
  }
}

// Export function for backend use
export async function generateRrgSectorScanner(): Promise<SectorScannerResult[]> {
  try {
    console.log("🚀 Starting RRG Sector Scanner...");
    
    // Scan all sectors
    const results = await scanAllSectors();
    
    if (results.length === 0) {
      console.log("❌ No valid sector data found");
      return results;
    }
    
    // Convert to CSV
    const csvOutput = resultsToCsv(results);
    
    // Write to Azure
    const outputPath = "rrg_output/scanner/o4-rrg.csv";
    try {
      await uploadText(outputPath, csvOutput, 'text/csv');
      console.log(`✅ RRG Sector Scanner completed`);
      console.log(`📊 Processed ${results.length} sectors`);
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
      console.log(`   ${trend}: ${count} sectors`);
    });
    
    // Show top performing sectors
    console.log("\n🏆 Top 3 Sectors by RS-Ratio:");
    results.slice(0, 3).forEach((result, index) => {
      console.log(`   ${index + 1}. ${result.sector}: ${result.rs_ratio} (${result.trend})`);
    });
    
    return results;
  } catch (error) {
    console.error(`❌ Error in generateRrgSectorScanner: ${error}`);
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
