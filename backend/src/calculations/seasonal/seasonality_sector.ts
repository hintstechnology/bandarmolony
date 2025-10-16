import * as fs from 'fs';
import * as path from 'path';
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

interface SectorSeasonalityData {
  sector: string;
  composition: string[];
  stock_count: number;
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
    total_sectors: number;
    analysis_type: string;
    description: string;
  };
  sectors: SectorSeasonalityData[];
}

async function loadStockData(sector: string, ticker: string): Promise<StockData[]> {
  const stockPath = `stock/${sector}/${ticker}.csv`;
  
  try {
    // Try Azure first
    const csvContent = await downloadText(stockPath);
    return parseCsvContent(csvContent);
  } catch (error) {
    // Fallback to local filesystem
    const localPath = path.join(__dirname, 'stock', sector, `${ticker}.csv`);
    
    if (!fs.existsSync(localPath)) {
      return [];
    }
    
    try {
      const csvContent = fs.readFileSync(localPath, 'utf-8');
      return parseCsvContent(csvContent);
    } catch (localError) {
      console.warn(`⚠️ Warning: Could not load data for ${ticker}: ${localError}`);
      return [];
    }
  }
}

function parseCsvContent(csvContent: string): StockData[] {
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

async function calculateSectorReturns(sector: string, tickers: string[]): Promise<MonthlyReturns> {
  const sectorMonthlyReturns: { [month: number]: number[] } = {};
  
  // Initialize months
  for (let i = 1; i <= 12; i++) {
    sectorMonthlyReturns[i] = [];
  }
  
  // Load data for all stocks in the sector
  const stocksData: StockData[][] = [];
  const validTickers: string[] = [];
  
  for (const ticker of tickers) {
    const data = await loadStockData(sector, ticker);
    if (data.length > 0) {
      stocksData.push(data);
      validTickers.push(ticker);
    }
  }
  
  if (stocksData.length === 0) {
    // Return empty returns if no valid data
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                       'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const emptyReturns: MonthlyReturns = {};
    monthNames.forEach(month => {
      emptyReturns[month] = 0.0;
    });
    return emptyReturns;
  }
  
  // Calculate sector average for each time period
  const allDates = new Set<string>();
  stocksData.forEach(data => {
    data.forEach(point => allDates.add(point.Date));
  });
  
  const sortedDates = Array.from(allDates).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  
  // Calculate sector price for each date (equal weight average)
  const sectorPrices: { [date: string]: number } = {};
  
  sortedDates.forEach(date => {
    const pricesOnDate: number[] = [];
    
    stocksData.forEach(data => {
      const dataPoint = data.find(point => point.Date === date);
      if (dataPoint && !isNaN(dataPoint.Close) && dataPoint.Close > 0) {
        pricesOnDate.push(dataPoint.Close);
      }
    });
    
    if (pricesOnDate.length > 0) {
      sectorPrices[date] = pricesOnDate.reduce((sum, price) => sum + price, 0) / pricesOnDate.length;
    }
  });
  
  // Calculate daily returns for sector and group by month
  const sectorDates = Object.keys(sectorPrices).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  
  for (let i = 1; i < sectorDates.length; i++) {
    const currentDate = sectorDates[i];
    const previousDate = sectorDates[i - 1];
    
    const currentPrice = sectorPrices[currentDate];
    const previousPrice = sectorPrices[previousDate];
    
    if (currentPrice && previousPrice && previousPrice !== 0) {
      const dailyReturn = (currentPrice - previousPrice) / previousPrice;
      
      const date = new Date(currentDate);
      const month = date.getMonth() + 1; // getMonth() returns 0-11, we want 1-12
      
      sectorMonthlyReturns[month].push(dailyReturn);
    }
  }
  
  // Calculate average monthly returns
  const avgMonthlyReturns: MonthlyReturns = {};
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  for (let i = 1; i <= 12; i++) {
    const returns = sectorMonthlyReturns[i];
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

function getSectorComposition(sector: string): string[] {
  const sectorPath = path.join(__dirname, 'stock', sector);
  
  if (!fs.existsSync(sectorPath)) {
    return [];
  }
  
  try {
    const files = fs.readdirSync(sectorPath).filter(file => file.endsWith('.csv'));
    return files.map(file => file.replace('.csv', ''));
  } catch (error) {
    console.warn(`⚠️ Warning: Could not read sector ${sector}: ${error}`);
    return [];
  }
}

function generateSectorSeasonalityData(sector: string): SectorSeasonalityData {
  const composition = getSectorComposition(sector);
  const monthlyReturns = calculateSectorReturns(sector, composition);
  const volatility = calculateVolatility(monthlyReturns);
  
  const seasonalityData: SectorSeasonalityData = {
    sector: sector,
    composition: composition,
    stock_count: composition.length,
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

function getAllSectors(): string[] {
  const stockDir = path.join(__dirname, 'stock');
  
  try {
    return fs.readdirSync(stockDir).filter(item => {
      return fs.statSync(path.join(stockDir, item)).isDirectory();
    });
  } catch (error) {
    console.error(`❌ Error reading sectors: ${error}`);
    return [];
  }
}

function generateAllSectorsSeasonality(): SeasonalityResults {
  const allSectors = getAllSectors();
  const sectorsData: SectorSeasonalityData[] = [];
  
  console.log(`📊 Processing ${allSectors.length} sectors...`);
  
  allSectors.forEach((sector, index) => {
    try {
      console.log(`Processing ${index + 1}/${allSectors.length}: ${sector}`);
      const seasonalityData = generateSectorSeasonalityData(sector);
      sectorsData.push(seasonalityData);
    } catch (error) {
      console.warn(`⚠️ Warning: Could not process sector ${sector}: ${error}`);
    }
  });
  
  return {
    metadata: {
      generated_at: new Date().toISOString(),
      total_sectors: sectorsData.length,
      analysis_type: "seasonality_sectors",
      description: "Monthly seasonality analysis for market sectors"
    },
    sectors: sectorsData
  };
}

function saveToCSV(results: SeasonalityResults, outputDir: string): void {
  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const filename = 'o3-seasonal-sectors.csv';
  const filepath = path.join(outputDir, filename);
  
  // Create CSV content
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  let csvContent = 'Sector,StockCount,';
  csvContent += months.join(',') + ',';
  csvContent += 'BestMonth,BestReturn,WorstMonth,WorstReturn,Volatility\n';
  
  results.sectors.forEach(sector => {
    csvContent += `${sector.sector},${sector.stock_count},`;
    
    // Add monthly returns
    months.forEach(month => {
      const returnValue = sector.monthly_returns[month] || 0;
      csvContent += `${returnValue},`;
    });
    
    // Add best/worst months and volatility
    csvContent += `${sector.best_month?.month || ''},`;
    csvContent += `${sector.best_month?.return || 0},`;
    csvContent += `${sector.worst_month?.month || ''},`;
    csvContent += `${sector.worst_month?.return || 0},`;
    csvContent += `${sector.volatility}\n`;
  });
  
  fs.writeFileSync(filepath, csvContent);
  console.log(`✅ Sector seasonality data saved to: ${filepath}`);
}

function printSummary(results: SeasonalityResults): void {
  console.log('\n' + '='.repeat(50));
  console.log('SECTOR SEASONALITY ANALYSIS SUMMARY');
  console.log('='.repeat(50));
  
  console.log(`\n📊 TOTAL SECTORS ANALYZED: ${results.sectors.length}`);
  
  console.log('\n📈 SECTOR COMPOSITION:');
  results.sectors.forEach(sector => {
    console.log(`   ${sector.sector}: ${sector.stock_count} stocks`);
  });
  
  // Top performing sectors by best month return
  const topSectors = results.sectors
    .filter(sector => sector.best_month?.return)
    .sort((a, b) => (b.best_month?.return || 0) - (a.best_month?.return || 0))
    .slice(0, 5);
  
  console.log('\n🏆 TOP 5 BEST PERFORMING SECTORS:');
  topSectors.forEach((sector, index) => {
    console.log(`   ${index + 1}. ${sector.sector}: ${sector.best_month?.return?.toFixed(2)}% in ${sector.best_month?.month}`);
  });
  
  // Most volatile sectors
  const volatileSectors = results.sectors
    .sort((a, b) => b.volatility - a.volatility)
    .slice(0, 3);
  
  console.log('\n📊 MOST VOLATILE SECTORS:');
  volatileSectors.forEach((sector, index) => {
    console.log(`   ${index + 1}. ${sector.sector}: ${sector.volatility}% volatility`);
  });
  
  console.log(`\n💾 Analysis completed at: ${results.metadata.generated_at}`);
  console.log('='.repeat(50));
}

function main(): void {
  try {
    console.log('🔄 Starting sector seasonality analysis...');
    
    const results = generateAllSectorsSeasonality();
    
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

export { loadStockData, calculateSectorReturns, generateSectorSeasonalityData, generateAllSectorsSeasonality, saveToCSV };
