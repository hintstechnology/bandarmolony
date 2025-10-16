// seasonality_index_azure.ts
// Azure-integrated version of seasonality index calculation

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

export async function listAvailableIndexes(indexDir: string = 'index'): Promise<string[]> {
  try {
    const azureFiles = await listPaths({ prefix: `${indexDir}/` });
    const indexes = azureFiles
      .filter(file => file.toLowerCase().endsWith('.csv'))
      .map(file => file.split('/').pop()?.replace('.csv', '') || '')
      .filter(name => name !== '');
    
    return indexes.sort();
  } catch (err) {
    throw new Error(`Tidak bisa baca folder index: ${err}`);
  }
}

export async function loadIndexData(indexName: string = 'COMPOSITE', indexDir: string = 'index'): Promise<StockData[]> {
  const indexPath = `${indexDir}/${indexName}.csv`;
  
  try {
    const csvContent = await downloadText(indexPath);
    return parseCsvContent(csvContent);
  } catch (error) {
    throw new Error(`Index file not found: ${indexPath}`);
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

export function calculateVolatility(monthlyReturns: MonthlyReturns): number {
  const returns = Object.values(monthlyReturns);
  if (returns.length === 0) return 0;
  
  const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
  const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
  
  return parseFloat(Math.sqrt(variance).toFixed(2));
}

export function calculateMonthlyReturns(data: StockData[]): MonthlyReturns {
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

export async function generateIndexSeasonalityData(data: StockData[], ticker: string = 'IHSG'): Promise<IndexSeasonalityData> {
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

export async function generateAllIndexesSeasonality(indexDir: string = 'index'): Promise<SeasonalityResults> {
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

