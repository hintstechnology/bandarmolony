// seasonality_index.ts
// ------------------------------------------------------------
// Seasonal analysis for market indexes
// Output: CSV file dengan nama "o1-seasonal-indexes.csv" di folder seasonal_output
// ------------------------------------------------------------

import { downloadText, uploadText, listPaths, exists } from '../../utils/azureBlob';
import { BATCH_SIZE_PHASE_3, MAX_CONCURRENT_REQUESTS_PHASE_3 } from '../../services/dataUpdateService';

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
 * Load index data from Azure
 */
async function loadIndexData(indexName: string = 'COMPOSITE'): Promise<StockData[]> {
  const indexPath = `index/${indexName}.csv`;
  
  if (!(await exists(indexPath))) {
    throw new Error(`Index file not found: ${indexPath}`);
  }
  
  const csvContent = await downloadText(indexPath);
  const lines = csvContent.trim().split('\n');
  const headers = parseCsvLine(lines[0] || '');
  
  const data: StockData[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i] || '');
    const row: any = {};
    
    headers.forEach((header, index) => {
      row[header.trim()] = values[index]?.trim();
    });
    
    data.push({
      time: row.Date || row.time,
      open: parseFloat(row.Open || row.open),
      high: parseFloat(row.High || row.high),
      low: parseFloat(row.Low || row.low),
      close: parseFloat(row.Close || row.close)
    });
  }
  
  return data.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
}

/**
 * Calculate volatility from monthly returns
 */
function calculateVolatility(monthlyReturns: MonthlyReturns): number {
  const returns = Object.values(monthlyReturns);
  if (returns.length === 0) return 0;
  
  const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
  const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
  
  return parseFloat(Math.sqrt(variance).toFixed(2));
}

/**
 * Calculate monthly returns from stock data using daily returns method (same as original)
 */
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
      
      if (monthlyReturns[month]) {
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

/**
 * Generate seasonality data for a single index
 */
function generateIndexSeasonalityData(data: StockData[], ticker: string = 'IHSG'): IndexSeasonalityData {
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
  
  if (returns.length > 0 && months.length > 0) {
    const maxReturn = Math.max(...returns);
    const minReturn = Math.min(...returns);
    
    const bestMonthIndex = returns.indexOf(maxReturn);
    const worstMonthIndex = returns.indexOf(minReturn);
    
    if (bestMonthIndex >= 0 && bestMonthIndex < months.length) {
      seasonalityData.best_month = {
        month: months[bestMonthIndex] || '',
        return: maxReturn
      };
    }
    
    if (worstMonthIndex >= 0 && worstMonthIndex < months.length) {
      seasonalityData.worst_month = {
        month: months[worstMonthIndex] || '',
        return: minReturn
      };
    }
  }
  
  return seasonalityData;
}

/**
 * Get available indexes from Azure
 */
async function getAvailableIndexes(): Promise<string[]> {
  try {
    const files = await listPaths({ prefix: 'index/' });
    const indexes = files
      .filter(f => f.startsWith('index/') && f.endsWith('.csv'))
      .map(f => f.replace('index/', '').replace('.csv', ''));
    
    return indexes.sort();
  } catch (err) {
    console.error(`Error getting indexes: ${err}`);
    return [];
  }
}

/**
 * Generate seasonality data for all indexes
 */
export async function generateAllIndexesSeasonality(): Promise<SeasonalityResults> {
  // Helper function to limit concurrency for Phase 3
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
  
  const allIndexes = await getAvailableIndexes();
  const indexesData: IndexSeasonalityData[] = [];
  
  console.log(`📊 Processing ${allIndexes.length} indexes...`);
  
  // Process indexes in batches (Phase 3: 50 at a time)
  const BATCH_SIZE = BATCH_SIZE_PHASE_3;
  const MAX_CONCURRENT = MAX_CONCURRENT_REQUESTS_PHASE_3;
  console.log(`📦 Processing indexes in batches of ${BATCH_SIZE}...`);
  
  for (let i = 0; i < allIndexes.length; i += BATCH_SIZE) {
    const batch = allIndexes.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
    console.log(`📦 Processing batch ${batchNumber}/${Math.ceil(allIndexes.length / BATCH_SIZE)} (${batch.length} indexes)`);
    
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
    const batchPromises = batch.map(async (ticker) => {
      try {
        console.log(`📈 Processing: ${ticker}`);
        const data = await loadIndexData(ticker);
        const seasonalityData = generateIndexSeasonalityData(data, ticker);
        return seasonalityData;
      } catch (error) {
        console.warn(`⚠️ Warning: Could not process index ${ticker}: ${error}`);
        return null;
      }
    });
    
    const batchResults = await limitConcurrency(batchPromises, MAX_CONCURRENT);
    
    // Collect valid results
    batchResults.forEach((result) => {
      if (result) {
        indexesData.push(result);
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

/**
 * Save results to CSV and upload to Azure
 */
export async function saveIndexSeasonalityToCSV(results: SeasonalityResults): Promise<void> {
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
  
  // Upload to Azure
  const outputPath = "seasonal_output/o1-seasonal-indexes.csv";
  try {
    await uploadText(outputPath, csvContent, 'text/csv');
    console.log(`✅ Index seasonality data saved to: ${outputPath}`);
  } catch (error) {
    console.error(`❌ Error uploading to Azure: ${error}`);
    throw error;
  }
}

/**
 * Main function to generate and save index seasonality
 */
export async function generateIndexSeasonality(): Promise<SeasonalityResults> {
  try {
    console.log('🔄 Starting index seasonality analysis...');
    
    const results = await generateAllIndexesSeasonality();
    
    console.log('💾 Saving to CSV...');
    await saveIndexSeasonalityToCSV(results);
    
    console.log(`✅ Index seasonality analysis completed - ${results.indexes.length} indexes processed`);
    
    return results;
  } catch (error) {
    console.error('❌ Error in generateIndexSeasonality:', error);
    throw error;
  }
}