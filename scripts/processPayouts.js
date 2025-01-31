require("dotenv").config();
const { ethers } = require("hardhat");
const fs = require("fs");
const csv = require("csv-parser");
const { parse } = require("json2csv");

const OWNER_ADDRESS = "0xcaE2D679961bd3e7501E9a48a9f820521bE6d1eE";
const STAKING_TOKEN_ADDRESS = "0x7ed9054c48088bb8cfc5c5fbc32775b9455a13f7";
const CSV_FILE = "staking_withdrawals.csv"; // Input file (will be updated with TX IDs)

async function processPayouts() {
    const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL);
    const wallet = new ethers.Wallet(process.env.PK, provider);
    const tokenContract = await ethers.getContractAt("StandardTokenWithAntibot", STAKING_TOKEN_ADDRESS, wallet);

    console.log("Reading CSV file...");

    let users = [];

    // Read CSV file asynchronously
    const readCSV = () => {
        return new Promise((resolve, reject) => {
            const results = [];
            fs.createReadStream(CSV_FILE)
                .pipe(csv())
                .on("data", (row) => {
                    // Normalize keys (remove extra spaces)
                    const cleanRow = {};
                    Object.keys(row).forEach((key) => {
                        cleanRow[key.trim()] = row[key].trim();
                    });
                    results.push(cleanRow);
                })
                .on("end", () => resolve(results))
                .on("error", (error) => reject(error));
        });
    };

    try {
        users = await readCSV();
        console.log(`Total users in CSV: ${users.length}`);
    } catch (error) {
        console.error("Error reading CSV file:", error);
        return;
    }

    let updatedUsers = [];

    for (const user of users) {
        try {
            const userAddress = user["User Address"];
            let totalPayout = user["Total Payout"];
            let transactionHash = user["Transaction Hash"];

            if (!userAddress || !totalPayout) {
                console.warn(`Skipping invalid entry: Address=${userAddress}, Payout=${totalPayout}`);
                updatedUsers.push(user);
                continue;
            }

            if (transactionHash !== "https://bscscan.com/tx/N/A") {
                console.log(`Skipping ${userAddress}, already processed (TX: ${transactionHash})`);
                updatedUsers.push(user);
                continue;
            }

            console.log(`Processing payout for: ${userAddress} | Payout: ${totalPayout}`);

            // Convert payout to BigNumber
            const payoutAmount = ethers.utils.parseEther(totalPayout.toString());

            // Send tokens
            console.log(`Sending ${ethers.utils.formatEther(payoutAmount)} tokens to ${userAddress}...`);
            const tx = await tokenContract.transfer(userAddress, payoutAmount);
            await tx.wait();

            console.log(`Transaction successful: ${tx.hash}`);

            // Update the row with the transaction hash
            user["Transaction Hash"] = `https://bscscan.com/tx/${tx.hash}`;
        } catch (error) {
            console.error(`Failed to process payout for ${user["User Address"]}:`, error);
            user["Transaction Hash"] = "ERROR"; // Mark failed transactions
        }

        updatedUsers.push(user);
    }

    // Convert updated data back to CSV format
    try {
        const csvData = parse(updatedUsers, { fields: Object.keys(updatedUsers[0]) });
        fs.writeFileSync(CSV_FILE, csvData);
        console.log("Updated CSV file saved with transaction hashes.");
    } catch (error) {
        console.error("Error writing CSV file:", error);
    }
}

// Run script
processPayouts()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Script failed:", error);
        process.exit(1);
    });
