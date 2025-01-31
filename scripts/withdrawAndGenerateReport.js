require("dotenv").config();
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");

const CONTRACT_ADDRESS = "0xa8C51818d9c95b648B1105033139B696be1D7091";
const STAKING_TOKEN_ADDRESS = "0x7ed9054c48088bb8cfc5c5fbc32775b9455a13f7";
const OWNER_ADDRESS = "0xcaE2D679961bd3e7501E9a48a9f820521bE6d1eE"; 
const CSV_FILE = "staking_withdrawals.csv";

// List of all users who deposited (including new ones)
const USERS = [
    "0x6AE2864B31b62d83015cc7EAFD093dD25397Cf68",
    "0x9DFe55d893033AC78361bC6c7cd378deA2a4Adf2",
    "0x56274c0abAAa31aFEeeff8EB238ecf03e3b2322D",
    "0x8f6d2f11E6952e28A4AA04Eb69594B63B1fE9E7F",
    "0xef62160A9a0F6F4322c496f0dd367F663ff17A86",
    "0x65df8a38e9bfB04bAD943708b527894949D8BD0A",
    "0xaFA09D92dCc7E31cdb7A172fc303A5AD775f5A60",
    "0xe60eD4CC6327b8F0648A3C608f38a4F99bC69dDC",
    "0xcaE2D679961bd3e7501E9a48a9f820521bE6d1eE",
    "0xbCfAb664d93bfdb97141F8fAACEC8Eabade9019d", // New User 1
    "0xf6C3F312028ddC512f967f514f20c98Ab7849952", // New User 2
    "0x10C12055a4Ce7CD8A9edc0732DfD0422a5eD6bF5", // New User 3
    "0xd798A7bd7E68277cc3448A6E6493353Ab82dE136"  // New User 4
]; 

async function main() {
    const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL);
    const wallet = new ethers.Wallet(process.env.PK, provider);

    const stakingContract = await ethers.getContractAt("Web3DStaking", CONTRACT_ADDRESS, wallet);
    const tokenContract = await ethers.getContractAt("StandardTokenWithAntibot", STAKING_TOKEN_ADDRESS, wallet);

    console.log("Fetching contract balance...");
    let contractBalance = await tokenContract.balanceOf(CONTRACT_ADDRESS);
    console.log(`Total tokens in contract: ${ethers.utils.formatEther(contractBalance)} WEB3D`);

    console.log("Fetching user deposits and rewards...");

    let existingUsers = new Set();

    // Read existing CSV file if it exists
    if (fs.existsSync(CSV_FILE)) {
        console.log("Reading existing CSV file...");
        const data = fs.readFileSync(CSV_FILE, "utf8");
        const rows = data.split("\n").slice(1); // Skip header
        for (const row of rows) {
            const columns = row.split(",");
            if (columns.length > 0) {
                existingUsers.add(columns[0].trim()); // Store user addresses
            }
        }
    }

    let report = "User Address, Deposited Amount, Rewards, Total Payout, Transaction Hash\n";
    let totalWithdrawAmount = ethers.BigNumber.from(0);

    for (const user of USERS) {
        if (existingUsers.has(user)) {
            console.log(`Skipping ${user}, already exists in CSV.`);
            continue;
        }

        let totalDeposit = ethers.BigNumber.from(0);
        let totalRewards = ethers.BigNumber.from(0);

        // Fetch all order IDs of the user
        const orderIds = await stakingContract.userOrderIds(user);
        if (orderIds.length === 0) {
            console.log(`No active deposits for ${user}`);
            continue;
        }

        let lastTransactionHash = "";

        for (const orderId of orderIds) {
            const orderInfo = await stakingContract.orders(orderId);
            if (!orderInfo.claimed) {
                // Sum up deposits
                totalDeposit = totalDeposit.add(orderInfo.amount);

                // Get pending rewards
                const pendingReward = await stakingContract.pendingRewards(orderId);
                totalRewards = totalRewards.add(pendingReward);

                lastTransactionHash = orderInfo.txHash || "N/A"; // Store last transaction hash
            }
        }

        const totalPayout = totalDeposit.add(totalRewards);
        totalWithdrawAmount = totalWithdrawAmount.add(totalPayout);

        console.log(`User: ${user} | Deposit: ${ethers.utils.formatEther(totalDeposit)} | Rewards: ${ethers.utils.formatEther(totalRewards)} | Total: ${ethers.utils.formatEther(totalPayout)}`);

        report += `${user},${ethers.utils.formatEther(totalDeposit)},${ethers.utils.formatEther(totalRewards)},${ethers.utils.formatEther(totalPayout)},${lastTransactionHash}\n`;
    }

    // Append new users to the CSV file
    fs.appendFileSync(CSV_FILE, report);
    console.log(`Updated CSV file with new users: ${CSV_FILE}`);

    // Withdraw ALL tokens from the contract to the owner
    console.log(`Withdrawing ${ethers.utils.formatEther(contractBalance)} tokens to owner...`);
    const tx = await stakingContract.transferAnyERC20Token(OWNER_ADDRESS, STAKING_TOKEN_ADDRESS, contractBalance);
    await tx.wait();
    console.log(`Withdrawal of ${ethers.utils.formatEther(contractBalance)} tokens complete.`);

    // Stop staking
    console.log("Stopping staking...");
    const stopTx = await stakingContract.toggleStaking(false);
    await stopTx.wait();
    console.log("Staking has been stopped.");

    console.log("Script execution completed.");
}

// Run script
main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error("Script failed:", error);
        process.exit(1);
    });
