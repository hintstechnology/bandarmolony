import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { OptimizedAzureStorageService, parseCsvString, convertToCsv } from '../services/dataUpdateService';

// Load environment variables
dotenv.config();

const azureStorage = new OptimizedAzureStorageService();
const REPAIR_DIR = path.join(process.cwd(), 'stock_data_repair_ohl');

// Ensure repair directory exists
if (!fs.existsSync(REPAIR_DIR)) {
    fs.mkdirSync(REPAIR_DIR, { recursive: true });
}

// Interface for sector mapping
interface SectorLookup {
    [key: string]: string[];
}

const SECTOR_MAPPING: SectorLookup = {};

async function loadSectorMapping() {
    try {
        console.log("🔍 Loading sector_mapping.csv...");
        const csvData = await azureStorage.downloadCsvData('csv_input/sector_mapping.csv');
        const lines = csvData.split('\n');

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            if (!line) continue;
            const parts = line.split(',');
            if (parts.length >= 2) {
                const sector = parts[0]?.trim();
                const emiten = parts[1]?.trim();
                if (sector && emiten) {
                    if (!SECTOR_MAPPING[sector]) {
                        SECTOR_MAPPING[sector] = [];
                    }
                    SECTOR_MAPPING[sector].push(emiten);
                }
            }
        }
    } catch (error) {
        console.error("❌ Error loading sector mapping:", error);
    }
}

function getSectorForEmiten(ticker: string): string {
    for (const sector of Object.keys(SECTOR_MAPPING)) {
        if (SECTOR_MAPPING[sector].includes(ticker)) {
            return sector;
        }
    }
    return '';
}

async function fixAllZeroOHLStocks() {
    await loadSectorMapping();

    const allEmitens = Object.values(SECTOR_MAPPING).flat();
    const uniqueEmitens = Array.from(new Set(allEmitens)).sort();

    console.log(`🚀 Starting mass repair for ${uniqueEmitens.length} stocks (Zero OHL case)...`);

    let totalStocksProcessed = 0;
    let totalStocksRepaired = 0;
    let totalRowsFixed = 0;

    for (const ticker of uniqueEmitens) {
        totalStocksProcessed++;

        // Skip logic: if local repaired file exists, skip
        const localPath = path.join(REPAIR_DIR, `${ticker}.csv`);
        if (fs.existsSync(localPath)) {
            console.log(`⏭️ Skipping ${ticker} (already repaired locally).`);
            continue;
        }

        const sector = getSectorForEmiten(ticker);
        if (!sector) continue;

        const blobName = `stock/${sector}/${ticker}.csv`;

        try {
            if (!(await azureStorage.blobExists(blobName))) continue;

            const csvContent = await azureStorage.downloadCsvData(blobName);
            const data = await parseCsvString(csvContent);

            let fixedCount = 0;
            const processedData = data.map((row) => {
                const openKey = Object.keys(row).find(k => k.toLowerCase() === 'open') || 'Open';
                const highKey = Object.keys(row).find(k => k.toLowerCase() === 'high') || 'High';
                const lowKey = Object.keys(row).find(k => k.toLowerCase() === 'low') || 'Low';
                const closeKey = Object.keys(row).find(k => k.toLowerCase() === 'close') || 'Close';

                const open = parseFloat(row[openKey] || "0");
                const high = parseFloat(row[highKey] || "0");
                const low = parseFloat(row[lowKey] || "0");
                const close = parseFloat(row[closeKey] || "0");

                if (open === 0 && high === 0 && low === 0 && close > 0) {
                    fixedCount++;
                    return {
                        ...row,
                        [openKey]: close,
                        [highKey]: close,
                        [lowKey]: close
                    };
                }
                return row;
            });

            if (fixedCount > 0) {
                console.log(`✅ Repairing ${ticker}: ${fixedCount} rows found.`);
                const updatedCsv = convertToCsv(processedData);

                // Save locally
                fs.writeFileSync(localPath, updatedCsv);

                // Upload to Azure
                await azureStorage.uploadCsvData(blobName, updatedCsv);

                totalStocksRepaired++;
                totalRowsFixed += fixedCount;
            } else {
                // Save an empty or indicator file to skip it next time if no changes needed but we checked it
                // Or just don't save. If we don't save, it will be checked again. 
                // Given we want to avoid re-checking Azure, maybe save a small flag file.
                // However, let's just process. Stocks without issues are fast.
            }

            if (totalStocksProcessed % 50 === 0) {
                console.log(`📊 Progress: ${totalStocksProcessed}/${uniqueEmitens.length} stocks checked.`);
            }

        } catch (err: any) {
            console.error(`⚠️ Error processing ${ticker}: ${err.message}`);
        }
    }

    console.log(`\n✨ Mass repair complete!`);
    console.log(`📊 Total Stocks Checked: ${totalStocksProcessed}`);
    console.log(`📊 Total Stocks Repaired: ${totalStocksRepaired}`);
    console.log(`📊 Total Rows Fixed: ${totalRowsFixed}`);
}

fixAllZeroOHLStocks().catch(err => {
    console.error("❌ Fatal error:", err);
});
