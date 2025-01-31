// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

contract Web3DStaking is Ownable, ReentrancyGuard {

    struct PoolInfo {
        uint256 returnPer;
        uint256 endTime;
        uint256 maxStakeTime;
        uint256 starttime;
        uint256 totalStake;
        uint256 totalWithdrawal;
        uint256 totalRewardPending;
        uint256 totalRewardPaid;
        uint256 maxRewardAmount;
        uint256 minDeposit;                  // Minimum deposit amount required
        uint256 maxDeposit;                  // Maximum Deposit can be
    }
    struct OrderInfo {
        address beneficiary;
        uint256 pId;
        uint256 amount;
        uint256 returnPer;
        uint256 starttime;
        uint256 nextUnlock;
        uint256 endtime;
        uint256 selectedLock;
        uint256 claimedReward;
        bool claimed;
    }

    uint256 private constant _days365 = 31536000;
    uint256 private constant _oneDay = 86400;

    IERC20 public web3DToken;
    bool public started = true;
    uint256 public latestOrderId = 0;
    
    uint256 public latestpoolId = 0;
    mapping(uint256 => PoolInfo) public pooldata;
    mapping(address => uint256) public balanceOf;
    mapping(address => uint256) public totalRewardEarn;
    mapping(uint256 => OrderInfo) public orders;
    mapping(address => uint256[]) private orderIds;
    mapping(uint256 => uint256) public availableLocks;


    event Deposit(address indexed user, uint256 indexed lock, uint256 amount, uint256 returnPer);
    event Withdraw(address indexed user, uint256 amount, uint256 reward, uint256 total);
    event RewardClaimed(address indexed user, uint256 reward);
    constructor(address _token, bool _started) {
        web3DToken = IERC20(_token);
        started = _started;

        pooldata[latestpoolId].returnPer = 8;
        pooldata[latestpoolId].maxStakeTime = _days365;
        pooldata[latestpoolId].starttime = block.timestamp;
        pooldata[latestpoolId].maxRewardAmount =  20_000_000 ether;
        pooldata[latestpoolId].minDeposit =  100_000 ether;
        pooldata[latestpoolId].maxDeposit =  400_000 ether;
        ++latestpoolId;
        
        pooldata[latestpoolId].returnPer = 10;
        pooldata[latestpoolId].maxStakeTime = _days365;
        pooldata[latestpoolId].starttime = block.timestamp;
        pooldata[latestpoolId].maxRewardAmount = 25_000_000 ether;
        pooldata[latestpoolId].minDeposit =  400_000 ether;
        pooldata[latestpoolId].maxDeposit =  700_000 ether;
        ++latestpoolId;

        pooldata[latestpoolId].returnPer = 12;
        pooldata[latestpoolId].maxStakeTime = _days365;
        pooldata[latestpoolId].starttime = block.timestamp;
        pooldata[latestpoolId].maxRewardAmount = 35_000_000 ether;
        pooldata[latestpoolId].minDeposit =  700_000 ether;
        pooldata[latestpoolId].maxDeposit =  1_000_000 ether;
        ++latestpoolId;

        pooldata[latestpoolId].returnPer = 13;
        pooldata[latestpoolId].maxStakeTime = _days365;
        pooldata[latestpoolId].starttime = block.timestamp;
        pooldata[latestpoolId].maxRewardAmount = 45_000_000 ether;
        pooldata[latestpoolId].minDeposit =  1_000_000 ether;
        pooldata[latestpoolId].maxDeposit =  2_000_000 ether;
        ++latestpoolId;

        pooldata[latestpoolId].returnPer = 15;
        pooldata[latestpoolId].maxStakeTime = _days365;
        pooldata[latestpoolId].starttime = block.timestamp;
        pooldata[latestpoolId].maxRewardAmount = 50_000_000 ether;
        pooldata[latestpoolId].minDeposit =  2_000_000 ether;
        pooldata[latestpoolId].maxDeposit =  4_000_000 ether;
        ++latestpoolId;

        pooldata[latestpoolId].returnPer = 17;
        pooldata[latestpoolId].maxStakeTime = _days365;
        pooldata[latestpoolId].starttime = block.timestamp;
        pooldata[latestpoolId].maxRewardAmount = 55_000_000 ether;
        pooldata[latestpoolId].minDeposit =  4_000_000 ether;
        pooldata[latestpoolId].maxDeposit =  8_000_000 ether;
        ++latestpoolId;

        availableLocks[30] = 30 * _oneDay;
        availableLocks[60] = 60 * _oneDay;
        availableLocks[90] = 90 * _oneDay;
        availableLocks[120] = 120 * _oneDay;
        availableLocks[240] = 240 * _oneDay;
        availableLocks[270] = 270 * _oneDay;
        availableLocks[360] = 360 * _oneDay;
    }

    function deposit(uint256 _amount, uint256 _pid , uint256 _lock) external {
        PoolInfo storage pool = pooldata[_pid];
        require(availableLocks[_lock] > 0, "Web3D Staking: selected lock does not exist");
        require(started, "Web3D Staking: staking not yet started");
        require(_amount > 0, "Web3D Staking: stake amount must be non zero");
        require(_amount >= pool.minDeposit && _amount <= pool.maxDeposit, "deposit: wrong amount");

        uint256 APY = (_amount * pool.returnPer) / 100;
        uint256 userReward = (APY * pool.maxStakeTime) / _days365;
        uint256 requiredToken = (pool.totalStake - pool.totalWithdrawal) + pool.totalRewardPending + userReward;
        require(((pool.totalRewardPaid + requiredToken) <= pool.maxRewardAmount), "Web3D Staking: pool is full");
        require(web3DToken.transferFrom(_msgSender(), address(this), _amount), "Web3D Staking: web3DToken transferFrom via deposit not succeeded");

        orders[++latestOrderId] = OrderInfo( 
            _msgSender(),
            _pid,
            _amount,
            pool.returnPer,
            block.timestamp,
            block.timestamp + availableLocks[_lock],
            block.timestamp + pool.maxStakeTime,
            availableLocks[_lock],
            0,
            false
        );

        pool.totalStake += _amount; 
        pool.totalRewardPending += userReward; 
        balanceOf[_msgSender()] += _amount;
        orderIds[_msgSender()].push(latestOrderId); 
        emit Deposit(_msgSender(), availableLocks[_lock], _amount, pool.returnPer);
    }
    function claimRewards(uint256 orderId) external nonReentrant {
        require(orderId <= latestOrderId, "Web3D Staking: INVALID orderId, orderId greater than latestOrderId");
        OrderInfo storage orderInfo = orders[orderId];
        require(_msgSender() == orderInfo.beneficiary, "Web3D Staking: caller is not the beneficiary");
        require(!orderInfo.claimed, "Web3D Staking: order already unstaked");
        require(block.timestamp >= orderInfo.nextUnlock, "Web3D Staking: stake locked until lock duration completion");
        PoolInfo storage pool = pooldata[orderInfo.pId];
        uint256 claimAvailable = 0;
        if (block.timestamp >= orderInfo.endtime) {
                uint256 APY = (orderInfo.amount * orderInfo.returnPer) / 100;
                uint256 reward = (APY * _days365) / _days365;
                claimAvailable = reward - orderInfo.claimedReward;
                uint256 total = orderInfo.amount + claimAvailable;
                orderInfo.claimed = true;
                balanceOf[_msgSender()] -= orderInfo.amount; 
                pool.totalWithdrawal += orderInfo.amount;
                pool.totalRewardPaid  += claimAvailable;
                require(web3DToken.transfer(address(_msgSender()), total), "Web3D Staking: web3DToken transfer via withdraw not succeeded");
                emit Withdraw(_msgSender(), orderInfo.amount, claimAvailable, total);
            } else {
                uint256 stakeTime = block.timestamp - orderInfo.starttime;
                uint256 APY = (orderInfo.amount * orderInfo.returnPer) / 100;
                uint256 reward = (APY * stakeTime) / _days365;
                claimAvailable = reward - orderInfo.claimedReward;
                pool.totalRewardPaid  += claimAvailable;
                orderInfo.nextUnlock = block.timestamp + orderInfo.selectedLock;
                require(web3DToken.transfer(address(_msgSender()), claimAvailable), "Web3D Staking: web3DToken transfer via claim rewards not succeeded");
                emit RewardClaimed(address(_msgSender()), claimAvailable);
           
        }
        totalRewardEarn[_msgSender()] += claimAvailable;
        pool.totalRewardPending -= claimAvailable; 
        orderInfo.claimedReward += claimAvailable;
    }

    function pendingRewards(uint256 orderId) public view returns (uint256) {
        require(orderId <= latestOrderId, "Web3D Staking: INVALID orderId, orderId greater than latestOrderId");

        OrderInfo storage orderInfo = orders[orderId];
        if (!orderInfo.claimed) {
            if (block.timestamp >= orderInfo.endtime) {
                uint256 APY = (orderInfo.amount * orderInfo.returnPer) / 100;
                uint256 reward = (APY * orderInfo.endtime) / _days365;
                uint256 claimAvailable = reward - orderInfo.claimedReward;
                return claimAvailable;
            } else {
                uint256 stakeTime = block.timestamp - orderInfo.starttime;
                uint256 APY = (orderInfo.amount * orderInfo.returnPer) / 100;
                uint256 reward = (APY * stakeTime) / _days365;
                uint256 claimAvailableNow = reward - orderInfo.claimedReward;
                return claimAvailableNow;
            }
        } else {
            return 0;
        }
    }
    
    function setlocks(uint256 _days) public onlyOwner {
        availableLocks[_days] = _days * _oneDay;
    }
    function toggleStaking(bool _start) external onlyOwner returns (bool) {
        started = _start;
        return true;
    }

    function userOrderIds(address user) external view returns (uint256[] memory ids) {
        uint256[] memory arr = orderIds[user];
        return arr;
    }

    function transferAnyERC20Token(address payaddress, address tokenAddress, uint256 amount) external onlyOwner {
        IERC20(tokenAddress).transfer(payaddress, amount);
    }

    function addPool(uint256 _returnPer, uint256 _maxRewardAmount , uint256 _minDeposit, uint256 _maxDeposit, uint256 _maxStakeTime) external onlyOwner {
        pooldata[latestpoolId].returnPer = _returnPer;
        pooldata[latestpoolId].maxStakeTime = _maxStakeTime;
        pooldata[latestpoolId].starttime = block.timestamp;
        pooldata[latestpoolId].minDeposit =  _minDeposit * 10 ** 18;
        pooldata[latestpoolId].maxDeposit = _maxDeposit * 10 ** 18;
        pooldata[latestpoolId].maxRewardAmount = _maxRewardAmount;
        ++latestpoolId;
    }

    function updatePool(uint256 _returnPer, uint256 _maxRewardAmount , uint256 _pid, uint256 _minDeposit, uint256 _maxDeposit, uint256 _maxStakeTime) external onlyOwner {
        pooldata[_pid].returnPer = _returnPer;
        pooldata[_pid].maxStakeTime = _maxStakeTime;
        pooldata[_pid].minDeposit =  _minDeposit * 10 ** 18;
        pooldata[_pid].maxDeposit = _maxDeposit * 10 ** 18;
        pooldata[_pid].maxRewardAmount = _maxRewardAmount;
    }
}