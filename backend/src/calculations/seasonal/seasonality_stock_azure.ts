// seasonality_stock_azure.ts
// Azure-integrated version of seasonality stock calculation

import { listPaths, downloadText } from '../../utils/azureBlob';

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

export async function loadStockData(sector: string, ticker: string): Promise<StockData[]> {
  const stockPath = `stock/${sector}/${ticker}.csv`;
  
  try {
    const csvContent = await downloadText(stockPath);
    return parseCsvContent(csvContent);
  } catch (error) {
    throw new Error(`Stock file not found: ${stockPath}`);
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
      Date: row.Date || '',
      Open: parseFloat(row.Open || '0'),
      High: parseFloat(row.High || '0'),
      Low: parseFloat(row.Low || '0'),
      Close: parseFloat(row.Close || '0'),
      Volume: parseInt(row.Volume || '0'),
      Value: parseInt(row.Value || '0'),
      Frequency: parseInt(row.Frequency || '0'),
      ChangePercent: parseFloat(row.ChangePercent || '0')
    });
  }
  
  return data.sort((a, b) => new Date(a.Date).getTime() - new Date(b.Date).getTime());
}

export function calculateMonthlyReturns(data: StockData[]): MonthlyReturns {
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

export function calculateVolatility(monthlyReturns: MonthlyReturns): number {
  const returns = Object.values(monthlyReturns);
  if (returns.length === 0) return 0;
  
  const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
  const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
  
  return parseFloat(Math.sqrt(variance).toFixed(2));
}

export async function generateStockSeasonalityData(sector: string, ticker: string): Promise<StockSeasonalityData> {
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

export async function getAllStocks(): Promise<{ sector: string; ticker: string }[]> {
  try {
    const azureFiles = await listPaths({ prefix: 'stock/' });
    const stocks: { sector: string; ticker: string }[] = [];
    
    azureFiles.forEach(file => {
      const parts = file.split('/');
      if (parts.length >= 3 && parts[0] === 'stock' && parts[1] && parts[2] && parts[2].toLowerCase().endsWith('.csv')) {
        const sector = parts[1];
        const ticker = parts[2].replace('.csv', '');
        stocks.push({ sector, ticker });
      }
    });
    
    return stocks;
  } catch (error) {
    console.error(`❌ Error reading stocks: ${error}`);
    return [];
  }
}

export async function generateAllStocksSeasonality(): Promise<SeasonalityResults> {
  const allStocks = await getAllStocks();
  const stocksData: StockSeasonalityData[] = [];
  
  console.log(`📊 Processing ${allStocks.length} stocks...`);
  
  for (let index = 0; index < allStocks.length; index++) {
    const stock = allStocks[index];
    if (stock && stock.sector && stock.ticker) {
      try {
        console.log(`Processing ${index + 1}/${allStocks.length}: ${stock.ticker} (${stock.sector})`);
        const seasonalityData = await generateStockSeasonalityData(stock.sector, stock.ticker);
        stocksData.push(seasonalityData);
      } catch (error) {
        console.warn(`⚠️ Warning: Could not process ${stock.ticker}: ${error}`);
      }
    }
  }
  
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

