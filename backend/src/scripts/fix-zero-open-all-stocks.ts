import { BlobServiceClient } from '@azure/storage-blob';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import {
    OptimizedAzureStorageService,
    parseCsvString,
    convertToCsv,
    removeDuplicates
} from '../services/dataUpdateService';

// Load environment variables
dotenv.config();

const connectionString = process.env['AZURE_STORAGE_CONNECTION_STRING'] || "";

// Local directory for saved repaired files
const REPAIR_DIR = path.join(process.cwd(), 'stock_data_repair');

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

function fetchYahooFinanceData(ticker: string, startDate: string, endDate: string) {
    try {
        const pythonPath = 'python'; // or specify absolute path if needed
        const scriptPath = path.join(__dirname, 'fetch_yfinance.py');
        const command = `"${pythonPath}" "${scriptPath}" ${ticker} ${startDate} ${endDate}`;

        const output = execSync(command).toString();
        const data = JSON.parse(output);

        if (data.error) {
            throw new Error(data.error);
        }

        return data;
    } catch (err: any) {
        throw new Error(`Yahoo Finance Error: ${err.message}`);
    }
}

async function fixAllStocks() {
    // Create local directory if it doesn't exist
    if (!fs.existsSync(REPAIR_DIR)) {
        fs.mkdirSync(REPAIR_DIR, { recursive: true });
        console.log(`📁 Created directory: ${REPAIR_DIR}`);
    }

    await loadSectorMapping();

    const allEmitens = Object.values(SECTOR_MAPPING).flat();
    const uniqueEmitens = Array.from(new Set(allEmitens)).sort();

    console.log(`🚀 Starting mass repair for ${uniqueEmitens.length} stocks using Yahoo Finance...\n`);

    let processedCount = 0;
    let repairNeededCount = 0;
    let successfullyRepairedCount = 0;
    let totalRowsRepaired = 0;
    let skipCount = 0;

    for (const ticker of uniqueEmitens) {
        processedCount++;

        // 1. Skip Logic: Check if already repaired locally
        const localPath = path.join(REPAIR_DIR, `${ticker}.csv`);
        if (fs.existsSync(localPath)) {
            skipCount++;
            if (skipCount % 100 === 0) {
                console.log(`⏭️ Skipped ${skipCount} already repaired stocks...`);
            }
            continue;
        }

        // Find which sector the stock belongs to
        let sectorFound = '';
        for (const sector of Object.keys(SECTOR_MAPPING)) {
            if (SECTOR_MAPPING[sector]?.includes(ticker)) {
                sectorFound = sector;
                break;
            }
        }

        if (!sectorFound) continue;

        const blobName = `stock/${sectorFound}/${ticker}.csv`;
        if (!(await azureStorage.blobExists(blobName))) continue;

        try {
            const csvContent = await azureStorage.downloadCsvData(blobName);
            const existingData = await parseCsvString(csvContent);

            if (existingData.length === 0) continue;

            // Identify problematic dates (Open=0, but HLC > 0)
            const problematicRows: any[] = [];
            existingData.forEach((row) => {
                const open = parseFloat(row.open || row.open_price || row.Open || "0");
                const high = parseFloat(row.high || row.high_price || row.High || "0");
                const low = parseFloat(row.low || row.low_price || row.Low || "0");
                const close = parseFloat(row.close || row.close_price || row.Close || "0");
                const date = row.date || row.tanggal || row.Date || "";

                if (open === 0 && (high > 0 && low > 0 && close > 0) && date) {
                    problematicRows.push(row);
                }
            });

            if (problematicRows.length === 0) {
                if (processedCount % 50 === 0) {
                    console.log(`[${processedCount}/${uniqueEmitens.length}] ✅ No issues found for ${ticker}.`);
                }
                continue;
            }

            repairNeededCount++;
            console.log(`[${processedCount}/${uniqueEmitens.length}] ❌ ${ticker} has ${problematicRows.length} issues.`);

            // Determine date range for Python script
            const datesFound = problematicRows.map(r => {
                const d = r.date || r.tanggal || r.Date;
                return new Date(d).getTime();
            }).filter(d => !isNaN(d));

            if (datesFound.length === 0) continue;

            const minDate = new Date(Math.min(...datesFound)).toISOString().split('T')[0];
            const maxDate = new Date(Math.max(...datesFound)).toISOString().split('T')[0];

            // Fetch from Yahoo Finance via Python
            const apiData = fetchYahooFinanceData(ticker, minDate, maxDate);

            if (!apiData || apiData.length === 0) {
                console.warn(`   ⚠️ Yahoo Finance returned no data for range ${minDate} to ${maxDate}.`);
                continue;
            }

            // Map Yahoo Finance data by date
            const apiDataMap = new Map();
            apiData.forEach((row: any) => {
                if (row.date) {
                    apiDataMap.set(row.date, row);
                }
            });

            let currentTickerRowsRepaired = 0;
            const repairedData = existingData.map(row => {
                const date = row.date || row.tanggal || row.Date || "";
                if (!date) return row;

                try {
                    const normalizedDate = new Date(date).toISOString().split('T')[0];
                    const apiRow = apiDataMap.get(normalizedDate);

                    if (apiRow) {
                        const rowKeys = Object.keys(row);
                        const openKey = rowKeys.find(k => k.toLowerCase() === 'open' || k.toLowerCase() === 'open_price');
                        const highKey = rowKeys.find(k => k.toLowerCase() === 'high' || k.toLowerCase() === 'high_price');
                        const lowKey = rowKeys.find(k => k.toLowerCase() === 'low' || k.toLowerCase() === 'low_price');
                        const closeKey = rowKeys.find(k => k.toLowerCase() === 'close' || k.toLowerCase() === 'close_price');

                        const currentOpen = parseFloat(row[openKey!] || "0");
                        const apiOpen = parseFloat(apiRow.open || "0");

                        // Extra safety check: only update if current open is 0 and HLC were valid
                        if (currentOpen === 0 && apiOpen > 0 && openKey) {
                            currentTickerRowsRepaired++;
                            const updatedRow = { ...row };
                            updatedRow[openKey] = apiRow.open;
                            if (highKey) updatedRow[highKey] = apiRow.high;
                            if (lowKey) updatedRow[lowKey] = apiRow.low;
                            if (closeKey) updatedRow[closeKey] = apiRow.close;

                            return updatedRow;
                        }
                    }
                } catch (e) { }
                return row;
            });

            if (currentTickerRowsRepaired > 0) {
                successfullyRepairedCount++;
                totalRowsRepaired += currentTickerRowsRepaired;

                const finalData = removeDuplicates(repairedData);
                const updatedCsv = convertToCsv(finalData);

                // Save locally
                fs.writeFileSync(localPath, updatedCsv);

                // Upload to Azure
                await azureStorage.uploadCsvData(blobName, updatedCsv);
                console.log(`   ✅ Successfully repaired ${currentTickerRowsRepaired} rows. Saved & Uploaded.`);
            } else {
                console.log(`   ⚠️ No changes applied for ${ticker} (API data matched existing or had no fix).`);
            }

        } catch (err: any) {
            console.error(`   ❌ Error processing ${ticker}: ${err.message}`);
        }
    }

    console.log(`\n--- Mass Repair Summary ---`);
    console.log(`Total Stocks Checked: ${processedCount}`);
    console.log(`Already Repaired (Skipped): ${skipCount}`);
    console.log(`Stocks Needing Repair Found: ${repairNeededCount}`);
    console.log(`Stocks Successfully Repaired: ${successfullyRepairedCount}`);
    console.log(`Total Rows Repaired: ${totalRowsRepaired}`);
    console.log(`Local archive in: ${REPAIR_DIR}`);
}

fixAllStocks().catch(err => {
    console.error("❌ Fatal error:", err);
});
