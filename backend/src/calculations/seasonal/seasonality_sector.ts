// seasonality_sector.ts
// ------------------------------------------------------------
// Seasonal analysis for market sectors
// Output: CSV file dengan nama "o3-seasonal-sectors.csv" di folder seasonal_output
// ------------------------------------------------------------

import { downloadText, uploadText, listPaths, exists } from '../../utils/azureBlob';

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
    return [];
  }
  
  try {
    const csvContent = await downloadText(stockPath);
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
    
    return data.sort((a, b) => new Date(a.Date).getTime() - new Date(b.Date).getTime());
  } catch (error) {
    console.warn(`⚠️ Warning: Could not load data for ${ticker}: ${error}`);
    return [];
  }
}

/**
 * Calculate sector returns using daily returns method (same as original)
 */
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
    
    if (currentDate && previousDate) {
      const currentPrice = sectorPrices[currentDate];
      const previousPrice = sectorPrices[previousDate];
      
      if (currentPrice && previousPrice && previousPrice !== 0) {
        const dailyReturn = (currentPrice - previousPrice) / previousPrice;
        
        const date = new Date(currentDate);
        const month = date.getMonth() + 1; // getMonth() returns 0-11, we want 1-12
        
        if (sectorMonthlyReturns[month]) {
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
 * Get sector composition from Azure
 */
async function getSectorComposition(sector: string): Promise<string[]> {
  try {
    const files = await listPaths({ prefix: `stock/${sector}/` });
    const tickers = files
      .filter(f => f.startsWith(`stock/${sector}/`) && f.endsWith('.csv'))
      .map(f => f.replace(`stock/${sector}/`, '').replace('.csv', ''));
    
    return tickers;
  } catch (error) {
    console.warn(`⚠️ Warning: Could not read sector ${sector}: ${error}`);
    return [];
  }
}

/**
 * Generate seasonality data for a single sector
 */
async function generateSectorSeasonalityData(sector: string): Promise<SectorSeasonalityData> {
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
 * Get all sectors from Azure
 */
async function getAllSectors(): Promise<string[]> {
  try {
    const files = await listPaths({ prefix: 'stock/' });
    const sectors = new Set<string>();
    
    for (const file of files) {
      const parts = file.split('/');
      if (parts.length >= 2) {
        const sector = parts[1];
        if (sector && sector !== '' && !sector.includes('.')) { // Exclude files, only folders
          sectors.add(sector);
        }
      }
    }
    
    return Array.from(sectors).sort();
  } catch (error) {
    console.error(`❌ Error reading sectors: ${error}`);
    return [];
  }
}

/**
 * Generate seasonality data for all sectors
 */
export async function generateAllSectorsSeasonality(): Promise<SeasonalityResults> {
  const allSectors = await getAllSectors();
  const sectorsData: SectorSeasonalityData[] = [];
  
  console.log(`📊 Processing ${allSectors.length} sectors...`);
  
  for (let i = 0; i < allSectors.length; i++) {
    const sector = allSectors[i];
    if (sector) {
      try {
        console.log(`Processing ${i + 1}/${allSectors.length}: ${sector}`);
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

/**
 * Save results to CSV and upload to Azure
 */
export async function saveSectorSeasonalityToCSV(results: SeasonalityResults): Promise<void> {
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
  
  // Upload to Azure
  const outputPath = "seasonal_output/o3-seasonal-sectors.csv";
  try {
    await uploadText(outputPath, csvContent, 'text/csv');
    console.log(`✅ Sector seasonality data saved to: ${outputPath}`);
  } catch (error) {
    console.error(`❌ Error uploading to Azure: ${error}`);
    throw error;
  }
}

/**
 * Main function to generate and save sector seasonality
 */
export async function generateSectorSeasonality(): Promise<SeasonalityResults> {
  try {
    console.log('🔄 Starting sector seasonality analysis...');
    
    const results = await generateAllSectorsSeasonality();
    
    console.log('💾 Saving to CSV...');
    await saveSectorSeasonalityToCSV(results);
    
    console.log(`✅ Sector seasonality analysis completed - ${results.sectors.length} sectors processed`);
    
    return results;
  } catch (error) {
    console.error('❌ Error in generateSectorSeasonality:', error);
    throw error;
  }
}