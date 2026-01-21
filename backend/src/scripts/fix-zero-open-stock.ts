import { BlobServiceClient } from '@azure/storage-blob';
import * as dotenv from 'dotenv';
import axios from 'axios';
import {
    OptimizedAzureStorageService,
    OptimizedHttpClient,
    parseCsvString,
    convertToCsv,
    removeDuplicates
} from '../services/dataUpdateService';

// Load environment variables
dotenv.config();

const connectionString = process.env['AZURE_STORAGE_CONNECTION_STRING'] || "";
const containerName = process.env['AZURE_STORAGE_CONTAINER_NAME'] || "stock-trading-data";
const jwtToken = process.env['TICMI_JWT_TOKEN'] || '';
const baseUrl = `${process.env['TICMI_API_BASE_URL'] || ''}/dp/eq/`;

if (!connectionString) {
    console.error("Please set AZURE_STORAGE_CONNECTION_STRING in your .env file");
    process.exit(1);
}

if (!jwtToken) {
    console.error("Please set TICMI_JWT_TOKEN in your .env file");
    process.exit(1);
}

const tickerInput = process.argv[2]?.toUpperCase();

if (!tickerInput) {
    console.error("Usage: npx ts-node src/scripts/fix-zero-open-stock.ts TICKER");
    process.exit(1);
}

const azureStorage = new OptimizedAzureStorageService();
const httpClient = new OptimizedHttpClient(baseUrl, jwtToken);

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

async function fixStock(ticker: string) {
    await loadSectorMapping();

    let sectorFound = '';
    for (const sector of Object.keys(SECTOR_MAPPING)) {
        if (SECTOR_MAPPING[sector]?.includes(ticker)) {
            sectorFound = sector;
            break;
        }
    }

    if (!sectorFound) {
        console.error(`❌ Ticker ${ticker} not found in sector mapping.`);
        return;
    }

    const blobName = `stock/${sectorFound}/${ticker}.csv`;
    if (!(await azureStorage.blobExists(blobName))) {
        console.error(`❌ File ${blobName} does not exist in storage.`);
        return;
    }

    console.log(`🔍 Checking ${ticker} in ${sectorFound}...`);
    const csvContent = await azureStorage.downloadCsvData(blobName);
    const existingData = await parseCsvString(csvContent);

    if (existingData.length === 0) {
        console.warn(`⚠️ File ${blobName} is empty.`);
        return;
    }

    // Identify problematic dates
    const problematicDates: string[] = [];
    existingData.forEach((row, idx) => {
        const open = parseFloat(row.open || row.open_price || row.Open || "0");
        const high = parseFloat(row.high || row.high_price || row.High || "0");
        const low = parseFloat(row.low || row.low_price || row.Low || "0");
        const close = parseFloat(row.close || row.close_price || row.Close || "0");
        const date = row.date || row.tanggal || row.Date || "";

        if (open === 0 && (high > 0 && low > 0 && close > 0) && date) {
            problematicDates.push(date);
        }
    });

    if (problematicDates.length === 0) {
        console.log(`✅ No problematic rows (open=0 with valid HLC) found for ${ticker}.`);
        return;
    }

    console.log(`❌ Found ${problematicDates.length} problematic dates for ${ticker}: ${problematicDates.join(', ')}`);

    // Determine range for API fetch
    // To be efficient, we can find min and max date, but TICMI API might have limits.
    // Usually daily granularity takes startDate and endDate.
    const dates = problematicDates.map(d => new Date(d).getTime());
    const minDate = new Date(Math.min(...dates)).toISOString().split('T')[0];
    const maxDate = new Date(Math.max(...dates)).toISOString().split('T')[0];

    console.log(`🚀 Fetching data from TICMI API for range: ${minDate} to ${maxDate}...`);

    try {
        const response = await httpClient.get(baseUrl, {
            secCode: ticker,
            startDate: minDate,
            endDate: maxDate,
            granularity: "daily",
        });

        const apiPayload = response.data;
        const apiDataRaw = apiPayload.data || apiPayload;
        let apiData: any[] = Array.isArray(apiDataRaw) ? apiDataRaw : (apiDataRaw ? [apiDataRaw] : []);

        if (apiData.length === 0) {
            console.error("❌ TICMI API returned no data for this range.");
            return;
        }

        console.log(`📊 TICMI API returned ${apiData.length} rows.`);

        // Create a map of API data by date for quick access
        const apiDataMap = new Map();
        apiData.forEach(row => {
            const dateStr = row.date || row.tanggal || row.Date || "";
            if (dateStr) {
                // Normalize date string if needed (assuming API returns YYYY-MM-DD or similar standard)
                const normalizedDate = new Date(dateStr).toISOString().split('T')[0];
                apiDataMap.set(normalizedDate, row);
            }
        });

        // Repair the data
        let repairCount = 0;
        const repairedData = existingData.map(row => {
            const date = row.date || row.tanggal || row.Date || "";
            const normalizedDate = date ? new Date(date).toISOString().split('T')[0] : "";

            if (problematicDates.includes(date) || (normalizedDate && apiDataMap.has(normalizedDate))) {
                const apiRow = apiDataMap.get(normalizedDate);
                if (apiRow) {
                    const rowKeys = Object.keys(row);
                    const openKey = rowKeys.find(k => k.toLowerCase() === 'open' || k.toLowerCase() === 'open_price');
                    const highKey = rowKeys.find(k => k.toLowerCase() === 'high' || k.toLowerCase() === 'high_price');
                    const lowKey = rowKeys.find(k => k.toLowerCase() === 'low' || k.toLowerCase() === 'low_price');
                    const closeKey = rowKeys.find(k => k.toLowerCase() === 'close' || k.toLowerCase() === 'close_price');

                    const apiOpen = parseFloat(apiRow.open || apiRow.open_price || apiRow.Open || "0");

                    if (apiOpen > 0 && openKey) {
                        repairCount++;
                        const updatedRow = { ...row };

                        // Use exact same keys as original row
                        if (openKey) updatedRow[openKey] = apiRow.open || apiRow.open_price || apiRow.Open || row[openKey];
                        if (highKey) updatedRow[highKey] = apiRow.high || apiRow.high_price || apiRow.High || row[highKey];
                        if (lowKey) updatedRow[lowKey] = apiRow.low || apiRow.low_price || apiRow.Low || row[lowKey];
                        if (closeKey) updatedRow[closeKey] = apiRow.close || apiRow.close_price || apiRow.Close || row[closeKey];

                        console.log(`🔧 Repaired ${date}: Updated ${openKey} to ${updatedRow[openKey]}`);
                        return updatedRow;
                    }
                }
            }
            return row;
        });

        if (repairCount === 0) {
            console.warn("⚠️ No rows were actually repaired (API might also have 0 open price or date mismatch).");
            return;
        }

        console.log(`✅ Successfully repaired ${repairCount} rows.`);

        // Ensure we deduplicate and sort just in case (though map preserves order)
        const finalData = removeDuplicates(repairedData);
        const updatedCsv = convertToCsv(finalData);

        console.log(`📤 Uploading updated CSV for ${ticker}...`);
        await azureStorage.uploadCsvData(blobName, updatedCsv);
        console.log(`🎉 ${ticker} updated successfully.`);

    } catch (err: any) {
        console.error(`❌ Error fetching/updating ${ticker}: ${err.message}`);
    }
}

fixStock(tickerInput).catch(err => {
    console.error("❌ Fatal error:", err);
});
