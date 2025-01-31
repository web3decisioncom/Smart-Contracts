const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Web3DStaking", function () {
  let Web3DStaking, web3DStaking, Web3DToken, web3DToken, owner, user1, user2, otherToken;

  const initialSupply = ethers.utils.parseEther("1000000"); // 1,000,000 tokens
  const poolId = 0; // Pool ID to test
  const lockDuration = 30 * 24 * 60 * 60; // 30 days
  const minDeposit = ethers.utils.parseEther("10000"); // 10,000 tokens
  const maxDeposit = ethers.utils.parseEther("20000"); // 20,000 tokens

  beforeEach(async function () {
    // Get signers
    [owner, user1, user2] = await ethers.getSigners();

    // Deploy the Web3DToken (ERC20 Token)
    Web3DToken = await ethers.getContractFactory("MockToken"); // OpenZeppelin's ERC20 implementation
    web3DToken = await Web3DToken.deploy("Web3DToken", "WEB3D", 18);
    await web3DToken.deployed();

    // Deploy the Web3DStaking contract
    Web3DStaking = await ethers.getContractFactory("Web3DStakingStandard");
    web3DStaking = await Web3DStaking.deploy(web3DToken.address);
    await web3DStaking.deployed();

    // Deploy another ERC20 token for recovery testing
    const OtherToken = await ethers.getContractFactory("MockToken");
    otherToken = await OtherToken.deploy("OtherToken", "OTH", 18);
    await otherToken.deployed();

    // Mint tokens for testing
    await web3DToken.mint(owner.address, initialSupply);
    await web3DToken.mint(user1.address, initialSupply);
    await web3DToken.mint(user2.address, initialSupply);
    await web3DToken.mint(web3DStaking.address, initialSupply);
    await otherToken.mint(owner.address, initialSupply);

  });

  it("Should set the correct token address", async function () {
    expect(await web3DStaking.web3dToken()).to.equal(web3DToken.address);
  });

  it("Should have initialized pools with correct parameters", async function () {
    const pool0 = await web3DStaking.pools(0);
    expect(pool0.apy).to.equal(10);
    expect(pool0.minDeposit).to.equal(minDeposit);
    expect(pool0.maxDeposit).to.equal(maxDeposit);
  });
  it("Should enable and disable staking", async function () {
    // Initially, staking should be enabled
    expect(await web3DStaking.stakingEnabled()).to.equal(true);

    // Disable staking
    await web3DStaking.setStakingEnabled(false);
    expect(await web3DStaking.stakingEnabled()).to.equal(false);

    // Enable staking again
    await web3DStaking.setStakingEnabled(true);
    expect(await web3DStaking.stakingEnabled()).to.equal(true);
  });
  it("Should reject deposits when staking is disabled", async function () {
    const depositAmount = ethers.utils.parseEther("15000"); // 15,000 tokens
    await web3DStaking.setStakingEnabled(false); // Disable staking

    await web3DToken.connect(user1).approve(web3DStaking.address, depositAmount);
    await expect(
      web3DStaking.connect(user1).deposit(poolId, depositAmount, lockDuration)
    ).to.be.revertedWith("Staking is currently disabled");
  });
  it("Should allow a user to deposit tokens into a pool when staking is enabled", async function () {
    await web3DStaking.setStakingEnabled(true); // Ensure staking is enabled

    const depositAmount = ethers.utils.parseEther("15000"); // 15,000 tokens

    // Approve the staking contract to spend user's tokens
    await web3DToken.connect(user1).approve(web3DStaking.address, depositAmount);

    // Deposit into pool
    await expect(
      web3DStaking.connect(user1).deposit(poolId, depositAmount, lockDuration)
    )
      .to.emit(web3DStaking, "Deposited")
      .withArgs(user1.address, poolId, depositAmount, lockDuration, 10);

    // Check user's stake
    const stakes = await web3DStaking.getUserStakes(user1.address);
    expect(stakes.length).to.equal(1);
    expect(stakes[0].amount).to.equal(depositAmount);

    // Check pool's total staked amount
    const pool = await web3DStaking.pools(poolId);
    expect(pool.totalStaked).to.equal(depositAmount);
  });

  it("Should reject deposits below the minimum or above the maximum deposit amount", async function () {
    const belowMinDeposit = ethers.utils.parseEther("5000"); // 5,000 tokens
    const aboveMaxDeposit = ethers.utils.parseEther("25000"); // 25,000 tokens

    // Approve the staking contract to spend user's tokens
    await web3DToken.connect(user1).approve(web3DStaking.address, aboveMaxDeposit);

    // Attempt deposits
    await expect(
      web3DStaking.connect(user1).deposit(poolId, belowMinDeposit, lockDuration)
    ).to.be.revertedWith("Deposit amount out of pool range");

    await expect(
      web3DStaking.connect(user1).deposit(poolId, aboveMaxDeposit, lockDuration)
    ).to.be.revertedWith("Deposit amount out of pool range");
  });

  it("Should allow the owner to update pool information", async function () {
    const newAPY = 12;
    const newMinDeposit = ethers.utils.parseEther("15000"); // 15,000 tokens
    const newMaxDeposit = ethers.utils.parseEther("30000"); // 30,000 tokens

    // Update pool
    await expect(
      web3DStaking.updatePool(poolId, newAPY, newMinDeposit, newMaxDeposit)
    )
      .to.emit(web3DStaking, "PoolUpdated")
      .withArgs(poolId, newAPY, newMinDeposit, newMaxDeposit);

    // Verify updated pool information
    const pool = await web3DStaking.pools(poolId);
    expect(pool.apy).to.equal(newAPY);
    expect(pool.minDeposit).to.equal(newMinDeposit);
    expect(pool.maxDeposit).to.equal(newMaxDeposit);
  });

  it("Should reject unauthorized updates to pool information", async function () {
    const newAPY = 15;
    const newMinDeposit = ethers.utils.parseEther("20000");
    const newMaxDeposit = ethers.utils.parseEther("50000");

    // Attempt to update pool information as a non-owner
    await expect(
      web3DStaking.connect(user1).updatePool(poolId, newAPY, newMinDeposit, newMaxDeposit)
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("Should calculate pending rewards correctly", async function () {
    const depositAmount = ethers.utils.parseEther("15000"); // 15,000 tokens

    // Approve and deposit into the pool
    await web3DToken.connect(user1).approve(web3DStaking.address, depositAmount);
    await web3DStaking.connect(user1).deposit(poolId, depositAmount, lockDuration);

    // Increase time to simulate staking duration
    await ethers.provider.send("evm_increaseTime", [15 * 24 * 60 * 60]); // 15 days
    await ethers.provider.send("evm_mine", []); // Mine a block

    // Calculate expected reward
    const elapsedTime = 15 * 24 * 60 * 60; // 15 days in seconds
    const apy = 10;
    const expectedReward = depositAmount.mul(apy).mul(elapsedTime).div(100).div(365 * 24 * 60 * 60);

    // Get pending rewards
    const pendingRewards = await web3DStaking.pendingReward(user1.address, poolId);
    expect(pendingRewards).to.be.closeTo(expectedReward, ethers.utils.parseEther("0.01")); // Small rounding tolerance
  });

  it("Should allow a user to withdraw their stake and rewards after lock period", async function () {
    const depositAmount = ethers.utils.parseEther("15000"); // 15,000 tokens

    // Approve and deposit into the pool
    await web3DToken.connect(user1).approve(web3DStaking.address, depositAmount);
    await web3DStaking.connect(user1).deposit(poolId, depositAmount, lockDuration);

    // Increase time to simulate lock period completion
    await ethers.provider.send("evm_increaseTime", [lockDuration]); // 30 days
    await ethers.provider.send("evm_mine", []); // Mine a block

    // Withdraw staked amount and rewards
    await expect(web3DStaking.connect(user1).withdraw(user1.address, poolId))
      .to.emit(web3DStaking, "Withdrawn");

    // Verify user's stakes are marked as claimed
    const stakes = await web3DStaking.getUserStakes(user1.address);
    expect(stakes[0].claimed).to.be.true;

    // Verify contract no longer holds user's stake
    const pool = await web3DStaking.pools(poolId);
    expect(pool.totalStaked).to.equal(0);
  });

  it("Should reject withdrawals before the lock period ends", async function () {
    const depositAmount = ethers.utils.parseEther("15000"); // 15,000 tokens

    // Approve and deposit into the pool
    await web3DToken.connect(user1).approve(web3DStaking.address, depositAmount);
    await web3DStaking.connect(user1).deposit(poolId, depositAmount, lockDuration);

    // Attempt to withdraw before lock duration
    await expect(web3DStaking.connect(user1).withdraw(user1.address, poolId)).to.be.revertedWith(
      "No stakes eligible for withdrawal"
    );
  });
  it("Should allow the owner to recover mistakenly sent ERC20 tokens", async function () {
    const recoveryAmount = ethers.utils.parseEther("50000"); // 50,000 tokens

    // Send tokens to staking contract by mistake
    await otherToken.transfer(web3DStaking.address, recoveryAmount);
    expect(await otherToken.balanceOf(web3DStaking.address)).to.equal(recoveryAmount);

    // Owner recovers tokens
    await expect(web3DStaking.recoverERC20(otherToken.address, recoveryAmount))
      .to.emit(web3DStaking, "ERC20Recovered")
      .withArgs(otherToken.address, recoveryAmount);

    // Check contract balance is zero after recovery
    expect(await otherToken.balanceOf(web3DStaking.address)).to.equal(0);
    expect(await otherToken.balanceOf(owner.address)).to.equal(initialSupply);
  });
  it("Should reject ERC20 recovery if called by a non-owner", async function () {
    const recoveryAmount = ethers.utils.parseEther("50000");

    // Send tokens to staking contract by mistake
    await otherToken.transfer(web3DStaking.address, recoveryAmount);

    // Attempt recovery by a non-owner
    await expect(
      web3DStaking.connect(user1).recoverERC20(otherToken.address, recoveryAmount)
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });
});
