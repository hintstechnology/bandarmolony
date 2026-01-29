import { uploadText, listPaths } from '../../utils/azureBlob';
import { doneSummaryCache } from '../../cache/doneSummaryCacheService';

const MAX_CONCURRENT_REQUESTS = 3;

// Helper function to limit concurrency
async function limitConcurrency<T>(promises: Promise<T>[], maxConcurrency: number): Promise<T[]> {
    const results: T[] = [];
    for (let i = 0; i < promises.length; i += maxConcurrency) {
        const batch = promises.slice(i, i + maxConcurrency);
        const batchResults = await Promise.allSettled(batch);
        batchResults.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                results.push(result.value);
            } else {
                console.error(`⚠️ Promise rejected in batch at index ${i + index}:`, result.reason);
            }
        });
    }
    return results;
}

type InvestorType = 'All' | 'D' | 'F';
type BoardType = 'All' | 'RG' | 'TN' | 'NG';

interface TransactionData {
    STK_CODE: string;
    BRK_COD1: string; // Buyer
    BRK_COD2: string; // Seller
    STK_VOLM: number;
    STK_PRIC: number;
    TRX_ORD1: number;
    TRX_ORD2: number;
    INV_TYP1: string; // Buyer Type (D/F)
    INV_TYP2: string; // Seller Type (D/F)
    TRX_TYPE: string; // Board Type (RG/TN/NG)
    [key: string]: any;
}

interface EnhancedTransactionData extends TransactionData {
    isBid: boolean; // Not strictly used in HAKA/HAKI logic below but good for parity
    buyerInvType: InvestorType;
    sellerInvType: InvestorType;
    boardType: BoardType;
}

// Output Data Interface
interface HakaHakiData {
    Price: number;
    HAKI_O: number;
    Bor: number;
    HAKI_F: number;
    BFreq: number;
    HAKI: number;
    HAKA: number;
    SFreq: number;
    HAKA_F: number;
    Sor: number;
    HAKA_O: number;
    TFreq: number;
    TLot: number;
    TOr: number;
}

interface ProgressTracker {
    totalStocks: number;
    processedStocks: number;
    logId: string | null;
    updateProgress: () => Promise<void>;
}

export class HakaHakiAnalysisCalculator {
    constructor() { }

    // Helper to round numbers
    private round(num: number): number {
        return Math.round(num);
    }

    // Find all DT files
    private async findAllDtFiles(): Promise<string[]> {
        console.log("Scanning all DT files in done-summary folder...");
        try {
            const allDtFiles = await (doneSummaryCache as any).getDtFilesList();

            // Sort by date descending
            const sortedFiles = allDtFiles.sort((a: string, b: string) => {
                const dateA = a.split('/')[1] || '';
                const dateB = b.split('/')[1] || '';
                return dateB.localeCompare(dateA);
            });

            // Process all files logic or limit as needed
            // The user wants to process ALL emiten, implies checking all dates? 
            // Usually we limit history processing to save time, but "Process all available emiten data" 
            // refers to stocks within a file.
            // Let's keep the date limit to reasonable recent history or process all if requested.
            // For now, keeping a reasonable limit (e.g. 7 days or same as Broker Breakdown) is safe.
            const MAX_DATES_TO_PROCESS = 7;
            const limitedFiles = sortedFiles.slice(0, MAX_DATES_TO_PROCESS);

            console.log(`Found ${limitedFiles.length} DT files to process.`);
            return limitedFiles;
        } catch (error) {
            console.error('Error scanning DT files:', error);
            return [];
        }
    }

    private async filterExistingDates(dtFiles: string[]): Promise<string[]> {
        console.log(`🔍 Pre-checking existing HAKA/HAKI outputs...`);
        const filesToProcess: string[] = [];

        for (const file of dtFiles) {
            const pathParts = file.split('/');
            const dateSuffix = pathParts[1] || 'unknown';
            const outputPrefix = `done_summary_haka_haki/${dateSuffix}/`;

            try {
                // Check if directory exists/has content. 
                // Since this is a check per DATE, if partial data exists we might skip?
                // Safest is to skip if folder has ANY files, assuming it ran before.
                // Or proceed if we want to ensure completeness.
                const existingFiles = await listPaths({ prefix: outputPrefix, maxResults: 1 });
                if (existingFiles.length > 0) {
                    console.log(`⏭️ HAKA/HAKI breakdown already exists for date ${dateSuffix} - skipping`);
                } else {
                    filesToProcess.push(file);
                }
            } catch (e) {
                filesToProcess.push(file);
            }
        }
        return filesToProcess;
    }

    private parseTransactionData(content: string): TransactionData[] {
        const lines = content.trim().split('\n');
        const data: TransactionData[] = [];

        if (lines.length < 2) return data;

        const header = lines[0]?.split(';') || [];
        const getColumnIndex = (columnName: string) => header.findIndex(col => col.trim() === columnName);

        const stkCodeIndex = getColumnIndex('STK_CODE');
        const brkCod1Index = getColumnIndex('BRK_COD1');
        const brkCod2Index = getColumnIndex('BRK_COD2');
        const stkVolmIndex = getColumnIndex('STK_VOLM');
        const stkPricIndex = getColumnIndex('STK_PRIC');
        const trxOrd1Index = getColumnIndex('TRX_ORD1');
        const trxOrd2Index = getColumnIndex('TRX_ORD2');
        // New columns for filtering
        const invTyp1Index = getColumnIndex('INV_TYP1');
        const invTyp2Index = getColumnIndex('INV_TYP2');
        const trxTypeIndex = getColumnIndex('TRX_TYPE');

        if (stkCodeIndex === -1 || brkCod1Index === -1 || brkCod2Index === -1 ||
            stkVolmIndex === -1 || stkPricIndex === -1) {
            return data;
        }

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            if (!line || line.trim().length === 0) continue;

            const values = line.split(';');
            if (values.length < header.length) continue;

            const stockCode = values[stkCodeIndex]?.trim() || '';
            if (stockCode.length === 4) {
                data.push({
                    STK_CODE: stockCode,
                    BRK_COD1: values[brkCod1Index]?.trim() || '',
                    BRK_COD2: values[brkCod2Index]?.trim() || '',
                    STK_VOLM: parseFloat(values[stkVolmIndex]?.trim() || '0') || 0,
                    STK_PRIC: parseFloat(values[stkPricIndex]?.trim() || '0') || 0,
                    TRX_ORD1: parseInt(values[trxOrd1Index]?.trim() || '0') || 0,
                    TRX_ORD2: parseInt(values[trxOrd2Index]?.trim() || '0') || 0,
                    INV_TYP1: invTyp1Index !== -1 ? (values[invTyp1Index]?.trim() || '') : '',
                    INV_TYP2: invTyp2Index !== -1 ? (values[invTyp2Index]?.trim() || '') : '',
                    TRX_TYPE: trxTypeIndex !== -1 ? (values[trxTypeIndex]?.trim() || '') : '',
                });
            }
        }
        return data;
    }

    private getInvestorType(type: string): InvestorType {
        if (!type) return 'D'; // Default to Domestic if unknown
        return type.toUpperCase() === 'F' ? 'F' : 'D';
    }

    private enhanceTransactions(data: TransactionData[]): EnhancedTransactionData[] {
        return data.map(row => {
            const isBid = row.TRX_ORD1 > row.TRX_ORD2; // HAKA (Buy Up) -> Buyer Initiated
            return {
                ...row,
                isBid,
                buyerInvType: this.getInvestorType(row.INV_TYP1),
                sellerInvType: this.getInvestorType(row.INV_TYP2),
                boardType: (row.TRX_TYPE as BoardType) || 'RG' // Default to RG if missing
            };
        });
    }






    private processPriceMapToResults(priceMap: Map<number, any>): Map<number, HakaHakiData> {
        const resultMap = new Map<number, HakaHakiData>();

        priceMap.forEach((m, price) => {
            const count_haki_b_ord = m.haki_buyer_ord.size;
            const count_haki_s_ord = m.haki_seller_ord.size;
            const count_haka_b_ord = m.haka_buyer_ord.size;
            const count_haka_s_ord = m.haka_seller_ord.size;

            const val_HAKI = m.haki_buyer_vol - m.haki_seller_vol;
            const val_BFreq = m.haki_buyer_freq - m.haki_seller_freq;
            const val_BOrd = count_haki_b_ord - count_haki_s_ord;

            const val_HAKA = m.haka_buyer_vol - m.haka_seller_vol;
            const val_SFreq = m.haka_buyer_freq - m.haka_seller_freq;
            const val_SOrd = count_haka_b_ord - count_haka_s_ord;

            const val_HAKI_O = val_BOrd !== 0 ? this.round(val_HAKI / val_BOrd) : 0;
            const val_HAKI_F = val_BFreq !== 0 ? this.round(val_HAKI / val_BFreq) : 0;
            const val_HAKA_F = val_SFreq !== 0 ? this.round(val_HAKA / val_SFreq) : 0;
            const val_HAKA_O = val_SOrd !== 0 ? this.round(val_HAKA / val_SOrd) : 0;

            const val_TFreq = Math.abs(val_BFreq) + Math.abs(val_SFreq);
            const val_TLot = Math.abs(val_HAKI) + Math.abs(val_HAKA);
            const val_TOr = Math.abs(val_BOrd) + Math.abs(val_SOrd);

            const rawTotalVol = m.haki_buyer_vol + m.haki_seller_vol + m.haka_buyer_vol + m.haka_seller_vol;

            if (rawTotalVol > 0) {
                resultMap.set(price, {
                    Price: price,
                    HAKI_O: val_HAKI_O,
                    Bor: val_BOrd,
                    HAKI_F: val_HAKI_F,
                    BFreq: val_BFreq,
                    HAKI: this.round(val_HAKI),
                    HAKA: this.round(val_HAKA),
                    SFreq: val_SFreq,
                    HAKA_F: val_HAKA_F,
                    Sor: val_SOrd,
                    HAKA_O: val_HAKA_O,
                    TFreq: val_TFreq,
                    TLot: this.round(val_TLot),
                    TOr: val_TOr
                });
            }
        });
        return resultMap;
    }

    private dataToCsv(data: HakaHakiData[]): string {
        const header = "Price,HAKI/O,Bor,HAKI/F,Bfreq,HAKI,HAKA,Sfreq,HAKA/F,Sor,HAKA/O,Tfreq,TLot,TOr";
        const rows = data.sort((a, b) => b.Price - a.Price).map(d => [
            d.Price,
            d.HAKI_O, d.Bor, d.HAKI_F, d.BFreq, d.HAKI, d.HAKA, d.SFreq, d.HAKA_F, d.Sor, d.HAKA_O, d.TFreq, d.TLot, d.TOr
        ].join(','));
        return [header, ...rows].join('\n');
    }

    private async processSingleDtFile(blobName: string, _progressTracker?: ProgressTracker): Promise<boolean> {
        try {
            const content = await doneSummaryCache.getRawContent(blobName);
            if (!content || content.trim().length === 0) return false;

            const pathParts = blobName.split('/');
            const dateSuffix = pathParts[1] || 'unknown';

            // 1. Parse & Enhance
            const rawData = this.parseTransactionData(content);
            if (rawData.length === 0) return false;

            const enhancedData = this.enhanceTransactions(rawData);

            // 2. Group by Stock
            const stockDataMap = new Map<string, EnhancedTransactionData[]>();
            enhancedData.forEach(d => {
                if (!stockDataMap.has(d.STK_CODE)) stockDataMap.set(d.STK_CODE, []);
                stockDataMap.get(d.STK_CODE)!.push(d);
            });

            // 3. Process each stock
            const stockEntries = Array.from(stockDataMap.entries());
            for (const [stock, stockTx] of stockEntries) {

                // Define combinations to mirror Broker Breakdown
                const investorTypes: InvestorType[] = ['All', 'D', 'F'];
                const boardTypes: BoardType[] = ['All', 'RG', 'TN', 'NG'];

                for (const invType of investorTypes) {
                    for (const boardType of boardTypes) {



                        // Correct Filtering Logic:
                        // 1. Board Type: Strict filter.
                        const boardFilteredTx = stockTx.filter(t => {
                            if (boardType !== 'All' && t.boardType !== boardType) return false;
                            return true;
                        });

                        if (boardFilteredTx.length === 0) continue;

                        // Identify Suffix
                        const suffix = (invType === 'All' && boardType === 'All')
                            ? ''
                            : `_${invType.toLowerCase()}_${boardType.toLowerCase()}`;

                        // 2. Identify Unique Brokers in these transactions
                        const brokers = new Set<string>();
                        boardFilteredTx.forEach(t => {
                            if (t.BRK_COD1) brokers.add(t.BRK_COD1);
                            if (t.BRK_COD2) brokers.add(t.BRK_COD2);
                        });

                        // 3. Process Per Broker
                        for (const broker of brokers) {
                            // Calculate metrics with Investor Type filter applied strictly to that broker's side
                            const metricsMap = this.calculateMetricsForBrokerWithFilter(boardFilteredTx, broker, invType);

                            if (metricsMap.size > 0) {
                                const metricsList = Array.from(metricsMap.values());
                                const csv = this.dataToCsv(metricsList);
                                const outputFilename = `done_summary_haka_haki/${dateSuffix}/${stock}/${broker}${suffix}.csv`;
                                await uploadText(outputFilename, csv, 'text/csv');
                            }
                        }

                        // 4. Process "All" (Aggregate)
                        const allMetricsMap = this.calculateMetricsForAllWithFilter(boardFilteredTx, invType);
                        if (allMetricsMap.size > 0) {
                            const metricsList = Array.from(allMetricsMap.values());
                            const csv = this.dataToCsv(metricsList);
                            const outputFilename = `done_summary_haka_haki/${dateSuffix}/${stock}/All${suffix}.csv`;
                            await uploadText(outputFilename, csv, 'text/csv');
                        }
                    }
                }
            }

            return true;

        } catch (e) {
            console.error(`Error processing ${blobName}:`, e);
            return false;
        }
    }

    // Updated Calculation with Investor Type Filter
    private calculateMetricsForBrokerWithFilter(data: EnhancedTransactionData[], brokerCode: string, invType: InvestorType): Map<number, HakaHakiData> {
        const priceMap = new Map<number, {
            haki_buyer_vol: number; haki_buyer_freq: number; haki_buyer_ord: Set<number>;
            haki_seller_vol: number; haki_seller_freq: number; haki_seller_ord: Set<number>;
            haka_buyer_vol: number; haka_buyer_freq: number; haka_buyer_ord: Set<number>;
            haka_seller_vol: number; haka_seller_freq: number; haka_seller_ord: Set<number>;
        }>();

        data.forEach(row => {
            const price = row.STK_PRIC;
            const volume = row.STK_VOLM;

            // Ensure PriceMap entry
            if (!priceMap.has(price)) {
                priceMap.set(price, {
                    haki_buyer_vol: 0, haki_buyer_freq: 0, haki_buyer_ord: new Set(),
                    haki_seller_vol: 0, haki_seller_freq: 0, haki_seller_ord: new Set(),
                    haka_buyer_vol: 0, haka_buyer_freq: 0, haka_buyer_ord: new Set(),
                    haka_seller_vol: 0, haka_seller_freq: 0, haka_seller_ord: new Set()
                });
            }
            const m = priceMap.get(price)!;
            const isHaka = row.TRX_ORD1 > row.TRX_ORD2;
            const isHaki = row.TRX_ORD2 > row.TRX_ORD1;

            // Apply Investor Type Logic:
            // If invType is 'All', match always.
            // If invType is 'D', match only if row.buyerInvType/row.sellerInvType is 'D'.

            // Buyer Side Check
            if (row.BRK_COD1 === brokerCode) {
                const matchesInv = invType === 'All' || row.buyerInvType === invType;
                if (matchesInv) {
                    if (isHaka) {
                        m.haka_buyer_vol += volume;
                        m.haka_buyer_freq++;
                        m.haka_buyer_ord.add(row.TRX_ORD1);
                    } else if (isHaki) {
                        m.haki_buyer_vol += volume;
                        m.haki_buyer_freq++;
                        m.haki_buyer_ord.add(row.TRX_ORD1);
                    }
                }
            }

            // Seller Side Check
            if (row.BRK_COD2 === brokerCode) {
                const matchesInv = invType === 'All' || row.sellerInvType === invType;
                if (matchesInv) {
                    if (isHaka) {
                        m.haka_seller_vol += volume;
                        m.haka_seller_freq++;
                        m.haka_seller_ord.add(row.TRX_ORD2);
                    } else if (isHaki) {
                        m.haki_seller_vol += volume;
                        m.haki_seller_freq++;
                        m.haki_seller_ord.add(row.TRX_ORD2);
                    }
                }
            }
        });

        return this.processPriceMapToResults(priceMap);
    }

    private calculateMetricsForAllWithFilter(data: EnhancedTransactionData[], invType: InvestorType): Map<number, HakaHakiData> {
        const priceMap = new Map<number, {
            haki_buyer_vol: number; haki_buyer_freq: number; haki_buyer_ord: Set<number>;
            haki_seller_vol: number; haki_seller_freq: number; haki_seller_ord: Set<number>;
            haka_buyer_vol: number; haka_buyer_freq: number; haka_buyer_ord: Set<number>;
            haka_seller_vol: number; haka_seller_freq: number; haka_seller_ord: Set<number>;
        }>();

        data.forEach(row => {
            const price = row.STK_PRIC;
            const volume = row.STK_VOLM;

            if (!priceMap.has(price)) {
                priceMap.set(price, {
                    haki_buyer_vol: 0, haki_buyer_freq: 0, haki_buyer_ord: new Set(),
                    haki_seller_vol: 0, haki_seller_freq: 0, haki_seller_ord: new Set(),
                    haka_buyer_vol: 0, haka_buyer_freq: 0, haka_buyer_ord: new Set(),
                    haka_seller_vol: 0, haka_seller_freq: 0, haka_seller_ord: new Set()
                });
            }
            const m = priceMap.get(price)!;
            const isHaka = row.TRX_ORD1 > row.TRX_ORD2;
            const isHaki = row.TRX_ORD2 > row.TRX_ORD1;

            // Buyer Side (BRK_COD1)
            if (invType === 'All' || row.buyerInvType === invType) {
                if (isHaka) {
                    m.haka_buyer_vol += volume;
                    m.haka_buyer_freq++;
                    m.haka_buyer_ord.add(row.TRX_ORD1);
                } else if (isHaki) {
                    m.haki_buyer_vol += volume;
                    m.haki_buyer_freq++;
                    m.haki_buyer_ord.add(row.TRX_ORD1);
                }
            }

            // Seller Side (BRK_COD2)
            if (invType === 'All' || row.sellerInvType === invType) {
                if (isHaka) {
                    m.haka_seller_vol += volume;
                    m.haka_seller_freq++;
                    m.haka_seller_ord.add(row.TRX_ORD2);
                } else if (isHaki) {
                    m.haki_seller_vol += volume;
                    m.haki_seller_freq++;
                    m.haki_seller_ord.add(row.TRX_ORD2);
                }
            }
        });
        return this.processPriceMapToResults(priceMap);
    }


    // Public Main Method
    public async generateHakaHakiData(logId?: string | null): Promise<void> {
        console.log("Starting HAKA/HAKI Analysis Generation...");
        const dtFiles = await this.findAllDtFiles();
        const filesToProcess = await this.filterExistingDates(dtFiles);

        const progressTracker: ProgressTracker = {
            totalStocks: 0,
            processedStocks: 0,
            logId: logId || null,
            updateProgress: async () => {
                // Simplified progress update
            }
        };

        const batchPromises = filesToProcess.map(file => this.processSingleDtFile(file, progressTracker));
        await limitConcurrency(batchPromises.map(p => Promise.resolve(p)), MAX_CONCURRENT_REQUESTS);

        console.log("HAKA/HAKI Analysis Generation Complete.");
    }
}
