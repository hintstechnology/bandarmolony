// seasonality_stock.ts
// ------------------------------------------------------------
// Seasonal analysis for individual stocks
// Output: CSV file dengan nama "o2-seasonal-stocks.csv" di folder seasonal_output
// ------------------------------------------------------------

import { uploadText, listPaths, exists } from '../../utils/azureBlob';
import { stockCache } from '../../cache/stockCacheService';
import { BATCH_SIZE_PHASE_2, MAX_CONCURRENT_REQUESTS_PHASE_2 } from '../../services/dataUpdateService';

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
  Date: string;
  Open: number;
  High: number;
  Low: number;
  Close: number;
  Volume: number;
  Value: number;
  Frequency: number;
  ChangePercent: number;
}

interface MonthlyReturns {
  [month: string]: number;
}

interface StockSeasonalityData {
  ticker: string;
  sector: string;
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
    total_stocks: number;
    analysis_type: string;
    description: string;
  };
  stocks: StockSeasonalityData[];
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
 * Load stock data from Azure
 */
async function loadStockData(sector: string, ticker: string): Promise<StockData[]> {
  const stockPath = `stock/${sector}/${ticker}.csv`;
  
  if (!(await exists(stockPath))) {
    throw new Error(`Stock file not found: ${stockPath}`);
  }
  
  // Use shared cache for raw content (will cache automatically if not exists)
  const csvContent = await stockCache.getRawContent(stockPath) || '';
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
      Date: row.Date,
      Open: parseFloat(row.Open),
      High: parseFloat(row.High),
      Low: parseFloat(row.Low),
      Close: parseFloat(row.Close),
      Volume: parseInt(row.Volume),
      Value: parseInt(row.Value),
      Frequency: parseInt(row.Frequency),
      ChangePercent: parseFloat(row.ChangePercent)
    });
  }
  
  return data.sort((a, b) => new Date(b.Date).getTime() - new Date(a.Date).getTime());
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
    const currentPrice = data[i]?.Close;
    const previousPrice = data[i - 1]?.Close;
    
    if (currentPrice && previousPrice && previousPrice !== 0) {
      const dailyReturn = (currentPrice - previousPrice) / previousPrice;
      
      const date = new Date(data[i]?.Date || '');
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
 * Generate seasonality data for a single stock
 */
async function generateStockSeasonalityData(sector: string, ticker: string): Promise<StockSeasonalityData> {
  const data = await loadStockData(sector, ticker);
  const monthlyReturns = calculateMonthlyReturns(data);
  const volatility = calculateVolatility(monthlyReturns);
  
  const seasonalityData: StockSeasonalityData = {
    ticker: ticker,
    sector: sector,
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
 * Get all stocks from Azure
 */
async function getAllStocks(): Promise<{ sector: string; ticker: string }[]> {
  try {
    const files = await listPaths({ prefix: 'stock/' });
    const stocks: { sector: string; ticker: string }[] = [];
    
    console.log(`📊 Found ${files.length} files in stock/ directory`);
    
    for (const file of files) {
      const parts = file.split('/');
      if (parts.length >= 3 && parts[2] && parts[2].endsWith('.csv')) {
        const sector = parts[1];
        const ticker = parts[2].replace('.csv', '');
        if (sector && ticker) {
          stocks.push({ sector, ticker });
        }
      }
    }
    
    console.log(`📊 Found ${stocks.length} valid stock files`);
    return stocks;
  } catch (error) {
    console.error(`❌ Error reading stocks: ${error}`);
    return [];
  }
}

/**
 * Generate seasonality data for all stocks
 */
export async function generateAllStocksSeasonality(): Promise<SeasonalityResults> {
  const allStocks = await getAllStocks();
  const stocksData: StockSeasonalityData[] = [];
  const activeFiles: string[] = [];
  
  console.log(`📊 Processing ${allStocks.length} stocks...`);
  
  // Check for duplicates in input data
  const uniqueStocks = new Map<string, { sector: string; ticker: string }>();
  allStocks.forEach(stock => {
    const key = `${stock.sector}-${stock.ticker}`;
    if (!uniqueStocks.has(key)) {
      uniqueStocks.set(key, stock);
    } else {
      console.warn(`⚠️ Duplicate stock found: ${stock.ticker} in ${stock.sector}`);
    }
  });
  
  console.log(`📊 Unique stocks after deduplication: ${uniqueStocks.size} (from ${allStocks.length} total)`);
  
  // Set active processing files HANYA untuk file yang benar-benar akan diproses
  const uniqueStocksArray = Array.from(uniqueStocks.values());
  for (const stock of uniqueStocksArray) {
    const stockPath = `stock/${stock.sector}/${stock.ticker}.csv`;
    stockCache.addActiveProcessingFile(stockPath);
    activeFiles.push(stockPath);
  }
  console.log(`📅 Set ${activeFiles.length} active processing stock files in cache`);
  
  // Process stocks in batches for better performance
  const BATCH_SIZE = BATCH_SIZE_PHASE_2; // Phase 2: 500 stocks at a time
  
  for (let i = 0; i < uniqueStocksArray.length; i += BATCH_SIZE) {
    const batch = uniqueStocksArray.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
    console.log(`Processing batch ${batchNumber}/${Math.ceil(uniqueStocksArray.length / BATCH_SIZE)} (${batch.length} stocks)`);
    
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
    
    // Limit concurrency to 250 for Phase 2
    const batchPromises = batch.map(async (stock) => {
        try {
          console.log(`Processing ${uniqueStocksArray.indexOf(stock) + 1}/${uniqueStocksArray.length}: ${stock.ticker} (${stock.sector})`);
          return await generateStockSeasonalityData(stock.sector, stock.ticker);
        } catch (error) {
          console.warn(`⚠️ Warning: Could not process ${stock.ticker}: ${error}`);
          return null;
        }
    });
    const batchResults = await limitConcurrency(batchPromises, MAX_CONCURRENT_REQUESTS_PHASE_2);
    
    // Add successful results
    batchResults.forEach(result => {
      if (result) {
        stocksData.push(result);
      }
    });
    
    // Memory cleanup after batch
    if (global.gc) {
      global.gc();
      const memAfter = process.memoryUsage();
      const heapUsedMB = memAfter.heapUsed / 1024 / 1024;
      console.log(`📊 Batch ${batchNumber} complete - Memory: ${heapUsedMB.toFixed(2)}MB`);
    }
    
    // Small delay between batches
    if (i + BATCH_SIZE < uniqueStocksArray.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Small delay between batches
    if (i + BATCH_SIZE < uniqueStocksArray.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  console.log(`📊 Final result: ${stocksData.length} stocks processed successfully`);
  
  return {
    metadata: {
      generated_at: new Date().toISOString(),
      total_stocks: stocksData.length,
      analysis_type: "seasonality_stocks",
      description: "Monthly seasonality analysis for individual stocks"
    },
    stocks: stocksData
  };
}

/**
 * Save results to CSV and upload to Azure
 */
export async function saveStockSeasonalityToCSV(results: SeasonalityResults): Promise<void> {
  // Create CSV content
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  let csvContent = 'Ticker,Sector,';
  csvContent += months.join(',') + ',';
  csvContent += 'BestMonth,BestReturn,WorstMonth,WorstReturn,Volatility\n';
  
  console.log(`📊 Saving ${results.stocks.length} stocks to CSV...`);
  
  // Check for duplicates in CSV data
  const seenTickers = new Set<string>();
  let duplicateCount = 0;
  
  results.stocks.forEach((stock, index) => {
    const tickerKey = `${stock.sector}-${stock.ticker}`;
    if (seenTickers.has(tickerKey)) {
      duplicateCount++;
      console.warn(`⚠️ Duplicate ticker in CSV: ${stock.ticker} (${stock.sector})`);
      return; // Skip duplicate
    }
    seenTickers.add(tickerKey);
    
    csvContent += `${stock.ticker},${stock.sector},`;
    
    // Add monthly returns
    months.forEach(month => {
      const returnValue = stock.monthly_returns[month] || 0;
      csvContent += `${returnValue},`;
    });
    
    // Add best/worst months and volatility
    csvContent += `${stock.best_month?.month || ''},`;
    csvContent += `${stock.best_month?.return || 0},`;
    csvContent += `${stock.worst_month?.month || ''},`;
    csvContent += `${stock.worst_month?.return || 0},`;
    csvContent += `${stock.volatility}\n`;
    
    if (index < 5) {
      console.log(`📊 Sample stock ${index + 1}: ${stock.ticker} (${stock.sector})`);
    }
  });
  
  if (duplicateCount > 0) {
    console.warn(`⚠️ Found ${duplicateCount} duplicate stocks in CSV data`);
  }
  
  // Upload to Azure
  const outputPath = "seasonal_output/o2-seasonal-stocks.csv";
  try {
    await uploadText(outputPath, csvContent, 'text/csv');
    console.log(`✅ Stock seasonality data saved to: ${outputPath} (${seenTickers.size} unique stocks from ${results.stocks.length} total)`);
  } catch (error) {
    console.error(`❌ Error uploading to Azure: ${error}`);
    throw error;
  }
}

/**
 * Main function to generate and save stock seasonality
 */
export async function generateStockSeasonality(): Promise<SeasonalityResults> {
  try {
    console.log('🔄 Starting stock seasonality analysis...');
    
    const results = await generateAllStocksSeasonality();
    
    console.log('💾 Saving to CSV...');
    await saveStockSeasonalityToCSV(results);
    
    console.log(`✅ Stock seasonality analysis completed - ${results.stocks.length} stocks processed`);
    
    return results;
  } catch (error) {
    console.error('❌ Error in generateStockSeasonality:', error);
    throw error;
  } finally {
    // Cleanup: Remove active processing files setelah selesai
    // Get from cache service
    const activeStockFiles = stockCache.getActiveProcessingFiles();
    for (const file of activeStockFiles) {
      stockCache.removeActiveProcessingFile(file);
    }
    if (activeStockFiles.length > 0) {
      console.log(`🧹 Cleaned up ${activeStockFiles.length} active processing stock files from cache`);
    }
  }
}