import * as fs from 'fs';
import * as path from 'path';

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

function loadStockData(sector: string, ticker: string): StockData[] {
  const stockPath = path.join(__dirname, 'stock', sector, `${ticker}.csv`);
  
  if (!fs.existsSync(stockPath)) {
    throw new Error(`Stock file not found: ${stockPath}`);
  }
  
  const csvContent = fs.readFileSync(stockPath, 'utf-8');
  const lines = csvContent.trim().split('\n');
  const headers = lines[0].split(',');
  
  const data: StockData[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
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
  
  return data.sort((a, b) => new Date(a.Date).getTime() - new Date(b.Date).getTime());
}

function calculateMonthlyReturns(data: StockData[]): MonthlyReturns {
  const monthlyReturns: { [month: number]: number[] } = {};
  
  // Initialize months
  for (let i = 1; i <= 12; i++) {
    monthlyReturns[i] = [];
  }
  
  // Calculate daily returns and group by month
  for (let i = 1; i < data.length; i++) {
    const currentPrice = data[i].Close;
    const previousPrice = data[i - 1].Close;
    
    if (currentPrice && previousPrice && previousPrice !== 0) {
      const dailyReturn = (currentPrice - previousPrice) / previousPrice;
      
      const date = new Date(data[i].Date);
      const month = date.getMonth() + 1; // getMonth() returns 0-11, we want 1-12
      
      monthlyReturns[month].push(dailyReturn);
    }
  }
  
  // Calculate average monthly returns
  const avgMonthlyReturns: MonthlyReturns = {};
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  for (let i = 1; i <= 12; i++) {
    const returns = monthlyReturns[i];
    if (returns.length > 0) {
      const avgReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
      avgMonthlyReturns[monthNames[i - 1]] = parseFloat((avgReturn * 100).toFixed(2));
    } else {
      avgMonthlyReturns[monthNames[i - 1]] = 0.0;
    }
  }
  
  return avgMonthlyReturns;
}

function calculateVolatility(monthlyReturns: MonthlyReturns): number {
  const returns = Object.values(monthlyReturns);
  if (returns.length === 0) return 0;
  
  const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
  const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
  
  return parseFloat(Math.sqrt(variance).toFixed(2));
}

function generateStockSeasonalityData(sector: string, ticker: string): StockSeasonalityData {
  const data = loadStockData(sector, ticker);
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
  
  if (returns.length > 0) {
    const maxReturn = Math.max(...returns);
    const minReturn = Math.min(...returns);
    
    const bestMonthIndex = returns.indexOf(maxReturn);
    const worstMonthIndex = returns.indexOf(minReturn);
    
    seasonalityData.best_month = {
      month: months[bestMonthIndex],
      return: maxReturn
    };
    
    seasonalityData.worst_month = {
      month: months[worstMonthIndex],
      return: minReturn
    };
  }
  
  return seasonalityData;
}

function getAllStocks(): { sector: string; ticker: string }[] {
  const stockDir = path.join(__dirname, 'stock');
  const stocks: { sector: string; ticker: string }[] = [];
  
  const sectors = fs.readdirSync(stockDir).filter(item => {
    return fs.statSync(path.join(stockDir, item)).isDirectory();
  });
  
  sectors.forEach(sector => {
    const sectorPath = path.join(stockDir, sector);
    const files = fs.readdirSync(sectorPath).filter(file => file.endsWith('.csv'));
    
    files.forEach(file => {
      const ticker = file.replace('.csv', '');
      stocks.push({ sector, ticker });
    });
  });
  
  return stocks;
}

function generateAllStocksSeasonality(): SeasonalityResults {
  const allStocks = getAllStocks();
  const stocksData: StockSeasonalityData[] = [];
  
  console.log(`📊 Processing ${allStocks.length} stocks...`);
  
  allStocks.forEach((stock, index) => {
    try {
      console.log(`Processing ${index + 1}/${allStocks.length}: ${stock.ticker} (${stock.sector})`);
      const seasonalityData = generateStockSeasonalityData(stock.sector, stock.ticker);
      stocksData.push(seasonalityData);
    } catch (error) {
      console.warn(`⚠️ Warning: Could not process ${stock.ticker}: ${error}`);
    }
  });
  
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

function saveToCSV(results: SeasonalityResults, outputDir: string): void {
  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const filename = 'o2-seasonal-stocks.csv';
  const filepath = path.join(outputDir, filename);
  
  // Create CSV content
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  let csvContent = 'Ticker,Sector,';
  csvContent += months.join(',') + ',';
  csvContent += 'BestMonth,BestReturn,WorstMonth,WorstReturn,Volatility\n';
  
  results.stocks.forEach(stock => {
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
  });
  
  fs.writeFileSync(filepath, csvContent);
  console.log(`✅ Stock seasonality data saved to: ${filepath}`);
}

function printSummary(results: SeasonalityResults): void {
  console.log('\n' + '='.repeat(50));
  console.log('STOCK SEASONALITY ANALYSIS SUMMARY');
  console.log('='.repeat(50));
  
  console.log(`\n📊 TOTAL STOCKS ANALYZED: ${results.stocks.length}`);
  
  // Group by sector
  const sectorCounts: { [sector: string]: number } = {};
  results.stocks.forEach(stock => {
    sectorCounts[stock.sector] = (sectorCounts[stock.sector] || 0) + 1;
  });
  
  console.log('\n📈 STOCKS BY SECTOR:');
  Object.entries(sectorCounts).forEach(([sector, count]) => {
    console.log(`   ${sector}: ${count} stocks`);
  });
  
  // Top performers by best month return
  const topPerformers = results.stocks
    .filter(stock => stock.best_month?.return)
    .sort((a, b) => (b.best_month?.return || 0) - (a.best_month?.return || 0))
    .slice(0, 5);
  
  console.log('\n🏆 TOP 5 BEST MONTHLY PERFORMERS:');
  topPerformers.forEach((stock, index) => {
    console.log(`   ${index + 1}. ${stock.ticker} (${stock.sector}): ${stock.best_month?.return?.toFixed(2)}% in ${stock.best_month?.month}`);
  });
  
  console.log(`\n💾 Analysis completed at: ${results.metadata.generated_at}`);
  console.log('='.repeat(50));
}

function main(): void {
  try {
    console.log('🔄 Starting stock seasonality analysis...');
    
    const results = generateAllStocksSeasonality();
    
    console.log('💾 Saving to CSV...');
    const outputDir = path.join(__dirname, 'seasonal_output');
    saveToCSV(results, outputDir);
    
    printSummary(results);
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Run the main function
if (require.main === module) {
  main();
}

export { loadStockData, calculateMonthlyReturns, generateStockSeasonalityData, generateAllStocksSeasonality, saveToCSV };
