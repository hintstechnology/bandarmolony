import { downloadText, uploadText, listPaths } from '../../utils/azureBlob';

// Type definitions, sama seperti broker_data.ts
type TransactionType = 'RK' | 'TN' | 'NG';
interface TransactionData {
  STK_CODE: string;
  BRK_COD1: string;
  BRK_COD2: string;
  STK_VOLM: number;
  STK_PRIC: number;
  TRX_CODE: string;
  TRX_TYPE: string; // field tambahan
}

interface BrokerSummary {
  BrokerCode: string;
  BuyerVol: number;
  BuyerValue: number;
  SellerVol: number;
  SellerValue: number;
  NetBuyVol: number;
  NetBuyValue: number;
  BuyerAvg: number;
  SellerAvg: number;
}

interface BrokerTransactionData {
  Emiten: string;
  BuyerVol: number;
  BuyerValue: number;
  SellerVol: number;
  SellerValue: number;
  NetBuyVol: number;
  NetBuyValue: number;
  BuyerAvg: number;
  SellerAvg: number;
  TotalVolume: number;
  AvgPrice: number;
  TransactionCount: number;
  TotalValue: number;
}

export class BrokerDataRKTNNGCalculator {
  constructor() { }

  private async findAllDtFiles(): Promise<string[]> {
    const allFiles = await listPaths({ prefix: 'done-summary/' });
    return allFiles.filter(file => file.includes('/DT') && file.endsWith('.csv'));
  }

  private async loadAndProcessSingleDtFile(blobName: string): Promise<{ data: TransactionData[], dateSuffix: string } | null> {
    try {
      const content = await downloadText(blobName);
      if (!content || content.trim().length === 0) return null;
      const pathParts = blobName.split('/');
      const dateFolder = pathParts[1] || 'unknown';
      const dateSuffix = dateFolder;
      const data = this.parseTransactionData(content);
      return { data, dateSuffix };
    } catch {
      return null;
    }
  }

  private parseTransactionData(content: string): TransactionData[] {
    const lines = content.trim().split('\n');
    const header = lines[0]?.split(';') || [];
    const getIdx = (col: string) => header.findIndex(h => h.trim() === col);
    const iSTK_CODE = getIdx('STK_CODE');
    const iBRK_COD1 = getIdx('BRK_COD1');
    const iBRK_COD2 = getIdx('BRK_COD2');
    const iSTK_VOLM = getIdx('STK_VOLM');
    const iSTK_PRIC = getIdx('STK_PRIC');
    const iTRX_CODE = getIdx('TRX_CODE');
    const iTRX_TYPE = getIdx('TRX_TYPE');
    if ([iSTK_CODE, iBRK_COD1, iBRK_COD2, iSTK_VOLM, iSTK_PRIC, iTRX_CODE, iTRX_TYPE].some(k => k === -1)) return [];
    const data: TransactionData[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line || line.trim().length === 0) continue;
      const values = line.split(';');
      const stockCode = values[iSTK_CODE]?.trim() || '';
      if (stockCode.length === 4) {
        const base: TransactionData = {
          STK_CODE: stockCode,
          BRK_COD1: values[iBRK_COD1]?.trim() || '',
          BRK_COD2: values[iBRK_COD2]?.trim() || '',
          STK_VOLM: parseFloat(values[iSTK_VOLM]?.trim() || '0') || 0,
          STK_PRIC: parseFloat(values[iSTK_PRIC]?.trim() || '0') || 0,
          TRX_CODE: values[iTRX_CODE]?.trim() || '',
          TRX_TYPE: values[iTRX_TYPE]?.trim() || '',
        };
        data.push(base);
      }
    }
    return data;
  }

  private filterByType(data: TransactionData[], type: TransactionType): TransactionData[] {
    return data.filter(row => row.TRX_TYPE === type);
  }

  private getSummaryPaths(type: TransactionType, dateSuffix: string) {
    let name = type.toLowerCase();
    return {
      brokerSummary: `broker_summary_${name}/broker_summary_${name}_${dateSuffix}`,
      brokerTransaction: `broker_transaction_${name}/broker_transaction_${name}_${dateSuffix}`
    };
  }

  private async createBrokerSummaryPerEmiten(data: TransactionData[], dateSuffix: string, type: TransactionType): Promise<string[]> {
    const paths = this.getSummaryPaths(type, dateSuffix);
    const uniqueEmiten = [...new Set(data.map(row => row.STK_CODE))];
    const createdFiles: string[] = [];
    for (const emiten of uniqueEmiten) {
      const emitenData = data.filter(row => row.STK_CODE === emiten);
      const buyerGroups = new Map<string, TransactionData[]>();
      emitenData.forEach(row => {
        const broker = row.BRK_COD2;
        if (!buyerGroups.has(broker)) buyerGroups.set(broker, []);
        buyerGroups.get(broker)!.push(row);
      });
      const buyerSummary = new Map<string, { totalVol: number; avgPrice: number; transactionCount: number; totalValue: number }>();
      buyerGroups.forEach((txs, broker) => {
        const totalVol = txs.reduce((s, t) => s + t.STK_VOLM, 0);
        const totalValue = txs.reduce((s, t) => s + (t.STK_VOLM * t.STK_PRIC), 0);
        const avgPrice = totalVol > 0 ? totalValue / totalVol : 0;
        buyerSummary.set(broker, { totalVol, avgPrice, transactionCount: txs.length, totalValue });
      });
      const sellerGroups = new Map<string, TransactionData[]>();
      emitenData.forEach(row => {
        const broker = row.BRK_COD1;
        if (!sellerGroups.has(broker)) sellerGroups.set(broker, []);
        sellerGroups.get(broker)!.push(row);
      });
      const sellerSummary = new Map<string, { totalVol: number; avgPrice: number; transactionCount: number; totalValue: number }>();
      sellerGroups.forEach((txs, broker) => {
        const totalVol = txs.reduce((s, t) => s + t.STK_VOLM, 0);
        const totalValue = txs.reduce((s, t) => s + (t.STK_VOLM * t.STK_PRIC), 0);
        const avgPrice = totalVol > 0 ? totalValue / totalVol : 0;
        sellerSummary.set(broker, { totalVol, avgPrice, transactionCount: txs.length, totalValue });
      });
      const allBrokers = new Set([...buyerSummary.keys(), ...sellerSummary.keys()]);
      const finalSummary: BrokerSummary[] = [];
      allBrokers.forEach(broker => {
        const buyer = buyerSummary.get(broker) || { totalVol: 0, avgPrice: 0, transactionCount: 0, totalValue: 0 };
        const seller = sellerSummary.get(broker) || { totalVol: 0, avgPrice: 0, transactionCount: 0, totalValue: 0 };
        finalSummary.push({
          BrokerCode: broker,
          BuyerVol: buyer.totalVol,
          BuyerValue: buyer.totalValue,
          SellerVol: seller.totalVol,
          SellerValue: seller.totalValue,
          NetBuyVol: buyer.totalVol - seller.totalVol,
          NetBuyValue: buyer.totalValue - seller.totalValue,
          BuyerAvg: buyer.avgPrice,
          SellerAvg: seller.avgPrice,
        });
      });
      finalSummary.sort((a, b) => b.NetBuyValue - a.NetBuyValue);
      const filename = `${paths.brokerSummary}/${emiten}.csv`;
      await this.saveToAzure(filename, finalSummary);
      createdFiles.push(filename);
    }
    return createdFiles;
  }

  private async createBrokerTransactionPerBroker(data: TransactionData[], dateSuffix: string, type: TransactionType): Promise<string[]> {
    const paths = this.getSummaryPaths(type, dateSuffix);
    const uniqueBrokers = [...new Set([ ...data.map(r => r.BRK_COD2), ...data.map(r => r.BRK_COD1)])];
    const createdFiles: string[] = [];
    for (const broker of uniqueBrokers) {
      const brokerData = data.filter(row => row.BRK_COD2 === broker || row.BRK_COD1 === broker);
      const stockGroups = new Map<string, TransactionData[]>();
      brokerData.forEach(row => {
        const stock = row.STK_CODE;
        if (!stockGroups.has(stock)) stockGroups.set(stock, []);
        stockGroups.get(stock)!.push(row);
      });
      const stockSummary: BrokerTransactionData[] = [];
      stockGroups.forEach((txs, stock) => {
        const buyerTxs = txs.filter(t => t.BRK_COD2 === broker);
        const sellerTxs = txs.filter(t => t.BRK_COD1 === broker);
        const buyerVol = buyerTxs.reduce((s, t) => s + t.STK_VOLM, 0);
        const buyerValue = buyerTxs.reduce((s, t) => s + (t.STK_VOLM * t.STK_PRIC), 0);
        const buyerAvg = buyerVol > 0 ? buyerValue / buyerVol : 0;
        const sellerVol = sellerTxs.reduce((s, t) => s + t.STK_VOLM, 0);
        const sellerValue = sellerTxs.reduce((s, t) => s + (t.STK_VOLM * t.STK_PRIC), 0);
        const sellerAvg = sellerVol > 0 ? sellerValue / sellerVol : 0;
        const netBuyVol = buyerVol - sellerVol;
        const netBuyValue = buyerValue - sellerValue;
        const totalVolume = buyerVol + sellerVol;
        const totalValue = buyerValue + sellerValue;
        const avgPrice = totalVolume > 0 ? totalValue / totalVolume : 0;
        stockSummary.push({
          Emiten: stock, BuyerVol: buyerVol, BuyerValue: buyerValue,
          SellerVol: sellerVol, SellerValue: sellerValue, NetBuyVol: netBuyVol,
          NetBuyValue: netBuyValue, BuyerAvg: buyerAvg, SellerAvg: sellerAvg,
          TotalVolume: totalVolume, AvgPrice: avgPrice, TransactionCount: txs.length, TotalValue: totalValue
        });
      });
      stockSummary.sort((a, b) => b.TotalVolume - a.TotalVolume);
      const filename = `${paths.brokerTransaction}/${broker}.csv`;
      await this.saveToAzure(filename, stockSummary);
      createdFiles.push(filename);
    }
    return createdFiles;
  }

  private async saveToAzure(filename: string, data: any[]): Promise<string> {
    if (!data || data.length === 0) return filename;
    const headers = Object.keys(data[0]);
    const csvContent = [headers.join(','), ...data.map(row => headers.map(header => row[header]).join(','))].join('\n');
    await uploadText(filename, csvContent, 'text/csv');
    return filename;
  }

  public async generateBrokerData(_dateSuffix?: string): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      const dtFiles = await this.findAllDtFiles();
      if (dtFiles.length === 0) return { success: true, message: `No DT files found - skipped broker data generation` };
      for (const blobName of dtFiles) {
        const result = await this.loadAndProcessSingleDtFile(blobName);
        if (!result) continue;
        const { data, dateSuffix: date } = result;
        for (const type of ['RK', 'TN', 'NG'] as const) {
          const filtered = this.filterByType(data, type);
          if (filtered.length === 0) continue;
          await this.createBrokerSummaryPerEmiten(filtered, date, type);
          await this.createBrokerTransactionPerBroker(filtered, date, type);
        }
      }
      return { success: true, message: 'Broker RK/TN/NG data generated' };
    } catch (e) {
      return { success: false, message: (e as Error).message };
    }
  }

  // Wrapper to align with scheduler service API
  public async generateBrokerSummarySplitPerType(): Promise<{ success: boolean; message: string }> {
    const result = await this.generateBrokerData('all');
    return { success: result.success, message: result.message };
  }
}

export default BrokerDataRKTNNGCalculator;
