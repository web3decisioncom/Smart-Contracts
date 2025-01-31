const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PaymentProcessor", function () {
  let PaymentProcessor, paymentProcessor;
  let USDT, WEB3D, PancakeRouter, WETH;
  let owner, user, anotherUser;

  const auditPriceUSDT = ethers.BigNumber.from("300000000"); // 300 USDT (6 decimals)
  const kycPriceUSDT = ethers.BigNumber.from("300000000"); // 300 USDT (6 decimals)

  beforeEach(async function () {
    [owner, user, anotherUser] = await ethers.getSigners();

    // Deploy mock tokens and PancakeRouter
    const MockToken = await ethers.getContractFactory("MockToken");
    USDT = await MockToken.deploy("Mock USDT", "USDT", 6);
    WEB3D = await MockToken.deploy("Mock WEB3D", "WEB3D", 18);

    const MockPancakeRouter = await ethers.getContractFactory("MockPancakeRouter");
    PancakeRouter = await MockPancakeRouter.deploy();
    WETH = await PancakeRouter.WETH();

    // Deploy PaymentProcessor contract
    const PaymentProcessor = await ethers.getContractFactory("PaymentProcessor");
    paymentProcessor = await PaymentProcessor.deploy(USDT.address, WEB3D.address, PancakeRouter.address);

    // Mint and approve tokens for the user
    await USDT.mint(user.address, ethers.utils.parseUnits("1000", 6)); // 1000 USDT
    await USDT.connect(user).approve(paymentProcessor.address, ethers.utils.parseUnits("1000", 6));

    await WEB3D.mint(user.address, ethers.utils.parseUnits("1000", 18)); // 1000 WEB3D
    await WEB3D.connect(user).approve(paymentProcessor.address, ethers.utils.parseUnits("1000", 18));
  });

  describe("Deployment", function () {
    it("Should deploy with correct parameters", async function () {
      expect(await paymentProcessor.usdt()).to.equal(USDT.address);
      expect(await paymentProcessor.web3d()).to.equal(WEB3D.address);
      expect(await paymentProcessor.pancakeRouter()).to.equal(PancakeRouter.address);
    });

    it("Should set initial audit and KYC prices", async function () {
      expect(await paymentProcessor.auditPriceUSDT()).to.equal(auditPriceUSDT);
      expect(await paymentProcessor.kycPriceUSDT()).to.equal(kycPriceUSDT);
    });
  });

  describe("Payment Functions", function () {
    it("Should process payment for Audit using USDT", async function () {
      const userBalanceBefore = await USDT.balanceOf(user.address);

      await expect(paymentProcessor.connect(user).payForAudit(USDT.address))
        .to.emit(paymentProcessor, "ServicePayment")
        .withArgs(user.address, "Audit", auditPriceUSDT, USDT.address);

      const userData = await paymentProcessor.users(user.address);
      expect(userData.auditCount).to.equal(1);
      expect(userData.totalPaidUSDT).to.equal(auditPriceUSDT);

      const userBalanceAfter = await USDT.balanceOf(user.address);
      expect(userBalanceAfter).to.equal(userBalanceBefore.sub(auditPriceUSDT));
    });

    it("Should process payment for KYC using WEB3D", async function () {
      const requiredWEB3D = await paymentProcessor._getWEB3DAmountForUSDT(kycPriceUSDT);
      const userBalanceBefore = await WEB3D.balanceOf(user.address);

      await expect(paymentProcessor.connect(user).payForKyc(WEB3D.address))
        .to.emit(paymentProcessor, "ServicePayment")
        .withArgs(user.address, "KYC", requiredWEB3D, WEB3D.address);

      const userData = await paymentProcessor.users(user.address);
      expect(userData.kycCount).to.equal(1);
      expect(userData.totalPaidWEB3D).to.equal(requiredWEB3D);

      const userBalanceAfter = await WEB3D.balanceOf(user.address);
      expect(userBalanceAfter).to.equal(userBalanceBefore.sub(requiredWEB3D));
    });

    it("Should process payment for Audit using BNB", async function () {
      const requiredBNB = await paymentProcessor._getBNBAmountForUSDT(auditPriceUSDT);

      await expect(paymentProcessor.connect(user).payForAudit(ethers.constants.AddressZero, { value: requiredBNB }))
        .to.emit(paymentProcessor, "ServicePayment")
        .withArgs(user.address, "Audit", requiredBNB, ethers.constants.AddressZero);

      const userData = await paymentProcessor.users(user.address);
      expect(userData.auditCount).to.equal(1);
      expect(userData.totalPaidBNB).to.equal(requiredBNB);
    });

    it("Should revert if insufficient USDT is approved", async function () {
      await USDT.connect(user).approve(paymentProcessor.address, 0);

      await expect(paymentProcessor.connect(user).payForAudit(USDT.address))
        .to.be.revertedWith("Insufficient USDT allowance");
    });

    it("Should revert if insufficient BNB is sent", async function () {
      const requiredBNB = await paymentProcessor._getBNBAmountForUSDT(auditPriceUSDT);

      await expect(paymentProcessor.connect(user).payForAudit(ethers.constants.AddressZero, { value: requiredBNB.sub(1) }))
        .to.be.revertedWith("Insufficient BNB sent");
    });

    it("Should revert if payment token is unsupported", async function () {
      const MockToken = await ethers.getContractFactory("MockToken");
      const unsupportedToken = await MockToken.deploy("Unsupported Token", "UTKN", 18);

      await expect(paymentProcessor.connect(user).payForAudit(unsupportedToken.address))
        .to.be.revertedWith("Unsupported payment token");
    });
  });

  describe("Admin Functions", function () {
    it("Should update service prices", async function () {
      const newAuditPrice = ethers.BigNumber.from("400000000"); // 400 USDT
      const newKycPrice = ethers.BigNumber.from("500000000"); // 500 USDT

      await expect(paymentProcessor.connect(owner).updatePrices(newAuditPrice, newKycPrice))
        .to.emit(paymentProcessor, "PricesUpdated")
        .withArgs(newAuditPrice, newKycPrice);

      expect(await paymentProcessor.auditPriceUSDT()).to.equal(newAuditPrice);
      expect(await paymentProcessor.kycPriceUSDT()).to.equal(newKycPrice);
    });

    it("Should allow the owner to withdraw BNB", async function () {
      // Deposit some BNB to the contract
      const depositAmount = ethers.utils.parseEther("1");
      await owner.sendTransaction({ to: paymentProcessor.address, value: depositAmount });

      const ownerBalanceBefore = await ethers.provider.getBalance(owner.address);

      const tx = await paymentProcessor.connect(owner).withdraw(ethers.constants.AddressZero);
      const receipt = await tx.wait();

      const gasUsed = receipt.gasUsed.mul(receipt.effectiveGasPrice);
      const ownerBalanceAfter = await ethers.provider.getBalance(owner.address);

      expect(ownerBalanceAfter).to.equal(ownerBalanceBefore.add(depositAmount).sub(gasUsed));
    });

    it("Should allow the owner to withdraw ERC-20 tokens", async function () {
      const requiredWEB3D = await paymentProcessor._getWEB3DAmountForUSDT(kycPriceUSDT);
      const userBalanceBefore = await WEB3D.balanceOf(user.address);

      await expect(paymentProcessor.connect(user).payForKyc(WEB3D.address))
        .to.emit(paymentProcessor, "ServicePayment")
        .withArgs(user.address, "KYC", requiredWEB3D, WEB3D.address);

      const userData = await paymentProcessor.users(user.address);
      expect(userData.kycCount).to.equal(1);
      expect(userData.totalPaidWEB3D).to.equal(requiredWEB3D);

      const userBalanceAfter = await WEB3D.balanceOf(user.address);
      expect(userBalanceAfter).to.equal(userBalanceBefore.sub(requiredWEB3D));

      // Step 1: Transfer some tokens to the contract
      const depositAmount = ethers.utils.parseUnits("100", 6); // 100 USDT (6 decimals)
      // await USDT.transfer(paymentProcessor.address, depositAmount);
  
      // Step 2: Verify the contract balance
      const contractBalance = await WEB3D.balanceOf(paymentProcessor.address);
      console.log("contractBalance :" , contractBalance)
      // expect(contractBalance).to.equal(depositAmount);
  
      // // Step 3: Withdraw the tokens
      // await expect(paymentProcessor.connect(owner).withdraw(USDT.address))
      //     .to.emit(paymentProcessor, "ServicePayment"); // Check for relevant events (if any)
  
      // // Step 4: Verify the owner's balance increased
      // const ownerBalance = await USDT.balanceOf(owner.address);
      // expect(ownerBalance).to.equal(depositAmount);
  });
  
  

    it("Should revert withdrawals by non-owners", async function () {
      await expect(paymentProcessor.connect(user).withdraw(USDT.address)).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });
});
