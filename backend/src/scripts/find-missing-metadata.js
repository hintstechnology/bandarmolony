const { BlobServiceClient } = require('@azure/storage-blob');
const dotenv = require('dotenv');

dotenv.config();

const connectionString = process.env['AZURE_STORAGE_CONNECTION_STRING'] || "";
const containerName = process.env['AZURE_STORAGE_CONTAINER_NAME'] || "stock-trading-data";

if (!connectionString) {
    console.error("Please set AZURE_STORAGE_CONNECTION_STRING in your .env file");
    process.exit(1);
}

const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
const containerClient = blobServiceClient.getContainerClient(containerName);

async function streamToString(readableStream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        readableStream.on('data', (data) => chunks.push(data));
        readableStream.on('end', () => resolve(Buffer.concat(chunks).toString()));
        readableStream.on('error', reject);
    });
}

async function downloadCsv(blobName) {
    try {
        const blobClient = containerClient.getBlobClient(blobName);
        if (!(await blobClient.exists())) return "";
        const downloadResponse = await blobClient.download();
        return await streamToString(downloadResponse.readableStreamBody);
    } catch (error) {
        console.error(`Error downloading ${blobName}:`, error);
        return "";
    }
}

async function checkMissingMetadata() {
    console.log("🚀 Starting FINAL check for missing metadata...");

    // 1. Get all tickers from emiten_list.csv
    const emitenListCsv = await downloadCsv("csv_input/emiten_list.csv");
    const allTickers = emitenListCsv.split('\n')
        .map(line => line.trim().replace('\r', ''))
        .filter(line => line && line.length === 4)
        .map(t => t.toUpperCase());

    console.log(`📊 Found ${allTickers.length} tickers in emiten_list.csv`);

    // 2. Load Sector Mapping (Has header: sector,emiten)
    const sectorMappingCsv = await downloadCsv("csv_input/sector_mapping.csv");
    const sectorMap = new Map();
    const sectorLines = sectorMappingCsv.split('\n');
    for (const line of sectorLines) {
        const trimmed = line.trim().replace('\r', '');
        if (!trimmed || trimmed.toLowerCase().startsWith('sector,')) continue;

        const parts = trimmed.split(',');
        if (parts.length >= 2) {
            const sector = parts[0].trim();
            const ticker = parts[1].trim().toUpperCase();
            if (sector && ticker) {
                sectorMap.set(ticker, sector);
            }
        }
    }
    console.log(`📊 Loaded ${sectorMap.size} sector mappings`);

    // 3. Load Emiten Details (NO header: Index,Code,CompanyName,...)
    const emitenDetailCsv = await downloadCsv("csv_input/emiten_detail_list.csv");
    const companyMap = new Map();
    const detailLines = emitenDetailCsv.split('\n');

    for (const line of detailLines) {
        const trimmed = line.trim().replace('\r', '');
        if (!trimmed) continue;

        // Simple split first, if it fails to get code at index 1, skip
        const parts = trimmed.split(',');
        if (parts.length >= 3) {
            const code = parts[1].trim().toUpperCase();
            // If code is not 4 chars, it might be a header or malformed line
            if (code.length === 4) {
                // Name might have commas, so we take everything from index 2
                // But wait, the standard is Code at index 1.
                const name = parts.slice(2).join(',').replace(/^"|"$/g, '').trim();
                companyMap.set(code, name);
            }
        }
    }
    console.log(`📊 Loaded ${companyMap.size} company name mappings`);

    // 4. Find missing metadata
    const missingBoth = [];
    const missingSectorOnly = [];
    const missingCompanyOnly = [];

    for (const ticker of allTickers) {
        const hasSector = sectorMap.has(ticker);
        const hasCompany = companyMap.has(ticker);

        if (!hasSector && !hasCompany) {
            missingBoth.push(ticker);
        } else if (!hasSector) {
            missingSectorOnly.push(ticker);
        } else if (!hasCompany) {
            missingCompanyOnly.push(ticker);
        }
    }

    console.log("\n--- RESULTS ---");
    console.log(`❌ Missing BOTH Sector and Company Name (${missingBoth.length}):`);
    if (missingBoth.length > 0) {
        console.log(missingBoth.join(', '));
    } else {
        console.log("(None)");
    }

    console.log(`\n⚠️ Missing Sector ONLY (${missingSectorOnly.length}):`);
    if (missingSectorOnly.length > 0) {
        console.log(missingSectorOnly.join(', '));
    } else {
        console.log("(None)");
    }

    console.log(`\n⚠️ Missing Company Name ONLY (${missingCompanyOnly.length}):`);
    if (missingCompanyOnly.length > 0) {
        console.log(missingCompanyOnly.join(', '));
    } else {
        console.log("(None)");
    }

    console.log("\n--- Summary ---");
    console.log(`Total Tickers from emiten_list.csv: ${allTickers.length}`);
    console.log(`Missing Both: ${missingBoth.length}`);
    console.log(`Missing Sector: ${missingSectorOnly.length}`);
    console.log(`Missing Company: ${missingCompanyOnly.length}`);
}

checkMissingMetadata().catch(console.error);
