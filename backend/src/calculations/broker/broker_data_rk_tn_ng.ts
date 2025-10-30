import { downloadText, uploadText, listPaths } from '../../utils/azureBlob';
import { BATCH_SIZE_PHASE_6 } from '../../services/dataUpdateService';

// Tambah field TRX_TYPE dari file sumber
type TransactionData = {
  STK_CODE: string;
  BRK_COD1: string;
  BRK_COD2: string;
  STK_VOLM: number;
  STK_PRIC: number;
  TRX_CODE: string;
  TRX_TYPE?: string;
};

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

export class BrokerDataRKTNNGCalculator {
  constructor() {}

  private async findAllDtFiles(): Promise<string[]> {
    const allFiles = await listPaths({ prefix: 'done-summary/' });
    return allFiles.filter((file) => file.includes('/DT') && file.endsWith('.csv'));
  }

  // parse file menambah kolom TRX_TYPE jika ada.
  private parseTransactionData(content: string): TransactionData[] {
    const lines = content.trim().split('\n');
    const data: TransactionData[] = [];
    if (lines.length < 2) return data;
    const header = lines[0]?.split(';') || [];

    const getColumnIndex = (col: string) => header.findIndex((h) => h.trim() === col);
    const stkCodeIndex = getColumnIndex('STK_CODE');
    const brkCod1Index = getColumnIndex('BRK_COD1');
    const brkCod2Index = getColumnIndex('BRK_COD2');
    const stkVolmIndex = getColumnIndex('STK_VOLM');
    const stkPricIndex = getColumnIndex('STK_PRIC');
    const trxCodeIndex = getColumnIndex('TRX_CODE');
    const trxTypeIndex = getColumnIndex('TRX_TYPE'); // << Tambahkan
    if ([stkCodeIndex, brkCod1Index, brkCod2Index, stkVolmIndex, stkPricIndex, trxCodeIndex].some(idx => idx === -1)) {
      return data;
    }
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i];
      if (!row) continue;
      const cells = row.split(';');
      if (cells.length < header.length) continue;
      const stockCode = cells[stkCodeIndex].trim();
      if (stockCode.length === 4) {
        data.push({
          STK_CODE: stockCode,
          BRK_COD1: cells[brkCod1Index]?.trim() || '',
          BRK_COD2: cells[brkCod2Index]?.trim() || '',
          STK_VOLM: parseFloat(cells[stkVolmIndex]?.trim() || '0') || 0,
          STK_PRIC: parseFloat(cells[stkPricIndex]?.trim() || '0') || 0,
          TRX_CODE: cells[trxCodeIndex]?.trim() || '',
          TRX_TYPE: trxTypeIndex !== -1 ? cells[trxTypeIndex]?.trim() : undefined,
        });
      }
    }
    return data;
  }

  // Sama seperti broker summary, tapi untuk subset
  private async createBrokerSummaryPerEmiten(
    data: TransactionData[],
    dateSuffix: string,
    type: string
  ): Promise<string[]> {
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
      const buyerSummary = new Map<string, { totalVol: number; avgPrice: number; totalValue: number }>();
      buyerGroups.forEach((transactions, broker) => {
        const totalVol = transactions.reduce((sum, t) => sum + t.STK_VOLM, 0);
        const totalValue = transactions.reduce((sum, t) => sum + (t.STK_VOLM * t.STK_PRIC), 0);
        const avgPrice = totalVol > 0 ? totalValue / totalVol : 0;
        buyerSummary.set(broker, { totalVol, avgPrice, totalValue });
      });
      const sellerGroups = new Map<string, TransactionData[]>();
      emitenData.forEach(row => {
        const broker = row.BRK_COD1;
        if (!sellerGroups.has(broker)) sellerGroups.set(broker, []);
        sellerGroups.get(broker)!.push(row);
      });
      const sellerSummary = new Map<string, { totalVol: number; avgPrice: number; totalValue: number }>();
      sellerGroups.forEach((transactions, broker) => {
        const totalVol = transactions.reduce((sum, t) => sum + t.STK_VOLM, 0);
        const totalValue = transactions.reduce((sum, t) => sum + (t.STK_VOLM * t.STK_PRIC), 0);
        const avgPrice = totalVol > 0 ? totalValue / totalVol : 0;
        sellerSummary.set(broker, { totalVol, avgPrice, totalValue });
      });
      const allBrokers = new Set([...buyerSummary.keys(), ...sellerSummary.keys()]);
      const summary: BrokerSummary[] = [];
      allBrokers.forEach(broker => {
        const buyer = buyerSummary.get(broker) || { totalVol: 0, avgPrice: 0, totalValue: 0 };
        const seller = sellerSummary.get(broker) || { totalVol: 0, avgPrice: 0, totalValue: 0 };
        summary.push({
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
      summary.sort((a, b) => b.NetBuyValue - a.NetBuyValue);
      const filename = `broker_summary_${type.toLowerCase()}/broker_summary_${type.toLowerCase()}_${dateSuffix}/${emiten}.csv`;
      await uploadText(filename, this.toCsv(summary), 'text/csv');
      createdFiles.push(filename);
    }
    return createdFiles;
  }

  private toCsv(rows: any[]): string {
    if (rows.length === 0) return '';
    const headers = Object.keys(rows[0]);
    return [headers.join(','), ...rows.map(r => headers.map(h => r[h]).join(','))].join('\n');
  }

  // Main proses: tiap tipe RK/TN/NG lakukan filtering dan simpan output sendiri
  public async generateBrokerSummarySplitPerType() {
    const dtFiles = await this.findAllDtFiles();
    for (const file of dtFiles) {
      const content = await downloadText(file);
      if (!content) continue;
      const allData = this.parseTransactionData(content);
      const pathParts = file.split('/');
      const dateSuffix = pathParts[1];
      for (const type of ['RK', 'TN', 'NG']) {
        const filtered = allData.filter(row => row.TRX_TYPE === type);
        if (filtered.length > 0) {
          await this.createBrokerSummaryPerEmiten(filtered, dateSuffix, type);
        }
      }
    }
  }
}

export default BrokerDataRKTNNGCalculator;
