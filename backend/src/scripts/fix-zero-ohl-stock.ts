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
        const sectorEmitens = SECTOR_MAPPING[sector];
        if (sectorEmitens && sectorEmitens.includes(ticker)) {
            return sector;
        }
    }
    return '';
}

async function fixZeroOHLStock(ticker: string) {
    ticker = ticker.toUpperCase();
    await loadSectorMapping();

    const sector = getSectorForEmiten(ticker);
    if (!sector) {
        console.error(`❌ Could not find sector for ticker: ${ticker}`);
        return;
    }

    const blobName = `stock/${sector}/${ticker}.csv`;
    console.log(`🚀 Starting repair for ${ticker} in sector ${sector}...`);

    try {
        if (!(await azureStorage.blobExists(blobName))) {
            console.error(`❌ Blob not found: ${blobName}`);
            return;
        }

        // 1. Download existing data
        const csvContent = await azureStorage.downloadCsvData(blobName);
        const data = await parseCsvString(csvContent);

        let fixedCount = 0;
        const processedData = data.map((row) => {
            // Identify headers (case-insensitive)
            const openKey = Object.keys(row).find(k => k.toLowerCase() === 'open') || 'Open';
            const highKey = Object.keys(row).find(k => k.toLowerCase() === 'high') || 'High';
            const lowKey = Object.keys(row).find(k => k.toLowerCase() === 'low') || 'Low';
            const closeKey = Object.keys(row).find(k => k.toLowerCase() === 'close') || 'Close';

            const open = parseFloat(row[openKey] || "0");
            const high = parseFloat(row[highKey] || "0");
            const low = parseFloat(row[lowKey] || "0");
            const close = parseFloat(row[closeKey] || "0");

            // Condition: Open, High, Low are 0, but Close > 0
            if (open === 0 && high === 0 && low === 0 && close > 0) {
                fixedCount++;
                console.log(`✅ Fixing record for ${ticker} on ${row.Date || row.date || row.tanggal}: Setting OHL to ${close}`);

                return {
                    ...row,
                    [openKey]: close,
                    [highKey]: close,
                    [lowKey]: close
                };
            }

            return row;
        });

        if (fixedCount === 0) {
            console.log(`ℹ️ No records found needing repair for ${ticker}.`);
            return;
        }

        // 2. Convert back to CSV
        const updatedCsv = convertToCsv(processedData);

        // 3. Save local copy for verification
        const localPath = path.join(REPAIR_DIR, `${ticker}.csv`);
        fs.writeFileSync(localPath, updatedCsv);
        console.log(`📝 Local copy saved to ${localPath}`);

        // 4. Upload back to Azure
        console.log(`📤 Uploading repaired CSV back to Azure...`);
        await azureStorage.uploadCsvData(blobName, updatedCsv);

        console.log(`✨ Successfully repaired ${fixedCount} records for ${ticker}.`);

    } catch (err: any) {
        console.error(`❌ Error repairing ${ticker}: ${err.message}`);
    }
}

// Get ticker from command line argument
const tickerArg = process.argv[2];
if (!tickerArg) {
    console.log("Usage: npx ts-node src/scripts/fix-zero-ohl-stock.ts <TICKER>");
    process.exit(1);
}

fixZeroOHLStock(tickerArg).catch(err => {
    console.error("❌ Fatal error:", err);
});
