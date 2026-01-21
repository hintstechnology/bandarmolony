import { BlobServiceClient } from '@azure/storage-blob';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import { OptimizedAzureStorageService, parseCsvString } from '../services/dataUpdateService';

// Load environment variables
dotenv.config();

const connectionString = process.env['AZURE_STORAGE_CONNECTION_STRING'] || "";
const containerName = process.env['AZURE_STORAGE_CONTAINER_NAME'] || "stock-trading-data";

if (!connectionString) {
    console.error("Please set AZURE_STORAGE_CONNECTION_STRING in your .env file");
    process.exit(1);
}

const azureStorage = new OptimizedAzureStorageService();

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

        // Skip header
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
        console.log(`📊 Loaded ${Object.keys(SECTOR_MAPPING).length} sectors.`);
    } catch (error) {
        console.error("❌ Error loading sector mapping:", error);
    }
}

async function findZeroOHLStocks() {
    await loadSectorMapping();

    const allEmitens = Object.values(SECTOR_MAPPING).flat();
    const uniqueEmitens = Array.from(new Set(allEmitens)).sort();

    console.log(`🚀 Scanning ${uniqueEmitens.length} stocks for Open=0, High=0, Low=0 but Close > 0...`);

    const results: string[] = [];
    let processedCount = 0;
    let problematicCount = 0;

    for (const ticker of uniqueEmitens) {
        processedCount++;

        // Progress logging
        if (processedCount % 50 === 0) {
            console.log(`⏳ Processed ${processedCount}/${uniqueEmitens.length} stocks...`);
        }

        // Find sector
        let sectorFound = '';
        for (const sector of Object.keys(SECTOR_MAPPING)) {
            if (SECTOR_MAPPING[sector].includes(ticker)) {
                sectorFound = sector;
                break;
            }
        }

        if (!sectorFound) continue;

        const blobName = `stock/${sectorFound}/${ticker}.csv`;

        try {
            if (!(await azureStorage.blobExists(blobName))) continue;

            const csvContent = await azureStorage.downloadCsvData(blobName);
            const data = await parseCsvString(csvContent);

            data.forEach((row, index) => {
                // Handle various header casing
                const open = parseFloat(row.open || row.Open || row.open_price || "0");
                const high = parseFloat(row.high || row.High || row.high_price || "0");
                const low = parseFloat(row.low || row.Low || row.low_price || "0");
                const close = parseFloat(row.close || row.Close || row.close_price || "0");
                const date = row.date || row.Date || row.tanggal || "Unknown";

                // Criteria: Open, High, Low are 0, but Close is NOT 0
                if (open === 0 && high === 0 && low === 0 && close > 0) {
                    const message = `[${ticker}] Date: ${date} - Open: ${open}, High: ${high}, Low: ${low}, Close: ${close}`;
                    results.push(message);
                    problematicCount++;
                    console.log(`❌ Found issue: ${message}`);
                }
            });
        } catch (err: any) {
            console.error(`⚠️ Error checking ${ticker}: ${err.message}`);
        }
    }

    // Save results to file
    const resultFile = 'zero_ohl_results.txt';
    fs.writeFileSync(resultFile, results.join('\n'));

    console.log(`\n✅ Scan complete.`);
    console.log(`📊 Total Stocks Checked: ${processedCount}`);
    console.log(`📊 Total Issues Found: ${problematicCount}`);
    console.log(`📝 Results saved to ${resultFile}`);
}

findZeroOHLStocks().catch(err => {
    console.error("❌ Fatal error:", err);
});
