// to deploy locally
// run: npx hardhat node on a terminal
// then run: npx hardhat run --network bsc scripts/deploy_PaymentProcessor_Allow.js
const hre = require("hardhat");

function sleep(s) {
  return new Promise(resolve => setTimeout(resolve, s*1000));
}

async function main() {
  
  const [deployer] = await ethers.getSigners();
  
  console.log("Deploying contracts with the account:", deployer.address);

  console.log("Account balance:", (await deployer.getBalance()).toString());
  let WEB3D =  await ethers.getContractFactory("StandardTokenWithAntibot");
  WEB3D = await WEB3D.attach("0x7ed9054c48088bb8cfc5c5fbc32775b9455a13f7");
 let tx =  await WEB3D.connect(deployer).approve("0x780C58cc74a18228022dc4aA3b6Acaacc70c3C7d", ethers.utils.parseUnits("100000000000", 18));
console.log("tx  : " , tx)

}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

