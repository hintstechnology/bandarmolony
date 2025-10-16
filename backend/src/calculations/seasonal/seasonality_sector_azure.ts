// seasonality_sector_azure.ts
// Azure-integrated version of seasonality sector calculation

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

export async function loadStockData(sector: string, ticker: string): Promise<StockData[]> {
  const stockPath = `stock/${sector}/${ticker}.csv`;
  
  try {
    const csvContent = await downloadText(stockPath);
    return parseCsvContent(csvContent);
  } catch (error) {
    return [];
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

export async function calculateSectorReturns(sector: string, tickers: string[]): Promise<MonthlyReturns> {
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
    
    if (currentDate && previousDate) {
      const currentPrice = sectorPrices[currentDate];
      const previousPrice = sectorPrices[previousDate];
      
      if (currentPrice && previousPrice && previousPrice !== 0) {
        const dailyReturn = (currentPrice - previousPrice) / previousPrice;
        
        const date = new Date(currentDate);
        const month = date.getMonth() + 1; // getMonth() returns 0-11, we want 1-12
        
        if (month >= 1 && month <= 12 && sectorMonthlyReturns[month]) {
          sectorMonthlyReturns[month].push(dailyReturn);
        }
      }
    }
  }
  
  // Calculate average monthly returns
  const avgMonthlyReturns: MonthlyReturns = {};
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  for (let i = 1; i <= 12; i++) {
    const returns = sectorMonthlyReturns[i];
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

export async function getSectorComposition(sector: string): Promise<string[]> {
  try {
    const azureFiles = await listPaths({ prefix: `stock/${sector}/` });
    const stocks = azureFiles
      .filter(file => file.toLowerCase().endsWith('.csv'))
      .map(file => file.split('/').pop()?.replace('.csv', '') || '')
      .filter(name => name !== '');
    
    return stocks;
  } catch (error) {
    console.warn(`⚠️ Warning: Could not read sector ${sector}: ${error}`);
    return [];
  }
}

export async function generateSectorSeasonalityData(sector: string): Promise<SectorSeasonalityData> {
  const composition = await getSectorComposition(sector);
  const monthlyReturns = await calculateSectorReturns(sector, composition);
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

export async function getAllSectors(): Promise<string[]> {
  try {
    const azureFiles = await listPaths({ prefix: 'stock/' });
    const sectors = new Set<string>();
    
    azureFiles.forEach(file => {
      const parts = file.split('/');
      if (parts.length >= 2 && parts[0] === 'stock' && parts[1]) {
        sectors.add(parts[1]);
      }
    });
    
    return Array.from(sectors).sort();
  } catch (error) {
    console.error(`❌ Error reading sectors: ${error}`);
    return [];
  }
}

export async function generateAllSectorsSeasonality(): Promise<SeasonalityResults> {
  const allSectors = await getAllSectors();
  const sectorsData: SectorSeasonalityData[] = [];
  
  console.log(`📊 Processing ${allSectors.length} sectors...`);
  
  for (let index = 0; index < allSectors.length; index++) {
    const sector = allSectors[index];
    if (sector) {
      try {
        console.log(`Processing ${index + 1}/${allSectors.length}: ${sector}`);
        const seasonalityData = await generateSectorSeasonalityData(sector);
        sectorsData.push(seasonalityData);
      } catch (error) {
        console.warn(`⚠️ Warning: Could not process sector ${sector}: ${error}`);
      }
    }
  }
  
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

