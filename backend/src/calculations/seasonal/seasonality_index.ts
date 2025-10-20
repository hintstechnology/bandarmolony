// seasonality_index.ts
// ------------------------------------------------------------
// Seasonal analysis for market indexes
// Output: CSV file dengan nama "o1-seasonal-indexes.csv" di folder seasonal_output
// ------------------------------------------------------------

import { downloadText, uploadText, listPaths, exists } from '../../utils/azureBlob';

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
 * Calculate monthly returns from stock data using first open to last close method
 */
function calculateMonthlyReturns(data: StockData[]): MonthlyReturns {
  // Group data by (year, month) in UTC
  const monthlyData: { [key: string]: { firstOpen: number; lastClose: number; year: number; month: number } } = {};
  
  data.forEach(item => {
    const date = new Date(item.time);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1; // 1-12
    const key = `${year}-${month}`;
    
    if (!monthlyData[key]) {
      monthlyData[key] = {
        firstOpen: item.open,
        lastClose: item.close,
        year: year,
        month: month
      };
    } else {
      // Update first open (earliest in month)
      if (item.open > 0 && (monthlyData[key].firstOpen <= 0 || item.open < monthlyData[key].firstOpen)) {
        monthlyData[key].firstOpen = item.open;
      }
      // Update last close (latest in month)
      if (item.close > 0) {
        monthlyData[key].lastClose = item.close;
      }
    }
  });
  
  // Calculate monthly returns for each (year, month)
  const monthlyReturns: { [month: number]: number[] } = {};
  
  // Initialize months
  for (let i = 1; i <= 12; i++) {
    monthlyReturns[i] = [];
  }
  
  Object.values(monthlyData).forEach(monthData => {
    const { firstOpen, lastClose, month } = monthData;
    
    // Skip if firstOpen is invalid or 0
    if (firstOpen > 0 && lastClose > 0) {
      const monthlyReturn = (lastClose - firstOpen) / firstOpen;
      const returnPct = 100 * monthlyReturn;
      
      if (monthlyReturns[month]) {
        monthlyReturns[month].push(returnPct);
      }
    }
  });
  
  // Calculate average monthly returns across years
  const avgMonthlyReturns: MonthlyReturns = {};
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  for (let i = 1; i <= 12; i++) {
    const returns = monthlyReturns[i];
    if (returns && returns.length > 0) {
      const avgReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
      const monthName = monthNames[i - 1];
      if (monthName) {
        avgMonthlyReturns[monthName] = parseFloat(avgReturn.toFixed(2));
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
  const allIndexes = await getAvailableIndexes();
  const indexesData: IndexSeasonalityData[] = [];
  
  console.log(`📊 Processing ${allIndexes.length} indexes...`);
  
  for (let i = 0; i < allIndexes.length; i++) {
    const ticker = allIndexes[i];
    try {
      console.log(`Processing ${i + 1}/${allIndexes.length}: ${ticker}`);
      
      const data = await loadIndexData(ticker);
      const seasonalityData = generateIndexSeasonalityData(data, ticker);
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