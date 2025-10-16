// rrg_scanner_sector.ts
// ------------------------------------------------------------
// Relative Rotation Graph (RRG) Scanner for sectors
// Membaca data RRG dari file output sector dan membuat scanner tabel
// Output: CSV file dengan nama "o4-rrg.csv" di folder rrg_output
// ------------------------------------------------------------

import { downloadText, uploadText, listPaths, exists } from '../../utils/azureBlob';

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
 * Convert sector filename to display name
 */
function getSectorDisplayName(filename: string): string {
  // Extract sector name from o2-rrg-SECTOR_NAME.csv
  let sectorName = filename.replace("o2-rrg-", "").replace(".csv", "");
  
  // Convert to proper display format
  const sectorMap: { [key: string]: string } = {
    "BASIC MATERIALS": "Basic Materials",
    "CONSUMER CYCLICALS": "Consumer Cyclicals", 
    "CONSUMER NON-CYCLICALS": "Consumer Non-Cyclicals",
    "ENERGY": "Energy",
    "FINANCIALS": "Financials",
    "HEALTHCARE": "Healthcare",
    "INDUSTRIALS": "Industrials",
    "INFRASTRUCTURES": "Infrastructures",
    "PROPERTIES": "Properties",
    "TECHNOLOGY": "Technology",
    "TRANSPORTATION": "Transportation"
  };
  
  return sectorMap[sectorName] || sectorName;
}

/**
 * Scan all available sectors and generate scanner data
 */
async function scanAllSectors(): Promise<SectorScannerResult[]> {
  const results: SectorScannerResult[] = [];
  
  // Get all o2-rrg-*.csv files from rrg_output/sector
  const rrgOutputDir = "rrg_output/sector";
  
  const files = await listPaths({ prefix: rrgOutputDir });
  const sectorFiles = files.filter(f => f.includes("o2-rrg-") && f.endsWith(".csv"));
  
  if (sectorFiles.length === 0) {
    console.log(`⚠️ No RRG sector files found in ${rrgOutputDir} - generate RRG data first`);
    return results; // Return empty, scanner will be skipped
  }
  
  console.log(`📊 Found ${sectorFiles.length} RRG sector files`);
  
  for (const file of sectorFiles) {
    try {
      // Read sector RRG data
      const rrgData = await readSectorRRGData(file);
      if (!rrgData) continue;
      
      // Get sector display name
      const sectorDisplayName = getSectorDisplayName(file);
      
      // Calculate performance
      const performance = calculateSectorPerformance(rrgData);
      
      // Determine trend
      const trend = determineSectorTrend(rrgData.rs_ratio, rrgData.rs_momentum, performance);
      
      results.push({
        sector: sectorDisplayName,
        rs_ratio: Number(rrgData.rs_ratio.toFixed(1)),
        rs_momentum: Number(rrgData.rs_momentum.toFixed(1)),
        performance: Number(performance.toFixed(1)),
        trend: trend
      });
      
    } catch (error) {
      console.log(`⚠️  Error processing ${file}: ${error}`);
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
    const outputPath = "rrg_output/o4-rrg.csv";
    await uploadText(outputPath, csvOutput);
    
    console.log(`✅ RRG Sector Scanner completed`);
    console.log(`📊 Processed ${results.length} sectors`);
    console.log(`📁 Output saved to: ${outputPath}`);
    
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
  return await scanAllSectors();
}

// Execute if run directly
if (require.main === module) {
  main().catch((err) => {
    console.error(err?.stack || String(err));
    process.exit(1);
  });
}
