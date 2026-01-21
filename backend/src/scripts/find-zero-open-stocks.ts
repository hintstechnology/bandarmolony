import { BlobServiceClient } from '@azure/storage-blob';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const connectionString = process.env['AZURE_STORAGE_CONNECTION_STRING'] || "";
const containerName = process.env['AZURE_STORAGE_CONTAINER_NAME'] || "stock-trading-data";

if (!connectionString) {
    console.error("Please set AZURE_STORAGE_CONNECTION_STRING in your .env file");
    process.exit(1);
}

const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
const containerClient = blobServiceClient.getContainerClient(containerName);

// Interface for sector mapping
interface SectorLookup {
    [key: string]: string[];
}

const SECTOR_MAPPING: SectorLookup = {};

async function streamToString(readableStream: NodeJS.ReadableStream): Promise<string> {
    return new Promise((resolve, reject) => {
        const chunks: any[] = [];
        readableStream.on("data", (data) => {
            chunks.push(data.toString());
        });
        readableStream.on("end", () => {
            resolve(chunks.join(""));
        });
        readableStream.on("error", reject);
    });
}

async function loadSectorMapping() {
    try {
        console.log("🔍 Loading sector_mapping.csv...");
        const blobClient = containerClient.getBlockBlobClient("csv_input/sector_mapping.csv");

        if (await blobClient.exists()) {
            const downloadResponse = await blobClient.download();
            const csvContent = (await streamToString(downloadResponse.readableStreamBody!));
            const lines = csvContent.split('\n');

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
        } else {
            console.warn("⚠️ sector_mapping.csv not found.");
        }

        const sectors = Object.keys(SECTOR_MAPPING);
        console.log(`📊 Loaded ${sectors.length} sectors.`);

    } catch (error) {
        console.error("❌ Error loading sector mapping:", error);
    }
}

async function scanForZeroOpenPrices() {
    await loadSectorMapping();

    const affectedStocks: string[] = [];
    let totalFilesChecked = 0;
    let totalZeroRowsFound = 0;

    const sectors = Object.keys(SECTOR_MAPPING);
    if (sectors.length === 0) {
        console.error("❌ No sectors loaded. Cannot proceed.");
        return;
    }

    // Get all emitens to process
    const allEmitens = Object.values(SECTOR_MAPPING).flat();
    const uniqueEmitens = Array.from(new Set(allEmitens)).sort();

    console.log(`🚀 Starting scan for 0 open prices across ${uniqueEmitens.length} stocks...\n`);

    for (const ticker of uniqueEmitens) {
        let found = false;
        let tickerAffected = false;

        // Find which sector the stock belongs to (and where the file actually is)
        for (const sector of sectors) {
            if (SECTOR_MAPPING[sector]?.includes(ticker)) {
                const blobName = `stock/${sector}/${ticker}.csv`;
                const blobClient = containerClient.getBlockBlobClient(blobName);

                if (await blobClient.exists()) {
                    found = true;
                    totalFilesChecked++;

                    try {
                        const downloadResponse = await blobClient.download();
                        const csvContent = await streamToString(downloadResponse.readableStreamBody!);
                        const lines = csvContent.split('\n');

                        if (lines.length <= 1) continue;

                        const header = lines[0]?.split(',').map(h => h.trim().toLowerCase());
                        const openIndex = header?.findIndex(h => h === 'open' || h === 'open_price');

                        if (openIndex === undefined || openIndex === -1) {
                            console.warn(`⚠️ Header 'open' not found for ${ticker} in sector ${sector}`);
                            continue;
                        }

                        const dateIndex = header?.findIndex(h => h === 'date' || h === 'tanggal' || h === 'Date');
                        const highIndex = header?.findIndex(h => h === 'high' || h === 'high_price');
                        const lowIndex = header?.findIndex(h => h === 'low' || h === 'low_price');
                        const closeIndex = header?.findIndex(h => h === 'close' || h === 'close_price');

                        for (let i = 1; i < lines.length; i++) {
                            const line = lines[i];
                            if (!line) continue;

                            const columns = line.split(',');
                            const openValue = columns[openIndex]?.trim();
                            const highValue = highIndex !== undefined && highIndex !== -1 ? columns[highIndex]?.trim() : "0";
                            const lowValue = lowIndex !== undefined && lowIndex !== -1 ? columns[lowIndex]?.trim() : "0";
                            const closeValue = closeIndex !== undefined && closeIndex !== -1 ? columns[closeIndex]?.trim() : "0";
                            const dateValue = dateIndex !== undefined && dateIndex !== -1 ? columns[dateIndex]?.trim() : `row ${i}`;

                            const isOpenZero = openValue === "0" || openValue === "0.0" || openValue === "0.00";
                            const isOthersNonZero = (highValue && highValue !== "0" && highValue !== "0.0" && highValue !== "0.00") &&
                                (lowValue && lowValue !== "0" && lowValue !== "0.0" && lowValue !== "0.00") &&
                                (closeValue && closeValue !== "0" && closeValue !== "0.0" && closeValue !== "0.00");

                            // Check if open value is exactly 0, but HLC are valid
                            if (isOpenZero && isOthersNonZero) {
                                if (!tickerAffected) {
                                    console.log(`❌ ${ticker} (${sector}):`);
                                    tickerAffected = true;
                                    affectedStocks.push(ticker);
                                }
                                console.log(`   - Date: ${dateValue} (Open: ${openValue}, High: ${highValue}, Low: ${lowValue}, Close: ${closeValue})`);
                                totalZeroRowsFound++;
                            }
                        }
                    } catch (err: any) {
                        console.error(`❌ Error processing ${ticker}: ${err.message}`);
                    }

                    break; // Move to next ticker once found and processed
                }
            }
        }

        if (!found) {
            // Optional: log if ticker mentioned in mapping but file missing
            // console.log(`ℹ️ File not found for ${ticker}`);
        }
    }

    console.log(`\n--- Scan Summary ---`);
    console.log(`Total files checked: ${totalFilesChecked}`);
    console.log(`Stocks with 0 open price: ${affectedStocks.length}`);
    console.log(`Total rows with 0 open price: ${totalZeroRowsFound}`);

    if (affectedStocks.length > 0) {
        console.log(`\nAffected Tickers: ${affectedStocks.join(', ')}`);
    } else {
        console.log(`\n✅ No stocks found with 0 open price.`);
    }
}

scanForZeroOpenPrices().catch(err => {
    console.error("❌ Fatal error:", err);
});
