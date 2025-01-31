// to deploy locally
// run: npx hardhat node on a terminal
// then run: npx hardhat run --network bsc scripts/deploy_PaymentProcessor.js
const hre = require("hardhat");

function sleep(s) {
  return new Promise(resolve => setTimeout(resolve, s * 1000));
}

async function main() {

  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);

  console.log("Account balance:", (await deployer.getBalance()).toString());
  let WEB3D = '0x7ed9054c48088bb8cfc5c5fbc32775b9455a13f7';
  let USDT = '0x55d398326f99059ff775485246999027b3197955';
  let PancakeRouter = '0x10ED43C718714eb63d5aA57B78B54704E256024E'
  let PaymentProcessor = await ethers.getContractFactory("PaymentProcessor");
  let WEB3DC =  await ethers.getContractFactory("StandardTokenWithAntibot");

  PaymentProcessor = await PaymentProcessor.deploy(WEB3D,USDT, PancakeRouter);


  console.log("PaymentProcessor.address :", PaymentProcessor.address)

  WEB3DC = await WEB3DC.attach("0x7ed9054c48088bb8cfc5c5fbc32775b9455a13f7");
  let tx =  await WEB3DC.connect(deployer).approve(PaymentProcessor.address, ethers.utils.parseUnits("100000000000", 18));
  console.log("tx  : " , tx)
  await PaymentProcessor.connect(deployer).updatePrices(ethers.utils.parseUnits("1", 18),ethers.utils.parseUnits("1", 18));

   await sleep(100);

  try {
    await hre.run("verify:verify", {
        address: PaymentProcessor.address,
        constructorArguments: [WEB3D,USDT, PancakeRouter],
    });
    console.log("Source Verified on Network");

  } catch (err) {
      console.log("error verify PaymentProcessor", err.message);
  }

}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

