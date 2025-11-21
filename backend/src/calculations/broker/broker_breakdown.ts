import { downloadText, uploadText, listPaths, exists } from '../../utils/azureBlob';
import { BATCH_SIZE_PHASE_6 } from '../../services/dataUpdateService';

// Type definitions for broker breakdown data
interface TransactionData {
  STK_CODE: string;
  BRK_COD1: string; // Buyer broker
  BRK_COD2: string; // Seller broker
  STK_VOLM: number;
  STK_PRIC: number;
  TRX_CODE: string;
  TRX_TIME: string;
  TRX_TYPE: string; // Board type: RG, TN, NG
  INV_TYP1: string; // Investor type 1 (buyer) - I = Indonesia, A = Asing
  INV_TYP2: string; // Investor type 2 (seller) - I = Indonesia, A = Asing
  TRX_ORD1: number; // Order reference 1 (buyer)
  TRX_ORD2: number; // Order reference 2 (seller)
}

interface BrokerBreakdownData {
  Price: number;
  BFreq: number;    // Buy Frequency
  BLot: number;    // Buy Lot
  BLotPerFreq: number; // BLot / BFreq
  BOrd: number;    // Buy Order (unique TRX_ORD1)
  BLotPerOrd: number; // BLot / BOrd
  SLot: number;    // Sell Lot
  SFreq: number;   // Sell Frequency
  SLotPerFreq: number; // SLot / SFreq
  SOrd: number;    // Sell Order (unique TRX_ORD2)
  SLotPerOrd: number; // SLot / SOrd
  TFreq: number;   // Total Frequency
  TLot: number;    // Total Lot
  TOrd: number;    // Total Order
}

// Investor Type: D = Domestik, F = Foreign, All = All Trade (no filter)
type InvestorType = 'D' | 'F' | 'All';
// Board Type: RG = Regular, TN = Tunai, NG = Negosiasi, All = All Board (no filter)
type BoardType = 'RG' | 'TN' | 'NG' | 'All';

export class BrokerBreakdownCalculator {
  constructor() {
    // No need for Azure client initialization - using azureBlob utility
  }

  /**
   * Get investor type from INV_TYP value
   */
  private getInvestorType(invTyp: string): InvestorType | null {
    const normalized = invTyp?.trim().toUpperCase() || '';
    if (normalized === 'I') return 'D'; // Indonesia = Domestik
    if (normalized === 'A') return 'F'; // Asing = Foreign
    return null;
  }

  /**
   * Find all DT files in done-summary folder
   */
  private async findAllDtFiles(): Promise<string[]> {
    console.log("Scanning all DT files in done-summary folder...");
    
    try {
      const allFiles = await listPaths({ prefix: 'done-summary/' });
      const dtFiles = allFiles.filter(file => 
        file.includes('/DT') && file.endsWith('.csv')
      );
      
      // Sort by date descending (newest first) - process from newest to oldest
      const sortedFiles = dtFiles.sort((a, b) => {
        const dateA = a.split('/')[1] || '';
        const dateB = b.split('/')[1] || '';
        return dateB.localeCompare(dateA); // Descending order (newest first)
      });
      
      console.log(`Found ${sortedFiles.length} DT files to process (sorted newest first)`);
      return sortedFiles;
    } catch (error) {
      console.error('Error scanning DT files:', error);
      return [];
    }
  }

  /**
   * Load and process a single DT file
   */
  private async loadAndProcessSingleDtFile(blobName: string): Promise<{ data: TransactionData[], dateSuffix: string } | null> {
    try {
      console.log(`Loading DT file: ${blobName}`);
      const content = await downloadText(blobName);
      
      if (!content || content.trim().length === 0) {
        console.log(`⚠️ Empty file: ${blobName}`);
        return null;
      }
      
      // Extract date from blob name (done-summary/20251021/DT251021.csv)
      const pathParts = blobName.split('/');
      const dateFolder = pathParts[1] || 'unknown'; // 20251021
      const dateSuffix = dateFolder; // Use full date as suffix
      
      const data = this.parseTransactionData(content);
      console.log(`✅ Loaded ${data.length} transactions from ${blobName}`);
      
      return { data, dateSuffix };
    } catch (error) {
      console.log(`📄 File not found, will create new: ${blobName}`);
      return null;
    }
  }

  private parseTransactionData(content: string): TransactionData[] {
    const lines = content.trim().split('\n');
    const data: TransactionData[] = [];
    
    if (lines.length < 2) return data;
    
    // Parse header to get column indices (using semicolon separator)
    const header = lines[0]?.split(';') || [];
    console.log(`📋 CSV Header: ${header.join(', ')}`);
    
    const getColumnIndex = (columnName: string): number => {
      return header.findIndex(col => col.trim() === columnName);
    };
    
    const stkCodeIndex = getColumnIndex('STK_CODE');
    const brkCod1Index = getColumnIndex('BRK_COD1');
    const brkCod2Index = getColumnIndex('BRK_COD2');
    const stkVolmIndex = getColumnIndex('STK_VOLM');
    const stkPricIndex = getColumnIndex('STK_PRIC');
    const trxCodeIndex = getColumnIndex('TRX_CODE');
    const trxTimeIndex = getColumnIndex('TRX_TIME');
    const trxTypeIndex = getColumnIndex('TRX_TYPE');
    const invTyp1Index = getColumnIndex('INV_TYP1');
    const invTyp2Index = getColumnIndex('INV_TYP2');
    const trxOrd1Index = getColumnIndex('TRX_ORD1');
    const trxOrd2Index = getColumnIndex('TRX_ORD2');
    
    // Validate required columns exist
    if (stkCodeIndex === -1 || brkCod1Index === -1 || brkCod2Index === -1 || 
        stkVolmIndex === -1 || stkPricIndex === -1 || trxCodeIndex === -1 ||
        trxTimeIndex === -1 || trxTypeIndex === -1 || invTyp1Index === -1 || 
        invTyp2Index === -1 || trxOrd1Index === -1 || trxOrd2Index === -1) {
      console.error('❌ Required columns not found in CSV header');
      return data;
    }
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line || line.trim().length === 0) continue;
      
      const values = line.split(';');
      if (values.length < header.length) continue;
      
      const stockCode = values[stkCodeIndex]?.trim() || '';
      
      // Filter hanya kode emiten 4 huruf
      if (stockCode.length === 4) {
        const transaction: TransactionData = {
          STK_CODE: stockCode,
          BRK_COD1: values[brkCod1Index]?.trim() || '',
          BRK_COD2: values[brkCod2Index]?.trim() || '',
          STK_VOLM: parseFloat(values[stkVolmIndex]?.trim() || '0') || 0,
          STK_PRIC: parseFloat(values[stkPricIndex]?.trim() || '0') || 0,
          TRX_CODE: values[trxCodeIndex]?.trim() || '',
          TRX_TIME: values[trxTimeIndex]?.trim() || '',
          TRX_TYPE: values[trxTypeIndex]?.trim() || '',
          INV_TYP1: values[invTyp1Index]?.trim() || '',
          INV_TYP2: values[invTyp2Index]?.trim() || '',
          TRX_ORD1: parseInt(values[trxOrd1Index]?.trim() || '0', 10) || 0,
          TRX_ORD2: parseInt(values[trxOrd2Index]?.trim() || '0', 10) || 0
        };
        
        data.push(transaction);
      }
    }
    
    console.log(`📊 Loaded ${data.length} transaction records from Azure (4-character stocks only)`);
    return data;
  }

  /**
   * Filter transactions by investor type and board type
   * - investorType: 'All' = no filter, 'D' = Domestik only, 'F' = Foreign only
   * - boardType: 'All' = no filter, 'RG' = Regular only, 'TN' = Tunai only, 'NG' = Negosiasi only
   */
  private filterTransactions(
    data: TransactionData[], 
    investorType: InvestorType, 
    boardType: BoardType
  ): TransactionData[] {
    let filtered = data;

    // Filter by board type (if not 'All')
    if (boardType !== 'All') {
      filtered = filtered.filter(row => row.TRX_TYPE === boardType);
    }

    // Filter by investor type (if not 'All')
    if (investorType !== 'All') {
      filtered = filtered.filter(row => {
        // For buyer side: check INV_TYP1
        // For seller side: check INV_TYP2
        const buyerInvType = this.getInvestorType(row.INV_TYP1);
        const sellerInvType = this.getInvestorType(row.INV_TYP2);
        
        if (investorType === 'D') {
          // Domestik: INV_TYP1 = 'I' OR INV_TYP2 = 'I'
          return buyerInvType === 'D' || sellerInvType === 'D';
        } else if (investorType === 'F') {
          // Foreign: INV_TYP1 = 'A' OR INV_TYP2 = 'A'
          return buyerInvType === 'F' || sellerInvType === 'F';
        }
        return false;
      });
    }

    return filtered;
  }

  /**
   * Create broker breakdown data grouped by stock code, broker, and price level
   * Structure: emiten -> broker -> price level
   */
  private createBrokerBreakdownData(
    data: TransactionData[],
    investorType: InvestorType,
    boardType: BoardType
  ): Map<string, Map<string, BrokerBreakdownData[]>> {
    console.log(`Creating broker breakdown data by stock, broker, and price (${investorType}/${boardType})...`);
    
    // Structure: stock -> broker -> price -> data
    const stockBrokerPriceMap = new Map<string, Map<string, Map<number, {
      buyLot: number;
      buyFreq: number;
      buyOrd: Set<number>;
      sellLot: number;
      sellFreq: number;
      sellOrd: Set<number>;
    }>>>();
    
    data.forEach(row => {
      const stock = row.STK_CODE;
      const price = row.STK_PRIC;
      const volume = row.STK_VOLM;
      const isBid = row.TRX_ORD1 > row.TRX_ORD2; // HAKA -> BID, HAKI -> ASK
      
      // Get broker code based on HAKA/HAKI logic
      // BRK_COD1 is buyer, BRK_COD2 is seller
      const brokerCode = isBid ? row.BRK_COD1 : row.BRK_COD2;
      
      if (!stockBrokerPriceMap.has(stock)) {
        stockBrokerPriceMap.set(stock, new Map());
      }
      const stockMap = stockBrokerPriceMap.get(stock)!;
      
      if (!stockMap.has(brokerCode)) {
        stockMap.set(brokerCode, new Map());
      }
      const brokerMap = stockMap.get(brokerCode)!;
      
      if (!brokerMap.has(price)) {
        brokerMap.set(price, {
          buyLot: 0,
          buyFreq: 0,
          buyOrd: new Set<number>(),
          sellLot: 0,
          sellFreq: 0,
          sellOrd: new Set<number>()
        });
      }
      const priceData = brokerMap.get(price)!;
      
      // Klasifikasi BID/ASK berdasarkan HAKA/HAKI
      if (isBid) {
        // Buy side: BRK_COD1 is buyer
        priceData.buyLot += volume;
        priceData.buyFreq += 1;
        if (row.TRX_ORD1 > 0) {
          priceData.buyOrd.add(row.TRX_ORD1);
        }
      } else {
        // Sell side: BRK_COD2 is seller
        priceData.sellLot += volume;
        priceData.sellFreq += 1;
        if (row.TRX_ORD2 > 0) {
          priceData.sellOrd.add(row.TRX_ORD2);
        }
      }
    });
    
    // Convert to final structure: stock -> broker -> array of price data
    const breakdownData = new Map<string, Map<string, BrokerBreakdownData[]>>();
    
    stockBrokerPriceMap.forEach((brokerMap, stock) => {
      const stockBrokerData = new Map<string, BrokerBreakdownData[]>();
      
      brokerMap.forEach((priceMap, broker) => {
        const brokerData: BrokerBreakdownData[] = [];
        
        priceMap.forEach((priceData, price) => {
          const bLot = priceData.buyLot / 100; // Convert volume to lot
          const sLot = priceData.sellLot / 100;
          const bFreq = priceData.buyFreq;
          const sFreq = priceData.sellFreq;
          const bOrd = priceData.buyOrd.size;
          const sOrd = priceData.sellOrd.size;
          const tFreq = bFreq + sFreq;
          const tLot = bLot + sLot;
          const tOrd = bOrd + sOrd;
          
          // Calculate ratios
          const bLotPerFreq = bFreq > 0 ? bLot / bFreq : 0;
          const bLotPerOrd = bOrd > 0 ? bLot / bOrd : 0;
          const sLotPerFreq = sFreq > 0 ? sLot / sFreq : 0;
          const sLotPerOrd = sOrd > 0 ? sLot / sOrd : 0;
          
          brokerData.push({
            Price: price,
            BFreq: bFreq,
            BLot: bLot,
            BLotPerFreq: bLotPerFreq,
            BOrd: bOrd,
            BLotPerOrd: bLotPerOrd,
            SLot: sLot,
            SFreq: sFreq,
            SLotPerFreq: sLotPerFreq,
            SOrd: sOrd,
            SLotPerOrd: sLotPerOrd,
            TFreq: tFreq,
            TLot: tLot,
            TOrd: tOrd
          });
        });
        
        // Sort by price descending (highest to lowest)
        brokerData.sort((a, b) => b.Price - a.Price);
        
        stockBrokerData.set(broker, brokerData);
      });
      
      breakdownData.set(stock, stockBrokerData);
    });
    
    console.log(`Created broker breakdown data for ${breakdownData.size} stocks (${investorType}/${boardType})`);
    return breakdownData;
  }

  /**
   * Create All.csv file that aggregates all brokers for a stock
   * Calculates directly from transaction data to get accurate order counts
   */
  private createAllBrokerDataForStock(
    data: TransactionData[],
    stockCode: string
  ): BrokerBreakdownData[] {
    // Filter transactions for this stock
    const stockTransactions = data.filter(row => row.STK_CODE === stockCode);
    
    // Aggregate by price (all brokers combined)
    const priceMap = new Map<number, {
      buyLot: number;
      buyFreq: number;
      buyOrd: Set<number>;
      sellLot: number;
      sellFreq: number;
      sellOrd: Set<number>;
    }>();
    
    stockTransactions.forEach(row => {
      const price = row.STK_PRIC;
      const volume = row.STK_VOLM;
      const isBid = row.TRX_ORD1 > row.TRX_ORD2; // HAKA -> BID, HAKI -> ASK
      
      if (!priceMap.has(price)) {
        priceMap.set(price, {
          buyLot: 0,
          buyFreq: 0,
          buyOrd: new Set<number>(),
          sellLot: 0,
          sellFreq: 0,
          sellOrd: new Set<number>()
        });
      }
      const priceData = priceMap.get(price)!;
      
      if (isBid) {
        // Buy side: BRK_COD1 is buyer
        priceData.buyLot += volume;
        priceData.buyFreq += 1;
        if (row.TRX_ORD1 > 0) {
          priceData.buyOrd.add(row.TRX_ORD1);
        }
      } else {
        // Sell side: BRK_COD2 is seller
        priceData.sellLot += volume;
        priceData.sellFreq += 1;
        if (row.TRX_ORD2 > 0) {
          priceData.sellOrd.add(row.TRX_ORD2);
        }
      }
    });
    
    // Convert to BrokerBreakdownData format
    const allData: BrokerBreakdownData[] = [];
    priceMap.forEach((priceData, price) => {
      const bLot = priceData.buyLot / 100; // Convert volume to lot
      const sLot = priceData.sellLot / 100;
      const bFreq = priceData.buyFreq;
      const sFreq = priceData.sellFreq;
      const bOrd = priceData.buyOrd.size;
      const sOrd = priceData.sellOrd.size;
      const tFreq = bFreq + sFreq;
      const tLot = bLot + sLot;
      const tOrd = bOrd + sOrd;
      
      const bLotPerFreq = bFreq > 0 ? bLot / bFreq : 0;
      const bLotPerOrd = bOrd > 0 ? bLot / bOrd : 0;
      const sLotPerFreq = sFreq > 0 ? sLot / sFreq : 0;
      const sLotPerOrd = sOrd > 0 ? sLot / sOrd : 0;
      
      allData.push({
        Price: price,
        BFreq: bFreq,
        BLot: bLot,
        BLotPerFreq: bLotPerFreq,
        BOrd: bOrd,
        BLotPerOrd: bLotPerOrd,
        SLot: sLot,
        SFreq: sFreq,
        SLotPerFreq: sLotPerFreq,
        SOrd: sOrd,
        SLotPerOrd: sLotPerOrd,
        TFreq: tFreq,
        TLot: tLot,
        TOrd: tOrd
      });
    });
    
    // Sort by price descending
    allData.sort((a, b) => b.Price - a.Price);
    
    return allData;
  }

  /**
   * Save broker breakdown data to Azure Blob Storage
   */
  private async saveToAzure(filename: string, data: BrokerBreakdownData[]): Promise<string> {
    if (data.length === 0) {
      console.log(`No data to save for ${filename}`);
      return filename;
    }
    
    // Convert to CSV format
    const headers = ['Price', 'BFreq', 'BLot', 'BLot/Freq', 'BOrd', 'BLot/Ord', 'SLot', 'SFreq', 'SLot/Freq', 'SOrd', 'SLot/Ord', 'TFreq', 'TLot', 'TOrd'];
    const csvContent = [
      headers.join(','),
      ...data.map(row => [
        row.Price,
        row.BFreq,
        row.BLot,
        row.BLotPerFreq,
        row.BOrd,
        row.BLotPerOrd,
        row.SLot,
        row.SFreq,
        row.SLotPerFreq,
        row.SOrd,
        row.SLotPerOrd,
        row.TFreq,
        row.TLot,
        row.TOrd
      ].join(','))
    ].join('\n');
    
    await uploadText(filename, csvContent, 'text/csv');
    console.log(`Saved ${data.length} broker breakdown records to ${filename}`);
    return filename;
  }

  /**
   * Process a single DT file with broker breakdown analysis for all combinations
   */
  private async processSingleDtFile(blobName: string): Promise<{ success: boolean; dateSuffix: string; files: string[]; skipped?: boolean }> {
    // Extract date from blob name first (before loading input)
    const pathParts = blobName.split('/');
    const dateFolder = pathParts[1] || 'unknown'; // 20251021
    const dateSuffix = dateFolder;
    
    // Check if output already exists for this date BEFORE loading input
    try {
      const outputPrefix = `done_summary_broker_breakdown/${dateSuffix}/`;
      const existingFiles = await listPaths({ prefix: outputPrefix, maxResults: 1 });
      
      if (existingFiles.length > 0) {
        console.log(`⏭️ Broker breakdown already exists for date ${dateSuffix} - skipping (found existing files)`);
        return { success: true, dateSuffix, files: [], skipped: true };
      }
    } catch (error) {
      // If check fails, continue with processing (might be permission issue)
      console.log(`ℹ️ Could not check existence of output folder for ${dateSuffix}, proceeding with generation`);
    }
    
    // Only load input if output doesn't exist
    const result = await this.loadAndProcessSingleDtFile(blobName);
    
    if (!result) {
      return { success: false, dateSuffix: '', files: [] };
    }
    
    const { data } = result;
    
    if (data.length === 0) {
      console.log(`⚠️ No transaction data in ${blobName} - skipping`);
      return { success: false, dateSuffix, files: [] };
    }
    
    // Validate that we have valid transaction data
    const validTransactions = data.filter(t => 
      t.STK_CODE && t.STK_CODE.length === 4 && 
      t.BRK_COD1 && t.BRK_COD2 && 
      t.STK_VOLM > 0 && t.STK_PRIC > 0
    );
    
    if (validTransactions.length === 0) {
      console.log(`⚠️ No valid transaction data in ${blobName} - skipping`);
      return { success: false, dateSuffix, files: [] };
    }
    
    console.log(`📊 Valid transactions: ${validTransactions.length}/${data.length}`);
    console.log(`🔄 Processing ${blobName} (${data.length} transactions)...`);
    
    try {
      const createdFiles: string[] = [];
      
      // Process all combinations: 
      // - Investor type: All (no filter), D (Domestik), F (Foreign)
      // - Board type: All (no filter), RG (Regular), TN (Tunai), NG (Negosiasi)
      // Total: 3 x 4 = 12 combinations per stock
      const investorTypes: InvestorType[] = ['All', 'D', 'F'];
      const boardTypes: BoardType[] = ['All', 'RG', 'TN', 'NG'];
      
      for (const investorType of investorTypes) {
        for (const boardType of boardTypes) {
          // Filter transactions
          const filteredData = this.filterTransactions(validTransactions, investorType, boardType);
          
          if (filteredData.length === 0) {
            console.log(`⏭️ Skipping ${investorType}/${boardType} - no transactions`);
            continue;
          }
          
          // Create broker breakdown data
          const breakdownData = this.createBrokerBreakdownData(filteredData, investorType, boardType);
          
          // Get unique stock codes
          const uniqueStocks = new Set<string>();
          filteredData.forEach(row => uniqueStocks.add(row.STK_CODE));
          
          // Save files for each stock
          for (const stockCode of uniqueStocks) {
            // Folder structure: done_summary_broker_breakdown/{date}/{emiten}/
            const emitenFolder = stockCode;
            
            const stockBrokerData = breakdownData.get(stockCode);
            if (!stockBrokerData) continue;
            
            // File naming: {broker}_{investor}_{board}.csv or All_{investor}_{board}.csv
            const fileSuffix = investorType === 'All' && boardType === 'All' 
              ? '' 
              : `_${investorType.toLowerCase()}_${boardType.toLowerCase()}`;
            
            // Save individual broker files
            for (const [brokerCode, brokerData] of stockBrokerData) {
              const filename = `done_summary_broker_breakdown/${dateSuffix}/${emitenFolder}/${brokerCode}${fileSuffix}.csv`;
              
              // Check if file already exists
              try {
                const fileExists = await exists(filename);
                if (fileExists) {
                  console.log(`⏭️ Skipping ${filename} - file already exists`);
                  continue;
                }
              } catch (error) {
                // Continue if check fails
              }
              
              await this.saveToAzure(filename, brokerData);
              createdFiles.push(filename);
            }
            
            // Create and save All.csv (calculated directly from transaction data)
            const allData = this.createAllBrokerDataForStock(filteredData, stockCode);
            const allFilename = `done_summary_broker_breakdown/${dateSuffix}/${emitenFolder}/All${fileSuffix}.csv`;
            
            try {
              const fileExists = await exists(allFilename);
              if (!fileExists) {
                await this.saveToAzure(allFilename, allData);
                createdFiles.push(allFilename);
              } else {
                console.log(`⏭️ Skipping ${allFilename} - file already exists`);
              }
            } catch (error) {
              // Continue if check fails
            }
          }
          
          console.log(`✅ Processed ${investorType}/${boardType}: ${breakdownData.size} stocks`);
        }
      }
      
      console.log(`✅ Completed processing ${blobName} - ${createdFiles.length} files created`);
      return { success: true, dateSuffix, files: createdFiles };
      
    } catch (error) {
      console.error(`Error processing ${blobName}:`, error);
      return { success: false, dateSuffix, files: [] };
    }
  }

  /**
   * Main function to generate broker breakdown data for all DT files
   */
  public async generateBrokerBreakdownData(_dateSuffix: string): Promise<{ success: boolean; message: string; data?: any }> {
    const startTime = Date.now();
    try {
      console.log(`Starting broker breakdown analysis for all DT files...`);
      
      // Find all DT files
      const dtFiles = await this.findAllDtFiles();
      
      if (dtFiles.length === 0) {
        console.log(`⚠️ No DT files found in done-summary folder`);
        return {
          success: true,
          message: `No DT files found - skipped broker breakdown generation`,
          data: { skipped: true, reason: 'No DT files found' }
        };
      }
      
      console.log(`📊 Processing ${dtFiles.length} DT files...`);
      
      // Process files in batches
      const BATCH_SIZE = BATCH_SIZE_PHASE_6; // Phase 6: 1 file at a time
      const allResults: { success: boolean; dateSuffix: string; files: string[] }[] = [];
      let processed = 0;
      let successful = 0;
      
      for (let i = 0; i < dtFiles.length; i += BATCH_SIZE) {
        const batch = dtFiles.slice(i, i + BATCH_SIZE);
        console.log(`📦 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(dtFiles.length / BATCH_SIZE)} (${batch.length} files)`);
        
        // Process batch in parallel
        const batchResults = await Promise.allSettled(
          batch.map(blobName => this.processSingleDtFile(blobName))
        );
        
        // Force garbage collection after each batch
        if (global.gc) {
          global.gc();
        }
        
        // Collect results
        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            allResults.push(result.value);
            processed++;
            if (result.value.success) {
              successful++;
            }
          } else {
            console.error(`Error processing ${batch[index]}:`, result.reason);
            processed++;
          }
        });
        
        console.log(`📊 Batch complete: ${successful}/${processed} successful`);
        
        // Small delay between batches
        if (i + BATCH_SIZE < dtFiles.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      const totalFiles = allResults.reduce((sum, result) => sum + result.files.length, 0);
      const totalDuration = Math.round((Date.now() - startTime) / 1000);
      
      console.log(`✅ Broker breakdown analysis completed!`);
      console.log(`📊 Processed: ${processed}/${dtFiles.length} DT files`);
      console.log(`📊 Successful: ${successful}/${processed} files`);
      console.log(`📊 Total output files: ${totalFiles}`);
      console.log(`✅ Broker Breakdown calculation completed successfully`);
      console.log(`✅ Broker Breakdown completed in ${totalDuration}s`);
      
      return {
        success: true,
        message: `Broker breakdown data generated successfully for ${successful}/${processed} DT files`,
        data: {
          totalDtFiles: dtFiles.length,
          processedFiles: processed,
          successfulFiles: successful,
          totalOutputFiles: totalFiles,
          duration: totalDuration,
          results: allResults.filter(r => r.success)
        }
      };
      
    } catch (error) {
      console.error('Error generating broker breakdown data:', error);
      return {
        success: false,
        message: `Failed to generate broker breakdown data: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}

export default BrokerBreakdownCalculator;
