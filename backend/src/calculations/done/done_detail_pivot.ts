import { downloadText } from '../../utils/azureBlob';

interface TransactionData {
  TRX_CODE: string;
  TRX_SESS: number;
  TRX_TYPE: string;
  BRK_COD2: string;
  INV_TYP2: string;
  BRK_COD1: string;
  INV_TYP1: string;
  STK_CODE: string;
  STK_VOLM: number;
  STK_PRIC: number;
  TRX_DATE: string;
  TRX_ORD2: number;
  TRX_ORD1: number;
  TRX_TIME: number | string;
}

interface PivotRowData {
  volume: number;
  count: number;
  avgPrice?: number;
  // HAKA/HAKI calculations
  hakaVolume?: number;
  hakaValue?: number;
  hakaAvg?: number;
  hakiVolume?: number;
  hakiValue?: number;
  hakiAvg?: number;
  // OrdNum calculations
  buyerOrdNum?: number;
  sellerOrdNum?: number;
}

interface PivotData {
  [key: string]: {
    [date: string]: PivotRowData;
  };
}

interface BuyerSellerCrossData {
  [buyer: string]: {
    [seller: string]: {
      [date: string]: {
        volume: number;
        count: number;
        hakaVolume?: number;
        hakaValue?: number;
        hakiVolume?: number;
        hakiValue?: number;
      };
    };
  };
}

type PivotDimension = 
  | 'TRX_TIME' 
  | 'STK_PRIC' 
  | 'BRK_COD1' 
  | 'BRK_COD2' 
  | 'STK_CODE' 
  | 'INV_TYP1' 
  | 'INV_TYP2' 
  | 'TRX_TYPE' 
  | 'TRX_SESS'
  | 'BRK_COD1_BRK_COD2' // Cross pivot
  | 'BRK_COD2_BRK_COD1' // Seller Broker with Buyer breakdown
  | 'BRK_COD1_BRK_COD2_DETAIL' // Buyer Broker with Seller breakdown
  | 'TRX_SESS_BRK_COD1' // Session with Buyer Broker
  | 'TRX_SESS_BRK_COD2' // Session with Seller Broker
  | 'TRX_SESS_STK_CODE' // Session with Stock Code
  | 'BRK_COD1_TRX_SESS' // Buyer Broker with Session
  | 'BRK_COD2_TRX_SESS' // Seller Broker with Session
  | 'STK_CODE_TRX_SESS' // Stock Code with Session
  | 'INV_TYP1_BRK_COD1' // Buyer Investor Type with Buyer Broker
  | 'INV_TYP2_BRK_COD2' // Seller Investor Type with Seller Broker
  | 'TRX_TYPE_BRK_COD1' // Transaction Type with Buyer Broker
  | 'TRX_TYPE_BRK_COD2'; // Transaction Type with Seller Broker

interface FilterOptions {
  stockCodes?: string[];
  buyerBrokers?: string[];
  sellerBrokers?: string[];
  minPrice?: number;
  maxPrice?: number;
  dates?: string[];
}

export class DoneDetailPivotCalculator {
  private readonly OPEN_TIME = '08:58:00';

  /**
   * Check if transaction time is after market open (08:58:00)
   */
  private isAfterOpen(timeStr: number | string): boolean {
    if (!timeStr) return false;
    
    let timeNum: number;
    if (typeof timeStr === 'string') {
      // Normalize time format (handle HH:MM:SS or HHMMSS)
      const normalizedTime = timeStr.trim().replace(/:/g, '');
      if (normalizedTime.length === 6) {
        timeNum = parseInt(normalizedTime.substring(0, 4), 10); // HHMM
      } else if (normalizedTime.length >= 4) {
        timeNum = parseInt(normalizedTime.substring(0, 4), 10);
      } else {
        return false;
      }
    } else {
      // Already a number like 85800
      timeNum = Math.floor(timeStr / 100); // Convert 85800 to 858
    }
    
    // Extract HHMM from OPEN_TIME (08:58:00 -> 0858)
    const openTime = parseInt(this.OPEN_TIME.replace(/:/g, '').substring(0, 4), 10);
    return timeNum >= openTime;
  }

  /**
   * Extract time key for grouping (HH:MM:SS format)
   */
  private getTimeKey(timeStr: number | string): string {
    if (!timeStr) return '';
    
    let normalized: string;
    if (typeof timeStr === 'string') {
      normalized = timeStr.trim().replace(/:/g, '');
    } else {
      // Convert number like 85800 to string
      normalized = timeStr.toString().padStart(6, '0');
    }
    
    if (normalized.length === 6) {
      // HHMMSS -> HH:MM:SS
      return `${normalized.substring(0, 2)}:${normalized.substring(2, 4)}:${normalized.substring(4, 6)}`;
    } else if (normalized.length === 4) {
      // HHMM -> HH:MM:00
      return `${normalized.substring(0, 2)}:${normalized.substring(2, 4)}:00`;
    }
    return normalized;
  }

  /**
   * Calculate OrdNum (Order Number) for buyer and seller
   * BuyerOrdNum: unique count after grouping by time (HH:MM:SS) after 08:58:00
   * SellerOrdNum: unique count after grouping by time (HH:MM:SS) after 08:58:00
   */
  private calculateOrdNum(
    buyerTransactions: TransactionData[],
    sellerTransactions: TransactionData[],
    stockCode: string
  ): {
    buyerOrdNum: number;
    sellerOrdNum: number;
  } {

    // New Buyer OrdNum: group by time after open
    const buyerTimeGroups = new Map<string, TransactionData[]>();
    buyerTransactions.forEach(t => {
      if (this.isAfterOpen(t.TRX_TIME)) {
        const timeKey = this.getTimeKey(t.TRX_TIME);
        if (timeKey) {
          const groupKey = `${stockCode}_${timeKey}`;
          if (!buyerTimeGroups.has(groupKey)) {
            buyerTimeGroups.set(groupKey, []);
          }
          buyerTimeGroups.get(groupKey)!.push(t);
        }
      }
    });

    const buyerOrdNumsFromTimeGroups = new Set<number>();
    buyerTimeGroups.forEach((groupTransactions) => {
      const firstTransaction = groupTransactions[0];
      if (firstTransaction && firstTransaction.TRX_ORD1 > 0) {
        buyerOrdNumsFromTimeGroups.add(firstTransaction.TRX_ORD1);
      }
    });

    const buyerOrdNumsBeforeOpen = new Set<number>();
    buyerTransactions.forEach(t => {
      if (!this.isAfterOpen(t.TRX_TIME) && t.TRX_ORD1 > 0) {
        buyerOrdNumsBeforeOpen.add(t.TRX_ORD1);
      }
    });

    const allBuyerOrdNums = new Set<number>();
    buyerOrdNumsFromTimeGroups.forEach(ord => allBuyerOrdNums.add(ord));
    buyerOrdNumsBeforeOpen.forEach(ord => {
      if (!buyerOrdNumsFromTimeGroups.has(ord)) {
        allBuyerOrdNums.add(ord);
      }
    });

    // New Seller OrdNum: group by time after open
    const sellerTimeGroups = new Map<string, TransactionData[]>();
    sellerTransactions.forEach(t => {
      if (this.isAfterOpen(t.TRX_TIME)) {
        const timeKey = this.getTimeKey(t.TRX_TIME);
        if (timeKey) {
          const groupKey = `${stockCode}_${timeKey}`;
          if (!sellerTimeGroups.has(groupKey)) {
            sellerTimeGroups.set(groupKey, []);
          }
          sellerTimeGroups.get(groupKey)!.push(t);
        }
      }
    });

    const sellerOrdNumsFromTimeGroups = new Set<number>();
    sellerTimeGroups.forEach((groupTransactions) => {
      const firstTransaction = groupTransactions[0];
      if (firstTransaction && firstTransaction.TRX_ORD2 > 0) {
        sellerOrdNumsFromTimeGroups.add(firstTransaction.TRX_ORD2);
      }
    });

    const sellerOrdNumsBeforeOpen = new Set<number>();
    sellerTransactions.forEach(t => {
      if (!this.isAfterOpen(t.TRX_TIME) && t.TRX_ORD2 > 0) {
        sellerOrdNumsBeforeOpen.add(t.TRX_ORD2);
      }
    });

    const allSellerOrdNums = new Set<number>();
    sellerOrdNumsFromTimeGroups.forEach(ord => allSellerOrdNums.add(ord));
    sellerOrdNumsBeforeOpen.forEach(ord => {
      if (!sellerOrdNumsFromTimeGroups.has(ord)) {
        allSellerOrdNums.add(ord);
      }
    });

    return {
      buyerOrdNum: allBuyerOrdNums.size,
      sellerOrdNum: allSellerOrdNums.size,
    };
  }

  /**
   * Parse CSV content to array of TransactionData
   */
  private parseCsvContent(csvContent: string): TransactionData[] {
    const lines = csvContent.trim().split('\n');
    if (lines.length < 2) return [];

    const headers = lines[0]?.split(';').map(h => h.trim()) || [];
    const getColumnIndex = (columnName: string): number => {
      return headers.findIndex(col => col.trim() === columnName);
    };

    const indices = {
      TRX_CODE: getColumnIndex('TRX_CODE'),
      TRX_SESS: getColumnIndex('TRX_SESS'),
      TRX_TYPE: getColumnIndex('TRX_TYPE'),
      BRK_COD2: getColumnIndex('BRK_COD2'),
      INV_TYP2: getColumnIndex('INV_TYP2'),
      BRK_COD1: getColumnIndex('BRK_COD1'),
      INV_TYP1: getColumnIndex('INV_TYP1'),
      STK_CODE: getColumnIndex('STK_CODE'),
      STK_VOLM: getColumnIndex('STK_VOLM'),
      STK_PRIC: getColumnIndex('STK_PRIC'),
      TRX_DATE: getColumnIndex('TRX_DATE'),
      TRX_ORD2: getColumnIndex('TRX_ORD2'),
      TRX_ORD1: getColumnIndex('TRX_ORD1'),
      TRX_TIME: getColumnIndex('TRX_TIME'),
    };

    const data: TransactionData[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line || line.trim().length === 0) continue;

      const values = line.split(';');
      if (values.length < headers.length) continue;

      const getValue = (idx: number) => values[idx]?.trim() || '';

      const stockCode = getValue(indices.STK_CODE);
      
      // Filter hanya kode emiten 4 huruf
      if (stockCode.length !== 4) {
        continue;
      }

      data.push({
        TRX_CODE: getValue(indices.TRX_CODE),
        TRX_SESS: parseInt(getValue(indices.TRX_SESS), 10) || 0,
        TRX_TYPE: getValue(indices.TRX_TYPE),
        BRK_COD2: getValue(indices.BRK_COD2),
        INV_TYP2: getValue(indices.INV_TYP2),
        BRK_COD1: getValue(indices.BRK_COD1),
        INV_TYP1: getValue(indices.INV_TYP1),
        STK_CODE: stockCode,
        STK_VOLM: parseFloat(getValue(indices.STK_VOLM)) || 0,
        STK_PRIC: parseFloat(getValue(indices.STK_PRIC)) || 0,
        TRX_DATE: getValue(indices.TRX_DATE),
        TRX_ORD2: parseInt(getValue(indices.TRX_ORD2), 10) || 0,
        TRX_ORD1: parseInt(getValue(indices.TRX_ORD1), 10) || 0,
        TRX_TIME: getValue(indices.TRX_TIME),
      });
    }

    return data;
  }

  /**
   * Get pivot key from transaction based on dimension
   */
  private getPivotKey(tx: TransactionData, dimension: PivotDimension): string {
    switch (dimension) {
      case 'TRX_TIME':
        return this.getTimeKey(tx.TRX_TIME);
      case 'STK_PRIC':
        return tx.STK_PRIC?.toString() || '0';
      case 'BRK_COD1':
        return tx.BRK_COD1 || 'UNKNOWN';
      case 'BRK_COD2':
        return tx.BRK_COD2 || 'UNKNOWN';
      case 'STK_CODE':
        return tx.STK_CODE || 'UNKNOWN';
      case 'INV_TYP1':
        return tx.INV_TYP1 || 'UNKNOWN';
      case 'INV_TYP2':
        return tx.INV_TYP2 || 'UNKNOWN';
      case 'TRX_TYPE':
        return tx.TRX_TYPE || 'UNKNOWN';
      case 'TRX_SESS':
        return tx.TRX_SESS?.toString() || '0';
      case 'BRK_COD1_BRK_COD2':
        return `${tx.BRK_COD1 || 'UNKNOWN'}_${tx.BRK_COD2 || 'UNKNOWN'}`;
      case 'BRK_COD2_BRK_COD1':
        return `${tx.BRK_COD2 || 'UNKNOWN'}_${tx.BRK_COD1 || 'UNKNOWN'}`;
      case 'BRK_COD1_BRK_COD2_DETAIL':
        return `${tx.BRK_COD1 || 'UNKNOWN'}_${tx.BRK_COD2 || 'UNKNOWN'}`;
      case 'TRX_SESS_BRK_COD1':
        return `${tx.TRX_SESS || '0'}_${tx.BRK_COD1 || 'UNKNOWN'}`;
      case 'TRX_SESS_BRK_COD2':
        return `${tx.TRX_SESS || '0'}_${tx.BRK_COD2 || 'UNKNOWN'}`;
      case 'TRX_SESS_STK_CODE':
        return `${tx.TRX_SESS || '0'}_${tx.STK_CODE || 'UNKNOWN'}`;
      case 'BRK_COD1_TRX_SESS':
        return `${tx.BRK_COD1 || 'UNKNOWN'}_${tx.TRX_SESS || '0'}`;
      case 'BRK_COD2_TRX_SESS':
        return `${tx.BRK_COD2 || 'UNKNOWN'}_${tx.TRX_SESS || '0'}`;
      case 'STK_CODE_TRX_SESS':
        return `${tx.STK_CODE || 'UNKNOWN'}_${tx.TRX_SESS || '0'}`;
      case 'INV_TYP1_BRK_COD1':
        return `${tx.INV_TYP1 || 'UNKNOWN'}_${tx.BRK_COD1 || 'UNKNOWN'}`;
      case 'INV_TYP2_BRK_COD2':
        return `${tx.INV_TYP2 || 'UNKNOWN'}_${tx.BRK_COD2 || 'UNKNOWN'}`;
      case 'TRX_TYPE_BRK_COD1':
        return `${tx.TRX_TYPE || 'UNKNOWN'}_${tx.BRK_COD1 || 'UNKNOWN'}`;
      case 'TRX_TYPE_BRK_COD2':
        return `${tx.TRX_TYPE || 'UNKNOWN'}_${tx.BRK_COD2 || 'UNKNOWN'}`;
      default:
        return 'UNKNOWN';
    }
  }

  /**
   * Filter transactions based on filter options
   */
  private filterTransactions(transactions: TransactionData[], filters: FilterOptions): TransactionData[] {
    return transactions.filter(tx => {
      if (filters.stockCodes && filters.stockCodes.length > 0 && !filters.stockCodes.includes(tx.STK_CODE)) {
        return false;
      }
      if (filters.buyerBrokers && filters.buyerBrokers.length > 0 && !filters.buyerBrokers.includes(tx.BRK_COD1)) {
        return false;
      }
      if (filters.sellerBrokers && filters.sellerBrokers.length > 0 && !filters.sellerBrokers.includes(tx.BRK_COD2)) {
        return false;
      }
      if (filters.minPrice !== undefined && tx.STK_PRIC < filters.minPrice) {
        return false;
      }
      if (filters.maxPrice !== undefined && tx.STK_PRIC > filters.maxPrice) {
        return false;
      }
      if (filters.dates && filters.dates.length > 0 && !filters.dates.includes(tx.TRX_DATE)) {
        return false;
      }
      return true;
    });
  }

  /**
   * Load transaction data for stock and dates
   */
  private async loadTransactionData(
    stockCode: string,
    dates: string[]
  ): Promise<{ [date: string]: TransactionData[] }> {
    const dataByDate: { [date: string]: TransactionData[] } = {};

    for (const date of dates) {
      try {
        const dateFormatted = date.replace(/-/g, '');
        const filePath = `done_detail/${dateFormatted}/${stockCode}.csv`;
        const csvContent = await downloadText(filePath);
        dataByDate[date] = this.parseCsvContent(csvContent);
      } catch (error) {
        console.log(`File not found for ${date}:`, error);
        dataByDate[date] = [];
      }
    }

    return dataByDate;
  }

  /**
   * Generic pivot function that works for all dimensions
   */
  async createPivot(
    stockCode: string,
    dates: string[],
    dimension: PivotDimension,
    filters: FilterOptions = {}
  ): Promise<PivotData> {
    const dataByDate = await this.loadTransactionData(stockCode, dates);
    const pivot: PivotData = {};

    // Group by date first
    const transactionsByDate = new Map<string, TransactionData[]>();
    dates.forEach(date => {
      const transactions = dataByDate[date] || [];
      const filtered = this.filterTransactions(transactions, filters);
      transactionsByDate.set(date, filtered);
    });

    // Process each date
    transactionsByDate.forEach((dateTransactions, date) => {
      dateTransactions.forEach(tx => {
        const pivotKey = this.getPivotKey(tx, dimension);
        
        if (!pivot[pivotKey]) {
          pivot[pivotKey] = {};
        }
        if (!pivot[pivotKey][date]) {
          pivot[pivotKey][date] = {
            volume: 0,
            count: 0,
            avgPrice: 0,
            hakaVolume: 0,
            hakaValue: 0,
            hakiVolume: 0,
            hakiValue: 0,
            buyerOrdNum: 0,
            sellerOrdNum: 0,
          };
        }

        const volume = tx.STK_VOLM || 0;
        const price = tx.STK_PRIC || 0;
        const value = volume * price;

        pivot[pivotKey][date].volume += volume;
        pivot[pivotKey][date].count += 1;

        const isBid = tx.TRX_ORD1 > tx.TRX_ORD2;
        if (isBid) {
          pivot[pivotKey][date].hakaVolume! += volume;
          pivot[pivotKey][date].hakaValue! += value;
        } else {
          pivot[pivotKey][date].hakiVolume! += volume;
          pivot[pivotKey][date].hakiValue! += value;
        }
      });

      // Calculate averages and OrdNum for each pivot key
      Object.keys(pivot).forEach(pivotKey => {
        const keyTransactions = dateTransactions.filter(tx => this.getPivotKey(tx, dimension) === pivotKey);
        
        if (keyTransactions.length > 0) {
          const data = pivot[pivotKey]?.[date];
          if (!data) return;

          const totalValue = keyTransactions.reduce((sum, tx) => sum + (tx.STK_PRIC * tx.STK_VOLM), 0);
          const totalVolume = keyTransactions.reduce((sum, tx) => sum + tx.STK_VOLM, 0);
          data.avgPrice = totalVolume > 0 ? totalValue / totalVolume : 0;
          data.hakaAvg = data.hakaVolume! > 0 ? data.hakaValue! / data.hakaVolume! : 0;
          data.hakiAvg = data.hakiVolume! > 0 ? data.hakiValue! / data.hakiVolume! : 0;

          // Calculate OrdNum if dimension is broker-related
          if (dimension === 'BRK_COD1' || dimension === 'BRK_COD1_BRK_COD2' || dimension === 'BRK_COD1_BRK_COD2_DETAIL' ||
              dimension === 'BRK_COD1_TRX_SESS' || dimension === 'INV_TYP1_BRK_COD1' || dimension === 'TRX_TYPE_BRK_COD1') {
            const buyerTransactions = keyTransactions.filter(t => {
              const keyParts = pivotKey.split('_');
              if (dimension === 'BRK_COD1_TRX_SESS') {
                return t.BRK_COD1 === keyParts[0];
              } else if (dimension === 'INV_TYP1_BRK_COD1') {
                return t.BRK_COD1 === keyParts[1];
              } else if (dimension === 'TRX_TYPE_BRK_COD1') {
                return t.BRK_COD1 === keyParts[1];
              }
              return t.BRK_COD1 === pivotKey.split('_')[0];
            });
            const sellerTransactions: TransactionData[] = [];
            const ordNum = this.calculateOrdNum(buyerTransactions, sellerTransactions, stockCode);
            data.buyerOrdNum = ordNum.buyerOrdNum;
          } else if (dimension === 'BRK_COD2' || dimension === 'BRK_COD2_BRK_COD1' ||
                     dimension === 'BRK_COD2_TRX_SESS' || dimension === 'INV_TYP2_BRK_COD2' || dimension === 'TRX_TYPE_BRK_COD2') {
            const buyerTransactions: TransactionData[] = [];
            const sellerTransactions = keyTransactions.filter(t => {
              const keyParts = pivotKey.split('_');
              if (dimension === 'BRK_COD2_BRK_COD1') {
                return t.BRK_COD2 === keyParts[0];
              } else if (dimension === 'BRK_COD2_TRX_SESS') {
                return t.BRK_COD2 === keyParts[0];
              } else if (dimension === 'INV_TYP2_BRK_COD2') {
                return t.BRK_COD2 === keyParts[1];
              } else if (dimension === 'TRX_TYPE_BRK_COD2') {
                return t.BRK_COD2 === keyParts[1];
              }
              return t.BRK_COD2 === pivotKey;
            });
            const ordNum = this.calculateOrdNum(buyerTransactions, sellerTransactions, stockCode);
            data.sellerOrdNum = ordNum.sellerOrdNum;
          }
        }
      });
    });

    return pivot;
  }

  /**
   * Pivot by Time (wrapper for backward compatibility)
   */
  async pivotByTime(
    stockCode: string,
    dates: string[]
  ): Promise<PivotData> {
    return this.createPivot(stockCode, dates, 'TRX_TIME');
  }

  /**
   * Pivot by Buyer Broker (wrapper for backward compatibility)
   */
  async pivotByBuyerBroker(
    stockCode: string,
    dates: string[]
  ): Promise<PivotData> {
    return this.createPivot(stockCode, dates, 'BRK_COD1');
  }

  /**
   * Pivot by Seller Broker (wrapper for backward compatibility)
   */
  async pivotBySellerBroker(
    stockCode: string,
    dates: string[]
  ): Promise<PivotData> {
    return this.createPivot(stockCode, dates, 'BRK_COD2');
  }

  /**
   * Pivot by Price (wrapper for backward compatibility)
   */
  async pivotByPrice(
    stockCode: string,
    dates: string[]
  ): Promise<PivotData> {
    return this.createPivot(stockCode, dates, 'STK_PRIC');
  }

  /**
   * Pivot by Buyer-Seller Cross
   */
  async pivotByBuyerSellerCross(
    stockCode: string,
    dates: string[]
  ): Promise<BuyerSellerCrossData> {
    const dataByDate = await this.loadTransactionData(stockCode, dates);
    const pivot: BuyerSellerCrossData = {};

    dates.forEach(date => {
      const transactions = dataByDate[date] || [];
      transactions.forEach(tx => {
        const buyer = tx.BRK_COD1 || 'UNKNOWN';
        const seller = tx.BRK_COD2 || 'UNKNOWN';
        
        if (!pivot[buyer]) {
          pivot[buyer] = {};
        }
        if (!pivot[buyer][seller]) {
          pivot[buyer][seller] = {};
        }
        if (!pivot[buyer][seller][date]) {
          pivot[buyer][seller][date] = {
            volume: 0,
            count: 0,
            hakaVolume: 0,
            hakaValue: 0,
            hakiVolume: 0,
            hakiValue: 0,
          };
        }

        const volume = tx.STK_VOLM || 0;
        const price = tx.STK_PRIC || 0;
        const value = volume * price;

        pivot[buyer][seller][date].volume += volume;
        pivot[buyer][seller][date].count += 1;

        // HAKA/HAKI
        const isBid = tx.TRX_ORD1 > tx.TRX_ORD2;
        if (isBid) {
          pivot[buyer][seller][date].hakaVolume! += volume;
          pivot[buyer][seller][date].hakaValue! += value;
        } else {
          pivot[buyer][seller][date].hakiVolume! += volume;
          pivot[buyer][seller][date].hakiValue! += value;
        }
      });
    });

    return pivot;
  }
}

export default DoneDetailPivotCalculator;

