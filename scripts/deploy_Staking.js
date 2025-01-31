// to deploy locally
// run: npx hardhat node on a terminal
// then run: npx hardhat run --network bsc scripts/deploy_Staking.js
const hre = require("hardhat");

function sleep(s) {
  return new Promise(resolve => setTimeout(resolve, s * 1000));
}

async function main() {

  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());
  let WEB3D = '0x7ed9054c48088bb8cfc5c5fbc32775b9455a13f7';
  let Web3DStakingStandard = await ethers.getContractFactory("Web3DStakingStandard");
  Web3DStakingStandard = await Web3DStakingStandard.deploy(WEB3D);
  console.log("Web3DStakingStandard address :", Web3DStakingStandard.address)

   await sleep(100);

  try {
    await hre.run("verify:verify", {
        address: Web3DStakingStandard.address,
        constructorArguments: [WEB3D],
    });
    console.log("Source Verified on Network");

  } catch (err) {
      console.log("error verify Web3DStakingStandard", err.message);
  }

}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

