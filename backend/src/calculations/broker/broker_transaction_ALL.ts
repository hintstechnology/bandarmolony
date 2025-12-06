import { uploadText, listPaths, exists, downloadText as downloadTextUtil } from '../../utils/azureBlob';
import { BATCH_SIZE_PHASE_5, MAX_CONCURRENT_REQUESTS_PHASE_5 } from '../../services/dataUpdateService';

// Progress tracker interface for thread-safe broker counting
interface ProgressTracker {
  totalBrokers: number;
  processedBrokers: number;
  logId: string | null;
  updateProgress: () => Promise<void>;
}

// Helper function to limit concurrency for Phase 5-6
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

// Sector mapping cache - loaded from csv_input/sector_mapping.csv
let SECTOR_MAPPING: { [key: string]: string[] } = {};

/**
 * Build sector mapping from csv_input/sector_mapping.csv
 */
async function buildSectorMappingFromCsv(): Promise<void> {
  try {
    console.log('🔍 Building sector mapping from csv_input/sector_mapping.csv...');
    
    // Reset mapping
    Object.keys(SECTOR_MAPPING).forEach(sector => {
      SECTOR_MAPPING[sector] = [];
    });
    
    // Load sector mapping from CSV file
    const csvData = await downloadTextUtil('csv_input/sector_mapping.csv');
    const lines = csvData.split('\n');
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line || line.trim().length === 0) continue;
      
      const parts = line.split(',');
      if (parts.length >= 2) {
        const sector = parts[0]?.trim();
        const emiten = parts[1]?.trim();
        
        if (sector && emiten && emiten.length === 4) {
          if (!SECTOR_MAPPING[sector]) {
            SECTOR_MAPPING[sector] = [];
          }
          if (!SECTOR_MAPPING[sector].includes(emiten)) {
            SECTOR_MAPPING[sector].push(emiten);
          }
        }
      }
    }
    
    console.log('📊 Sector mapping built successfully from CSV');
    console.log(`📊 Found ${Object.keys(SECTOR_MAPPING).length} sectors with total ${Object.values(SECTOR_MAPPING).flat().length} emitens`);
  } catch (error) {
    console.warn('⚠️ Could not build sector mapping from CSV:', error);
    console.log('⚠️ Using empty sector mapping');
    SECTOR_MAPPING = {};
  }
}

// Type definitions for broker transaction data
interface BrokerTransactionData {
  Emiten: string;
  // Buy side (when broker is buyer - BRK_COD1)
  BuyerVol: number;
  BuyerValue: number;
  BuyerAvg: number;
  BuyerFreq: number; // Count of unique TRX_CODE
  OldBuyerOrdNum: number; // Unique count of TRX_ORD1
  BuyerOrdNum: number; // Unique count after grouping by time after 08:58:00
  BLot: number; // Buyer Lot (BuyerVol / 100)
  BLotPerFreq: number; // Buyer Lot per Frequency (BLot / BuyerFreq)
  BLotPerOrdNum: number; // Buyer Lot per Order Number (BLot / BuyerOrdNum)
  // Sell side (when broker is seller - BRK_COD2)
  SellerVol: number;
  SellerValue: number;
  SellerAvg: number;
  SellerFreq: number; // Count of unique TRX_CODE
  OldSellerOrdNum: number; // Unique count of TRX_ORD2
  SellerOrdNum: number; // Unique count after grouping by time after 08:58:00
  SLot: number; // Seller Lot (SellerVol / 100)
  SLotPerFreq: number; // Seller Lot per Frequency (SLot / SellerFreq)
  SLotPerOrdNum: number; // Seller Lot per Order Number (SLot / SellerOrdNum)
  // Net Buy
  NetBuyVol: number;
  NetBuyValue: number;
  NetBuyAvg: number;
  NetBuyFreq: number; // BuyerFreq - SellerFreq (can be negative)
  NetBuyOrdNum: number; // BuyerOrdNum - SellerOrdNum (can be negative)
  NBLot: number; // Net Buy Lot (NetBuyVol / 100)
  NBLotPerFreq: number; // Net Buy Lot per Frequency (NBLot / |NetBuyFreq|)
  NBLotPerOrdNum: number; // Net Buy Lot per Order Number (NBLot / |NetBuyOrdNum|)
  // Net Sell
  NetSellVol: number;
  NetSellValue: number;
  NetSellAvg: number;
  NetSellFreq: number; // SellerFreq - BuyerFreq (can be negative)
  NetSellOrdNum: number; // SellerOrdNum - BuyerOrdNum (can be negative)
  NSLot: number; // Net Sell Lot (NetSellVol / 100)
  NSLotPerFreq: number; // Net Sell Lot per Frequency (NSLot / |NetSellFreq|)
  NSLotPerOrdNum: number; // Net Sell Lot per Order Number (NSLot / |NetSellOrdNum|)
}

export class BrokerTransactionALLCalculator {
  constructor() {}

  /**
   * Read CSV file and parse broker transaction data
   */
  private parseCSV(csvContent: string): BrokerTransactionData[] {
    const lines = csvContent.trim().split('\n');
    if (lines.length < 2) {
      return [];
    }

    const headers = (lines[0] || '').split(',').map(h => h.trim());
    const brokerData: BrokerTransactionData[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = (lines[i] || '').split(',').map(v => v.trim());
      if (values.length !== headers.length) {
        continue;
      }

      const row: any = {};
      headers.forEach((header, index) => {
        const value = values[index];
        // Convert numeric fields
        if (['BuyerVol', 'BuyerValue', 'BuyerAvg', 'BuyerFreq', 'OldBuyerOrdNum', 'BuyerOrdNum', 'BLot', 'BLotPerFreq', 'BLotPerOrdNum',
             'SellerVol', 'SellerValue', 'SellerAvg', 'SellerFreq', 'OldSellerOrdNum', 'SellerOrdNum', 'SLot', 'SLotPerFreq', 'SLotPerOrdNum',
             'NetBuyVol', 'NetBuyValue', 'NetBuyAvg', 'NetBuyFreq', 'NetBuyOrdNum', 'NBLot', 'NBLotPerFreq', 'NBLotPerOrdNum',
             'NetSellVol', 'NetSellValue', 'NetSellAvg', 'NetSellFreq', 'NetSellOrdNum', 'NSLot', 'NSLotPerFreq', 'NSLotPerOrdNum'].includes(header)) {
          row[header] = parseFloat(value || '0') || 0;
        } else {
          row[header] = value || '';
        }
      });

      brokerData.push({
        Emiten: row.Emiten || '',
        BuyerVol: row.BuyerVol || 0,
        BuyerValue: row.BuyerValue || 0,
        BuyerAvg: row.BuyerAvg || 0,
        BuyerFreq: row.BuyerFreq || 0,
        OldBuyerOrdNum: row.OldBuyerOrdNum || 0,
        BuyerOrdNum: row.BuyerOrdNum || 0,
        BLot: row.BLot || 0,
        BLotPerFreq: row.BLotPerFreq || 0,
        BLotPerOrdNum: row.BLotPerOrdNum || 0,
        SellerVol: row.SellerVol || 0,
        SellerValue: row.SellerValue || 0,
        SellerAvg: row.SellerAvg || 0,
        SellerFreq: row.SellerFreq || 0,
        OldSellerOrdNum: row.OldSellerOrdNum || 0,
        SellerOrdNum: row.SellerOrdNum || 0,
        SLot: row.SLot || 0,
        SLotPerFreq: row.SLotPerFreq || 0,
        SLotPerOrdNum: row.SLotPerOrdNum || 0,
        NetBuyVol: row.NetBuyVol || 0,
        NetBuyValue: row.NetBuyValue || 0,
        NetBuyAvg: row.NetBuyAvg || 0,
        NetBuyFreq: row.NetBuyFreq || 0,
        NetBuyOrdNum: row.NetBuyOrdNum || 0,
        NBLot: row.NBLot || 0,
        NBLotPerFreq: row.NBLotPerFreq || 0,
        NBLotPerOrdNum: row.NBLotPerOrdNum || 0,
        NetSellVol: row.NetSellVol || 0,
        NetSellValue: row.NetSellValue || 0,
        NetSellAvg: row.NetSellAvg || 0,
        NetSellFreq: row.NetSellFreq || 0,
        NetSellOrdNum: row.NetSellOrdNum || 0,
        NSLot: row.NSLot || 0,
        NSLotPerFreq: row.NSLotPerFreq || 0,
        NSLotPerOrdNum: row.NSLotPerOrdNum || 0
      });
    }

    return brokerData;
  }

  /**
   * Convert BrokerTransactionData array to CSV string
   */
  private convertToCSV(data: BrokerTransactionData[]): string {
    if (data.length === 0) {
      return 'Emiten,BuyerVol,BuyerValue,BuyerAvg,BuyerFreq,OldBuyerOrdNum,BuyerOrdNum,BLot,BLotPerFreq,BLotPerOrdNum,SellerVol,SellerValue,SellerAvg,SellerFreq,OldSellerOrdNum,SellerOrdNum,SLot,SLotPerFreq,SLotPerOrdNum,NetBuyVol,NetBuyValue,NetBuyAvg,NetBuyFreq,NetBuyOrdNum,NBLot,NBLotPerFreq,NBLotPerOrdNum,NetSellVol,NetSellValue,NetSellAvg,NetSellFreq,NetSellOrdNum,NSLot,NSLotPerFreq,NSLotPerOrdNum\n';
    }

    const headers = ['Emiten', 'BuyerVol', 'BuyerValue', 'BuyerAvg', 'BuyerFreq', 'OldBuyerOrdNum', 'BuyerOrdNum', 'BLot', 'BLotPerFreq', 'BLotPerOrdNum',
                     'SellerVol', 'SellerValue', 'SellerAvg', 'SellerFreq', 'OldSellerOrdNum', 'SellerOrdNum', 'SLot', 'SLotPerFreq', 'SLotPerOrdNum',
                     'NetBuyVol', 'NetBuyValue', 'NetBuyAvg', 'NetBuyFreq', 'NetBuyOrdNum', 'NBLot', 'NBLotPerFreq', 'NBLotPerOrdNum',
                     'NetSellVol', 'NetSellValue', 'NetSellAvg', 'NetSellFreq', 'NetSellOrdNum', 'NSLot', 'NSLotPerFreq', 'NSLotPerOrdNum'];
    
    const csvLines = [
      headers.join(','),
      ...data.map(row => 
        headers.map(header => row[header as keyof BrokerTransactionData]).join(',')
      )
    ];

    return csvLines.join('\n');
  }

  /**
   * Aggregate broker transaction data across all emiten in a sector
   * Aggregates all Emiten rows from all brokers into multiple rows (one per emiten)
   * Unlike IDX which aggregates into single row, ALL keeps separate rows per emiten
   */
  private aggregateBrokerData(allBrokerData: BrokerTransactionData[]): BrokerTransactionData[] {
    // Map to aggregate data per emiten (not single row like IDX)
    const emitenMap = new Map<string, {
      BuyerVol: number;
      BuyerValue: number;
      BuyerFreq: number;
      OldBuyerOrdNum: number;
      BuyerOrdNum: number;
      BLot: number;
      SellerVol: number;
      SellerValue: number;
      SellerFreq: number;
      OldSellerOrdNum: number;
      SellerOrdNum: number;
      SLot: number;
    }>();

    // IMPORTANT: Only sum BuyerVol, BuyerValue, SellerVol, SellerValue, and frequency/order counts per emiten
    // NetBuy/NetSell will be recalculated from aggregated totals
    allBrokerData.forEach(row => {
      const emiten = row.Emiten;
      if (!emiten) return;

      const existing = emitenMap.get(emiten);
      if (existing) {
        existing.BuyerVol += row.BuyerVol || 0;
        existing.BuyerValue += row.BuyerValue || 0;
        existing.BuyerFreq += row.BuyerFreq || 0;
        existing.OldBuyerOrdNum += row.OldBuyerOrdNum || 0;
        existing.BuyerOrdNum += row.BuyerOrdNum || 0;
        existing.BLot += row.BLot || 0;
        
        existing.SellerVol += row.SellerVol || 0;
        existing.SellerValue += row.SellerValue || 0;
        existing.SellerFreq += row.SellerFreq || 0;
        existing.OldSellerOrdNum += row.OldSellerOrdNum || 0;
        existing.SellerOrdNum += row.SellerOrdNum || 0;
        existing.SLot += row.SLot || 0;
      } else {
        emitenMap.set(emiten, {
          BuyerVol: row.BuyerVol || 0,
          BuyerValue: row.BuyerValue || 0,
          BuyerFreq: row.BuyerFreq || 0,
          OldBuyerOrdNum: row.OldBuyerOrdNum || 0,
          BuyerOrdNum: row.BuyerOrdNum || 0,
          BLot: row.BLot || 0,
          SellerVol: row.SellerVol || 0,
          SellerValue: row.SellerValue || 0,
          SellerFreq: row.SellerFreq || 0,
          OldSellerOrdNum: row.OldSellerOrdNum || 0,
          SellerOrdNum: row.SellerOrdNum || 0,
          SLot: row.SLot || 0
        });
      }
    });

    // Convert aggregated data to BrokerTransactionData array
    // Recalculate NetBuy/NetSell and all averages from aggregated totals per emiten
    const aggregatedData: BrokerTransactionData[] = [];
    emitenMap.forEach((data, emiten) => {
      // Calculate NetBuy/NetSell from aggregated BuyerVol/SellerVol
      // NetBuy = Buy - Sell, if negative then 0
      // NetSell = Sell - Buy, if negative then 0
      const rawNetBuyVol = data.BuyerVol - data.SellerVol;
      const rawNetBuyValue = data.BuyerValue - data.SellerValue;
      const rawNetBuyFreq = data.BuyerFreq - data.SellerFreq;
      const rawNetBuyOrdNum = data.BuyerOrdNum - data.SellerOrdNum;
      
      let netBuyVol = 0;
      let netBuyValue = 0;
      let netBuyFreq = 0;
      let netBuyOrdNum = 0;
      let netSellVol = 0;
      let netSellValue = 0;
      let netSellFreq = 0;
      let netSellOrdNum = 0;
      
      if (rawNetBuyVol < 0 || rawNetBuyValue < 0) {
        // NetBuy is negative, so it becomes NetSell
        netSellVol = Math.abs(rawNetBuyVol);
        netSellValue = Math.abs(rawNetBuyValue);
        netSellFreq = Math.abs(rawNetBuyFreq);
        netSellOrdNum = Math.abs(rawNetBuyOrdNum);
        netBuyVol = 0;
        netBuyValue = 0;
        netBuyFreq = 0;
        netBuyOrdNum = 0;
      } else {
        // NetBuy is positive or zero, keep it and NetSell is 0
        netBuyVol = rawNetBuyVol;
        netBuyValue = rawNetBuyValue;
        netBuyFreq = rawNetBuyFreq;
        netBuyOrdNum = rawNetBuyOrdNum;
        netSellVol = 0;
        netSellValue = 0;
        netSellFreq = 0;
        netSellOrdNum = 0;
      }
      
      // Recalculate lots from volumes
      const nblot = netBuyVol / 100;
      const nslot = netSellVol / 100;

      // Recalculate averages from aggregated totals
      const buyerAvg = data.BuyerVol > 0 ? data.BuyerValue / data.BuyerVol : 0;
      const sellerAvg = data.SellerVol > 0 ? data.SellerValue / data.SellerVol : 0;
      const netBuyAvg = netBuyVol > 0 ? netBuyValue / netBuyVol : 0;
      const netSellAvg = netSellVol > 0 ? netSellValue / netSellVol : 0;

      // Recalculate lot per frequency and lot per order number
      const bLotPerFreq = data.BuyerFreq > 0 ? data.BLot / data.BuyerFreq : 0;
      const bLotPerOrdNum = data.BuyerOrdNum > 0 ? data.BLot / data.BuyerOrdNum : 0;
      const sLotPerFreq = data.SellerFreq > 0 ? data.SLot / data.SellerFreq : 0;
      const sLotPerOrdNum = data.SellerOrdNum > 0 ? data.SLot / data.SellerOrdNum : 0;
      const nbLotPerFreq = Math.abs(netBuyFreq) > 0 ? nblot / Math.abs(netBuyFreq) : 0;
      const nbLotPerOrdNum = Math.abs(netBuyOrdNum) > 0 ? nblot / Math.abs(netBuyOrdNum) : 0;
      const nsLotPerFreq = Math.abs(netSellFreq) > 0 ? nslot / Math.abs(netSellFreq) : 0;
      const nsLotPerOrdNum = Math.abs(netSellOrdNum) > 0 ? nslot / Math.abs(netSellOrdNum) : 0;

      aggregatedData.push({
        Emiten: emiten,
        BuyerVol: data.BuyerVol,
        BuyerValue: data.BuyerValue,
        BuyerAvg: buyerAvg,
        BuyerFreq: data.BuyerFreq,
        OldBuyerOrdNum: data.OldBuyerOrdNum,
        BuyerOrdNum: data.BuyerOrdNum,
        BLot: data.BLot,
        BLotPerFreq: bLotPerFreq,
        BLotPerOrdNum: bLotPerOrdNum,
        SellerVol: data.SellerVol,
        SellerValue: data.SellerValue,
        SellerAvg: sellerAvg,
        SellerFreq: data.SellerFreq,
        OldSellerOrdNum: data.OldSellerOrdNum,
        SellerOrdNum: data.SellerOrdNum,
        SLot: data.SLot,
        SLotPerFreq: sLotPerFreq,
        SLotPerOrdNum: sLotPerOrdNum,
        NetBuyVol: netBuyVol,  // Recalculated from aggregated totals
        NetBuyValue: netBuyValue,  // Recalculated from aggregated totals
        NetBuyAvg: netBuyAvg,  // Recalculated from aggregated totals
        NetBuyFreq: netBuyFreq,  // Recalculated from aggregated totals
        NetBuyOrdNum: netBuyOrdNum,  // Recalculated from aggregated totals
        NBLot: nblot,  // Recalculated from netBuyVol
        NBLotPerFreq: nbLotPerFreq,
        NBLotPerOrdNum: nbLotPerOrdNum,
        NetSellVol: netSellVol,  // Recalculated from aggregated totals
        NetSellValue: netSellValue,  // Recalculated from aggregated totals
        NetSellAvg: netSellAvg,  // Recalculated from aggregated totals
        NetSellFreq: netSellFreq,  // Recalculated from aggregated totals
        NetSellOrdNum: netSellOrdNum,  // Recalculated from aggregated totals
        NSLot: nslot,  // Recalculated from netSellVol
        NSLotPerFreq: nsLotPerFreq,
        NSLotPerOrdNum: nsLotPerOrdNum
      });
    });

    // Sort by NetBuyValue descending
    aggregatedData.sort((a, b) => b.NetBuyValue - a.NetBuyValue);

    return aggregatedData;
  }

  /**
   * Generate ALL.csv for a specific date, sector, and optional parameters
   * Aggregates all emiten from all brokers in the sector into ALL.csv file (one row per emiten)
   * @param dateSuffix Date string in format YYYYMMDD
   * @param sectorName Sector name (e.g., 'BANK', 'MINING')
   * @param investorType Optional: 'D' (Domestik), 'F' (Foreign), or '' (all)
   * @param marketType Optional: 'RG', 'TN', 'NG', or '' (all)
   */
  public async generateALL(
    dateSuffix: string,
    sectorName: string,
    investorType: 'D' | 'F' | '' = '',
    marketType: 'RG' | 'TN' | 'NG' | '' = '',
    progressTracker?: ProgressTracker
  ): Promise<{ success: boolean; message: string; file?: string; brokerCount?: number }> {
    try {
      // Validate dateSuffix format (YYYYMMDD - 8 digits)
      if (!dateSuffix || !/^\d{8}$/.test(dateSuffix)) {
        const errorMsg = `Invalid dateSuffix format: ${dateSuffix}. Expected YYYYMMDD (8 digits)`;
        console.error(`❌ ${errorMsg}`);
        return {
          success: false,
          message: errorMsg
        };
      }

      // Validate investorType
      if (investorType && !['D', 'F', ''].includes(investorType)) {
        const errorMsg = `Invalid investorType: ${investorType}. Expected 'D', 'F', or ''`;
        console.error(`❌ ${errorMsg}`);
        return {
          success: false,
          message: errorMsg
        };
      }

      // Validate marketType
      if (marketType && !['RG', 'TN', 'NG', ''].includes(marketType)) {
        const errorMsg = `Invalid marketType: ${marketType}. Expected 'RG', 'TN', 'NG', or ''`;
        console.error(`❌ ${errorMsg}`);
        return {
          success: false,
          message: errorMsg
        };
      }

      // Build sector mapping if not already loaded
      if (Object.keys(SECTOR_MAPPING).length === 0) {
        await buildSectorMappingFromCsv();
      }

      // Get stocks in this sector
      const stocksInSector = SECTOR_MAPPING[sectorName] || [];
      
      if (stocksInSector.length === 0) {
        console.log(`⚠️ No stocks found for sector: ${sectorName}`);
        return {
          success: false,
          message: `No stocks found for sector: ${sectorName}`
        };
      }

      console.log(`📊 Sector ${sectorName} has ${stocksInSector.length} stocks: ${stocksInSector.slice(0, 5).join(', ')}${stocksInSector.length > 5 ? '...' : ''}`);

      // Determine folder path based on parameters
      // Path structure follows: broker_transaction_{market}_{inv}/broker_transaction_{market}_{inv}_{date}/
      // Or: broker_transaction_{market}/broker_transaction_{market}_{date}/ (if no inv)
      // Or: broker_transaction_{inv}/broker_transaction_{inv}_{date}/ (if no market)
      // Or: broker_transaction/broker_transaction_{date}/ (if no filters)
      let folderPrefix: string;
      if (investorType && marketType) {
        // broker_transaction_{market}_{inv}/broker_transaction_{market}_{inv}_{date}/
        const invPrefix = investorType === 'D' ? 'd' : 'f';
        const marketLower = marketType.toLowerCase();
        folderPrefix = `broker_transaction_${marketLower}_${invPrefix}/broker_transaction_${marketLower}_${invPrefix}_${dateSuffix}`;
      } else if (investorType) {
        // broker_transaction_{inv}/broker_transaction_{inv}_{date}/
        const invPrefix = investorType === 'D' ? 'd' : 'f';
        folderPrefix = `broker_transaction_${invPrefix}/broker_transaction_${invPrefix}_${dateSuffix}`;
      } else if (marketType) {
        // broker_transaction_{market}/broker_transaction_{market}_{date}/
        const marketLower = marketType.toLowerCase();
        folderPrefix = `broker_transaction_${marketLower}/broker_transaction_${marketLower}_${dateSuffix}`;
      } else {
        // broker_transaction/broker_transaction_{date}/
        folderPrefix = `broker_transaction/broker_transaction_${dateSuffix}`;
      }

      // Check if ALL.csv already exists - skip if exists
      const allFilePath = `${folderPrefix}/${sectorName}_ALL.csv`;
      try {
        const allExists = await exists(allFilePath);
        if (allExists) {
          console.log(`⏭️ Skipping ${allFilePath} - ${sectorName}_ALL.csv already exists`);
          return {
            success: true,
            message: `${sectorName}_ALL.csv already exists for ${dateSuffix} (${investorType || 'all'}, ${marketType || 'all'})`,
            file: allFilePath
          };
        }
      } catch (error) {
        // If check fails, continue with generation
        console.log(`ℹ️ Could not check existence of ${allFilePath}, proceeding with generation`);
      }

      // List all broker CSV files in the folder
      console.log(`🔍 Scanning for broker CSV files in: ${folderPrefix}/`);
      const allFiles = await listPaths({ prefix: `${folderPrefix}/` });
      
      // Filter for CSV files with broker codes (2-3 uppercase letters)
      // Exclude sector files, IDX.csv, and ALL.csv
      const brokerFiles = allFiles.filter(file => {
        const fileName = file.split('/').pop() || '';
        if (!fileName.endsWith('.csv')) return false;
        if (fileName.toUpperCase() === 'IDX.CSV') return false;
        if (fileName.toUpperCase() === `${sectorName.toUpperCase()}_ALL.CSV`) return false;
        if (fileName.toUpperCase() === `${sectorName.toUpperCase()}.CSV`) return false;
        
        const brokerCode = fileName.replace('.csv', '');
        // Only include valid broker codes (2-3 uppercase letters)
        return brokerCode.length >= 2 && brokerCode.length <= 3 && /^[A-Z]+$/.test(brokerCode);
      });

      if (brokerFiles.length === 0) {
        console.log(`⚠️ No broker CSV files found in ${folderPrefix}/`);
        return {
          success: false,
          message: `No broker CSV files found in ${folderPrefix}/`
        };
      }

      console.log(`📊 Found ${brokerFiles.length} broker CSV files`);

      // Batch processing configuration
      const BATCH_SIZE = BATCH_SIZE_PHASE_5; // Phase 5: 6 broker files at a time
      const MAX_CONCURRENT = MAX_CONCURRENT_REQUESTS_PHASE_5; // Phase 5: 3 concurrent

      // Read and parse all broker CSV files in batches
      const allBrokerData: BrokerTransactionData[] = [];
      
      for (let i = 0; i < brokerFiles.length; i += BATCH_SIZE) {
        const batch = brokerFiles.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(brokerFiles.length / BATCH_SIZE);
        
        console.log(`📦 Processing broker batch ${batchNum}/${totalBatches} (${batch.length} files)...`);
        
        // Process batch in parallel with concurrency limit
        const batchPromises = batch.map(async (file) => {
            try {
              // Extract brokerCode from file path
              const pathParts = file.split('/');
              const brokerCode = pathParts[pathParts.length - 1]?.replace('.csv', '') || 'unknown';
              
              // Download directly from Azure using the file path (which already includes the correct folder structure)
              const csvContent = await downloadTextUtil(file);
              if (!csvContent) {
                throw new Error(`Could not load broker transaction data from ${file}`);
              }
              
              const brokerData = this.parseCSV(csvContent);
              
              // Filter to only include stocks in this sector
              const sectorBrokerData = brokerData.filter(row => 
                stocksInSector.includes(row.Emiten)
              );
              
              return { brokerCode, brokerData: sectorBrokerData, success: true };
            } catch (error: any) {
              const brokerCode = file.split('/').pop()?.replace('.csv', '') || 'unknown';
              console.warn(`  ⚠️ Failed to process ${brokerCode}: ${error.message}`);
              return { brokerCode, brokerData: [], success: false };
            }
          });
        const batchResults = await limitConcurrency(batchPromises, MAX_CONCURRENT);
        
        // Collect results from batch (aggregate all emiten from all brokers in sector)
        batchResults.forEach((result: any) => {
          if (result && result.success) {
            allBrokerData.push(...result.brokerData);
            console.log(`  ✓ Processed ${result.brokerCode}: ${result.brokerData.length} emiten in sector`);
          }
        });
        
        // Small delay between batches to prevent overwhelming the system
        if (i + BATCH_SIZE < brokerFiles.length) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }

      if (allBrokerData.length === 0) {
        console.log(`⚠️ No broker data found for sector ${sectorName} on ${dateSuffix}`);
        return {
          success: false,
          message: `No broker data found for sector ${sectorName} on ${dateSuffix}`
        };
      }

      console.log(`📈 Total emiten records for sector ${sectorName}: ${allBrokerData.length}`);

      // Aggregate all emiten data into ALL (multiple rows, one per emiten, aggregating across all brokers)
      const aggregatedData = this.aggregateBrokerData(allBrokerData);
      console.log(`📊 Aggregated to ${aggregatedData.length} unique emitens for ${sectorName}_ALL (from ${allBrokerData.length} emiten records)`);

      // Convert to CSV (multiple rows, one per emiten)
      const csvContentOutput = this.convertToCSV(aggregatedData);

      // Save ALL.csv to the same folder
      await uploadText(allFilePath, csvContentOutput, 'text/csv');

      const brokerCount = brokerFiles.length;
      console.log(`✅ Successfully created ${allFilePath} with aggregated ${sectorName}_ALL data from ${brokerCount} brokers`);

      // Update progress tracker
      if (progressTracker && brokerCount > 0) {
        progressTracker.processedBrokers += brokerCount;
        await progressTracker.updateProgress();
      }

      return {
        success: true,
        message: `${sectorName}_ALL.csv created successfully with ${aggregatedData.length} unique emitens aggregated from ${brokerCount} brokers`,
        file: allFilePath,
        brokerCount
      };
    } catch (error: any) {
      console.error(`❌ Error generating ${sectorName}_ALL.csv:`, error);
      return {
        success: false,
        message: `Failed to generate ${sectorName}_ALL.csv: ${error.message}`
      };
    }
  }
}

