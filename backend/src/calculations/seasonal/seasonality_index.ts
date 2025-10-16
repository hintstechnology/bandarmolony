import * as fs from 'fs';
import * as path from 'path';
import { listPaths, downloadText } from '../../utils/azureBlob';

interface StockData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface MonthlyReturns {
  [month: string]: number;
}

interface IndexSeasonalityData {
  ticker: string;
  name: string;
  monthly_returns: MonthlyReturns;
  best_month?: {
    month: string;
    return: number;
  };
  worst_month?: {
    month: string;
    return: number;
  };
  volatility: number;
}

interface SeasonalityResults {
  metadata: {
    generated_at: string;
    total_indexes: number;
    analysis_type: string;
    description: string;
  };
  indexes: IndexSeasonalityData[];
}

// Removed unused fileExists function

async function listAvailableIndexes(indexDir: string = 'index'): Promise<string[]> {
  try {
    // Try Azure first
    const azureFiles = await listPaths({ prefix: `${indexDir}/` });
    const indexes = azureFiles
      .filter(file => file.toLowerCase().endsWith('.csv'))
      .map(file => file.split('/').pop()?.replace('.csv', '') || '')
      .filter(name => name !== '');
    
    if (indexes.length > 0) {
      return indexes.sort();
    }
    
    // Fallback to local filesystem
    const items = await fs.promises.readdir(indexDir);
    const localIndexes: string[] = [];
    
    for (const item of items) {
      if (item.toLowerCase().endsWith('.csv')) {
        localIndexes.push(item.replace('.csv', ''));
      }
    }
    
    return localIndexes.sort();
  } catch (err) {
    throw new Error(`Tidak bisa baca folder index: ${err}`);
  }
}

async function loadIndexData(indexName: string = 'COMPOSITE', indexDir: string = 'index'): Promise<StockData[]> {
  const indexPath = `${indexDir}/${indexName}.csv`;
  
  try {
    // Try Azure first
    const csvContent = await downloadText(indexPath);
    return parseCsvContent(csvContent);
  } catch (error) {
    // Fallback to local filesystem
    const localPath = path.join('./', indexDir, `${indexName}.csv`);
    
    if (!fs.existsSync(localPath)) {
      throw new Error(`Index file not found: ${indexPath} or ${localPath}`);
    }
    
    const csvContent = fs.readFileSync(localPath, 'utf-8');
    return parseCsvContent(csvContent);
  }
}

function parseCsvContent(csvContent: string): StockData[] {
  const lines = csvContent.trim().split('\n');
  if (lines.length === 0) return [];
  
  const headers = lines[0]?.split(',') || [];
  
  const data: StockData[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i]?.split(',') || [];
    const row: any = {};
    
    headers.forEach((header, index) => {
      row[header.trim()] = values[index]?.trim();
    });
    
    data.push({
      time: row.Date || row.time || '',
      open: parseFloat(row.Open || row.open || '0'),
      high: parseFloat(row.High || row.high || '0'),
      low: parseFloat(row.Low || row.low || '0'),
      close: parseFloat(row.Close || row.close || '0')
    });
  }
  
  return data.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
}

function calculateVolatility(monthlyReturns: MonthlyReturns): number {
  const returns = Object.values(monthlyReturns);
  if (returns.length === 0) return 0;
  
  const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
  const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
  
  return parseFloat(Math.sqrt(variance).toFixed(2));
}

function calculateMonthlyReturns(data: StockData[]): MonthlyReturns {
  const monthlyReturns: { [month: number]: number[] } = {};
  
  // Initialize months
  for (let i = 1; i <= 12; i++) {
    monthlyReturns[i] = [];
  }
  
  // Calculate daily returns and group by month
  for (let i = 1; i < data.length; i++) {
    const currentPrice = data[i]?.close;
    const previousPrice = data[i - 1]?.close;
    
    if (currentPrice && previousPrice && previousPrice !== 0) {
      const dailyReturn = (currentPrice - previousPrice) / previousPrice;
      
      const date = new Date(data[i]?.time || '');
      const month = date.getMonth() + 1; // getMonth() returns 0-11, we want 1-12
      
      if (month >= 1 && month <= 12 && monthlyReturns[month]) {
        monthlyReturns[month].push(dailyReturn);
      }
    }
  }
  
  // Calculate average monthly returns
  const avgMonthlyReturns: MonthlyReturns = {};
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  for (let i = 1; i <= 12; i++) {
    const returns = monthlyReturns[i];
    if (returns && returns.length > 0) {
      const avgReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
      const monthName = monthNames[i - 1];
      if (monthName) {
        avgMonthlyReturns[monthName] = parseFloat((avgReturn * 100).toFixed(2));
      }
    } else {
      const monthName = monthNames[i - 1];
      if (monthName) {
        avgMonthlyReturns[monthName] = 0.0;
      }
    }
  }
  
  return avgMonthlyReturns;
}

async function generateIndexSeasonalityData(data: StockData[], ticker: string = 'IHSG'): Promise<IndexSeasonalityData> {
  const monthlyReturns = calculateMonthlyReturns(data);
  const volatility = calculateVolatility(monthlyReturns);
  
  const seasonalityData: IndexSeasonalityData = {
    ticker: ticker,
    name: `${ticker} Seasonality Pattern`,
    monthly_returns: monthlyReturns,
    volatility: volatility
  };
  
  // Find best and worst months
  const returns = Object.values(monthlyReturns);
  const months = Object.keys(monthlyReturns);
  
  if (returns && returns.length > 0) {
    const validReturns = returns.filter(r => r !== undefined && !isNaN(r));
    if (validReturns.length > 0) {
      const maxReturn = Math.max(...validReturns);
      const minReturn = Math.min(...validReturns);
      
      const bestMonthIndex = validReturns.indexOf(maxReturn);
      const worstMonthIndex = validReturns.indexOf(minReturn);
      
      if (bestMonthIndex >= 0 && months[bestMonthIndex]) {
        seasonalityData.best_month = {
          month: months[bestMonthIndex],
          return: maxReturn
        };
      }
      
      if (worstMonthIndex >= 0 && months[worstMonthIndex]) {
        seasonalityData.worst_month = {
          month: months[worstMonthIndex],
          return: minReturn
        };
      }
    }
  }
  
  return seasonalityData;
}

async function generateAllIndexesSeasonality(indexDir: string = 'index'): Promise<SeasonalityResults> {
  const allIndexes = await listAvailableIndexes(indexDir);
  const indexesData: IndexSeasonalityData[] = [];
  
  console.log(`📊 Processing ${allIndexes.length} indexes...`);
  
  for (let index = 0; index < allIndexes.length; index++) {
    const ticker = allIndexes[index];
    try {
      console.log(`Processing ${index + 1}/${allIndexes.length}: ${ticker}`);
      
      const data = await loadIndexData(ticker, indexDir);
      const seasonalityData = await generateIndexSeasonalityData(data, ticker);
      indexesData.push(seasonalityData);
    } catch (error) {
      console.warn(`⚠️ Warning: Could not process index ${ticker}: ${error}`);
    }
  }
  
  return {
    metadata: {
      generated_at: new Date().toISOString(),
      total_indexes: indexesData.length,
      analysis_type: "seasonality_indexes",
      description: "Monthly seasonality analysis for market indexes"
    },
    indexes: indexesData
  };
}

function saveToCSV(results: SeasonalityResults, outputDir: string): void {
  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const filename = 'o1-seasonal-indexes.csv';
  const filepath = path.join(outputDir, filename);
  
  // Create CSV content
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  let csvContent = 'Ticker,Name,';
  csvContent += months.join(',') + ',';
  csvContent += 'BestMonth,BestReturn,WorstMonth,WorstReturn,Volatility\n';
  
  results.indexes.forEach(index => {
    csvContent += `${index.ticker},"${index.name}",`;
    
    // Add monthly returns
    months.forEach(month => {
      const returnValue = index.monthly_returns[month] || 0;
      csvContent += `${returnValue},`;
    });
    
    // Add best/worst months and volatility
    csvContent += `${index.best_month?.month || ''},`;
    csvContent += `${index.best_month?.return || 0},`;
    csvContent += `${index.worst_month?.month || ''},`;
    csvContent += `${index.worst_month?.return || 0},`;
    csvContent += `${index.volatility}\n`;
  });
  
  fs.writeFileSync(filepath, csvContent);
  console.log(`✅ Index seasonality data saved to: ${filepath}`);
}

function printSummary(results: SeasonalityResults): void {
  console.log('\n' + '='.repeat(50));
  console.log('INDEX SEASONALITY ANALYSIS SUMMARY');
  console.log('='.repeat(50));
  
  console.log(`\n📊 TOTAL INDEXES ANALYZED: ${results.indexes.length}`);
  
  // Top performing indexes by best month return
  const topIndexes = results.indexes
    .filter(index => index.best_month?.return)
    .sort((a, b) => (b.best_month?.return || 0) - (a.best_month?.return || 0))
    .slice(0, 5);
  
  console.log('\n🏆 TOP 5 BEST PERFORMING INDEXES:');
  topIndexes.forEach((index, i) => {
    console.log(`   ${i + 1}. ${index.ticker}: ${index.best_month?.return?.toFixed(2)}% in ${index.best_month?.month}`);
  });
  
  // Most volatile indexes
  const volatileIndexes = results.indexes
    .sort((a, b) => b.volatility - a.volatility)
    .slice(0, 3);
  
  console.log('\n📊 MOST VOLATILE INDEXES:');
  volatileIndexes.forEach((index, i) => {
    console.log(`   ${i + 1}. ${index.ticker}: ${index.volatility}% volatility`);
  });
  
  console.log(`\n💾 Analysis completed at: ${results.metadata.generated_at}`);
  console.log('='.repeat(50));
}

// -------------------------- CLI --------------------------
// Usage examples:
//   npx ts-node seasonality_index.ts
//   npx ts-node seasonality_index.ts --index-dir ./index --output-dir ./seasonal_output
//   npx ts-node seasonality_index.ts --list-indexes
// Output: CSV file dengan nama "o1-seasonal-indexes.csv" di folder seasonal_output

function printUsageAndExit(message?: string): never {
  if (message) {
    console.error(message);
  }
  console.error(
    "\nUsage:\n  ts-node seasonality_index.ts [--index-dir <DIR>] [--output-dir <DIR>]\n  ts-node seasonality_index.ts --list-indexes [--index-dir <DIR>]\n\nKeterangan:\n  - --index-dir: Folder yang berisi file index CSV (default: ./index)\n  - --output-dir: Folder output untuk file hasil (default: ./seasonal_output)\n  - --list-indexes: Tampilkan daftar index yang tersedia\n"
  );
  process.exit(1);
}

function parseArgs(argv: string[]): { indexDir?: string; outputDir?: string; listIndexes?: boolean } {
  const out: { indexDir?: string; outputDir?: string; listIndexes?: boolean } = {};
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--index-dir') {
      const next = argv[i + 1];
      if (!next || next.startsWith('-')) printUsageAndExit('Missing value for --index-dir');
      out.indexDir = next;
      i++;
    } else if (token === '--output-dir') {
      const next = argv[i + 1];
      if (!next || next.startsWith('-')) printUsageAndExit('Missing value for --output-dir');
      out.outputDir = next;
      i++;
    } else if (token === '--list-indexes') {
      out.listIndexes = true;
    }
  }
  return out;
}

async function main(): Promise<void> {
  const { indexDir = './index', outputDir = './seasonal_output', listIndexes } = parseArgs(process.argv);
  
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
  
  try {
    console.log('🔄 Starting index seasonality analysis...');
    
    const results = await generateAllIndexesSeasonality(indexDir);
    
    console.log('💾 Saving to CSV...');
    saveToCSV(results, outputDir);
    
    printSummary(results);
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Run the main function
if (require.main === module) {
  main().catch((err) => {
    console.error(err?.stack || String(err));
    process.exit(1);
  });
}

export { loadIndexData, calculateMonthlyReturns, generateIndexSeasonalityData, generateAllIndexesSeasonality, saveToCSV, listAvailableIndexes };
