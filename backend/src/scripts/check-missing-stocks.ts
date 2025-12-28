import { BlobServiceClient } from '@azure/storage-blob';
import * as dotenv from 'dotenv';
import { getSectorFallback } from '../services/dataUpdateService';

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

async function loadSectorMapping() {
    try {
        console.log("Loading sector_mapping.csv...");
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
                    const part0 = parts[0];
                    const part1 = parts[1];
                    if (part0 && part1) {
                        const sector = part0.trim();
                        const emiten = part1.trim();
                        if (sector && emiten) {
                            if (!SECTOR_MAPPING[sector]) {
                                SECTOR_MAPPING[sector] = [];
                            }
                            SECTOR_MAPPING[sector]?.push(emiten);
                        }
                    }
                }
            }
        } else {
            console.warn("sector_mapping.csv not found.");
        }

        const sectors = Object.keys(SECTOR_MAPPING);
        console.log(`Loaded ${sectors.length} sectors.`);
        sectors.forEach(s => {
            console.log(`- ${s}: ${SECTOR_MAPPING[s]?.length} stocks`);
        });

    } catch (error) {
        console.error("Error loading sector mapping:", error);
    }
}

async function checkMissingStocks() {
    await loadSectorMapping();

    try {
        console.log("\nLoading emiten_list.csv...");
        const blobClient = containerClient.getBlockBlobClient("csv_input/emiten_list.csv");

        if (!await blobClient.exists()) {
            console.error("emiten_list.csv not found!");
            return;
        }

        const downloadResponse = await blobClient.download();
        const csvContent = (await streamToString(downloadResponse.readableStreamBody!));
        const lines = csvContent.split('\n');

        const emitenList: string[] = [];
        // Skip header
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            if (!line) continue;
            const parts = line.split(',');
            if (parts.length > 0) {
                const firstPart = parts[0];
                if (firstPart) {
                    const code = firstPart.trim();
                    if (code && code.length === 4) {
                        emitenList.push(code);
                    }
                }
            }
        }
        console.log(`Found ${emitenList.length} stocks in emiten_list.csv`);

        let missingCount = 0;
        const availableSectors = Object.keys(SECTOR_MAPPING);
        // Default sectors if mapping load failed
        if (availableSectors.length === 0) {
            ['Basic Materials', 'Consumer Cyclicals', 'Energy', 'Financials', 'Healthcare', 'Industrials', 'Infrastructure', 'Properties & Real Estate', 'Technology', 'Transportation & Logistic'].forEach(s => availableSectors.push(s));
        }

        for (const ticker of emitenList) {
            let found = false;

            // 1. Check in Sector Mapping
            for (const sector of availableSectors) {
                if (SECTOR_MAPPING[sector]?.includes(ticker)) {
                    // Check if file exists in this sector folder
                    const blobName = `stock/${sector}/${ticker}.csv`;
                    const stockBlob = containerClient.getBlockBlobClient(blobName);
                    if (await stockBlob.exists()) {
                        found = true;
                        break;
                    }
                }
            }

            // 2. Check Fallback Sector (Hash-based)
            if (!found) {
                const fallbackSector = getSectorFallback(ticker, availableSectors);
                const blobName = `stock/${fallbackSector}/${ticker}.csv`;
                const stockBlob = containerClient.getBlockBlobClient(blobName);
                if (await stockBlob.exists()) {
                    found = true;
                } else {
                    // Try to finding it anywhere
                    for (const sector of availableSectors) {
                        const blobName = `stock/${sector}/${ticker}.csv`;
                        const stockBlob = containerClient.getBlockBlobClient(blobName);
                        if (await stockBlob.exists()) {
                            found = true;
                            break;
                        }
                    }
                }
            }

            if (!found) {
                console.log(`❌ MISSING: ${ticker}`);
                missingCount++;
            } else {
                // console.log(`✅ Found: ${ticker} at ${foundLocation}`);
            }
        }

        console.log(`\nTotal Missing Stocks: ${missingCount}`);

    } catch (error) {
        console.error("Error checking stocks:", error);
    }
}

// Helper function to convert stream to string
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

checkMissingStocks();
