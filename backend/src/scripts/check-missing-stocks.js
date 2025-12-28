
const { BlobServiceClient } = require("@azure/storage-blob");
const path = require("path");
const dotenv = require("dotenv");
const fs = require("fs");

// Load environment variables
const envPath = path.resolve(__dirname, "../../.env");
console.log(`Loading .env from: ${envPath}`);
dotenv.config({ path: envPath });

const CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const AZURE_CONTAINER = process.env.AZURE_STORAGE_CONTAINER_NAME || 'stock-trading-data';

if (!CONNECTION_STRING) {
    console.error("❌ AZURE_STORAGE_CONNECTION_STRING missing in .env");
    process.exit(1);
}

const blobServiceClient = BlobServiceClient.fromConnectionString(CONNECTION_STRING);
const containerClient = blobServiceClient.getContainerClient(AZURE_CONTAINER);

// Sector mapping cache
const SECTOR_MAPPING = {};

async function downloadText(blobName) {
    try {
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);
        const downloadBlockBlobResponse = await blockBlobClient.download(0);
        return await streamToString(downloadBlockBlobResponse.readableStreamBody);
    } catch (error) {
        // console.warn(`⚠️ Blob not found: ${blobName}`);
        return null;
    }
}

async function start() {
    console.log("🚀 Starting check using pure JS script...");

    // 1. Build Sector Mapping from CSV
    console.log("🔍 Reading sector_mapping.csv...");
    const mappingCsv = await downloadText("csv_input/sector_mapping.csv");

    if (mappingCsv) {
        const lines = mappingCsv.split("\n").map(l => l.trim()).filter(l => l);
        for (let i = 1; i < lines.length; i++) {
            const parts = lines[i].split(",");
            if (parts.length >= 2) {
                const sector = parts[0].trim();
                const emiten = parts[1].trim();
                if (!SECTOR_MAPPING[sector]) SECTOR_MAPPING[sector] = [];
                if (!SECTOR_MAPPING[sector].includes(emiten)) {
                    SECTOR_MAPPING[sector].push(emiten);
                }
            }
        }
    } else {
        console.warn("⚠️ sector_mapping.csv not found, using default fallback logic only.");
    }

    // 2. Get Emiten List
    console.log("🔍 Reading emiten_list.csv...");
    const emitenCsv = await downloadText("csv_input/emiten_list.csv");
    if (!emitenCsv) {
        console.error("❌ emiten_list.csv not found!");
        return;
    }

    let emitenList = [];
    const validStockParams = emitenCsv.split("\n").map(l => l.trim()).filter(l => l);
    // Skip header
    for (let i = 1; i < validStockParams.length; i++) {
        const parts = validStockParams[i].split(",");
        const code = parts[0].trim();
        if (code && code.length === 4) {
            emitenList.push(code);
        }
    }
    emitenList = [...new Set(emitenList)].sort();
    console.log(`📋 Found ${emitenList.length} unique stocks in emiten_list.csv`);

    // 3. Check blobs
    console.log("🔍 Checking missing files...");

    const sectors = Object.keys(SECTOR_MAPPING);

    const getSector = (emiten) => {
        for (const s in SECTOR_MAPPING) {
            if (SECTOR_MAPPING[s].includes(emiten)) return s;
        }
        // Fallback hash logic
        if (sectors.length === 0) return 'Technology';
        const hash = emiten.split('').reduce((a, b) => {
            a = ((a << 5) - a) + b.charCodeAt(0);
            return a & a;
        }, 0);
        return sectors[Math.abs(hash) % sectors.length] || 'Technology';
    };

    const missing = [];
    const found = [];

    // Parallel check with concurrency limit
    const batchSize = 50;
    for (let i = 0; i < emitenList.length; i += batchSize) {
        const batch = emitenList.slice(i, i + batchSize);
        await Promise.all(batch.map(async (stock) => {
            const sector = getSector(stock);
            const blobPath = `stock/${sector}/${stock}.csv`;
            const blockBlobClient = containerClient.getBlockBlobClient(blobPath);
            const exists = await blockBlobClient.exists();

            if (!exists) {
                missing.push({ stock, path: blobPath });
            } else {
                found.push(stock);
            }
        }));
        // console.log(`Processed ${Math.min(i + batchSize, emitenList.length)} / ${emitenList.length}`);
    }

    console.log('\n==================================================');
    console.log(`✅ Stocks FOUND: ${found.length}`);
    console.log(`❌ Stocks MISSING: ${missing.length}`);
    console.log('==================================================');

    if (missing.length > 0) {
        console.log('MISSING DATA (Top 100):');
        missing.slice(0, 100).forEach(m => console.log(`- ${m.stock} (Location: ${m.path})`));
        if (missing.length > 100) console.log(`... and ${missing.length - 100} others.`);
    }
}

// Helper
async function streamToString(readableStream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        readableStream.on("data", (data) => {
            chunks.push(data.toString());
        });
        readableStream.on("end", () => {
            resolve(chunks.join(""));
        });
        readableStream.on("error", reject);
    });
}

start().catch(console.error);
