// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title Web3D Staking
 * @notice This contract allows users to deposit WEB3D tokens and earn rewards based on fixed APY percentages and lock durations.
 * @dev Supports lock durations of 30, 60, or 90 days with predefined pools offering varying APYs and deposit limits.
 */
contract Web3DStakingStandard is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Represents the staking pool details
    struct Pool {
        uint256 apy; // Annual Percentage Yield (in %)
        uint256 minDeposit; // Minimum deposit amount for the pool
        uint256 maxDeposit; // Maximum deposit amount for the pool
        uint256 totalStaked; // Total tokens staked in the pool
    }

    /// @notice Represents details of a user's staking order
    struct Stake {
        uint256 poolId; // Pool ID the user selected
        uint256 amount; // Amount of tokens staked
        uint256 startTime; // Timestamp of when the staking began
        uint256 lockDuration; // Lock duration in seconds
        bool claimed; // Whether the stake has been claimed
    }

    IERC20 public immutable web3dToken; // The staking token (WEB3D)
    uint256 public constant DAY = 1 days;
    bool public stakingEnabled = true; // variable to control staking status
    
    // Available lock durations (30, 60, 90 days)
    uint256[] public lockDurations = [30 * DAY, 60 * DAY, 90 * DAY];

    // Predefined pools with fixed APY rates and deposit ranges
    Pool[] public pools;

    // User stakes
    mapping(address => Stake[]) public userStakes;

    /// @notice Event emitted when a user makes a deposit
    event Deposited(
        address indexed user,
        uint256 indexed poolId,
        uint256 amount,
        uint256 lockDuration,
        uint256 apy
    );

    /// @notice Event emitted when a user withdraws rewards and staked amount
    event Withdrawn(
        address indexed user,
        uint256 indexed poolId,
        uint256 totalAmount,
        uint256 reward
    );

    /// @notice Event emitted when the owner updates a pool
    event PoolUpdated(
        uint256 indexed poolId,
        uint256 apy,
        uint256 minDeposit,
        uint256 maxDeposit
    );
    event StakingStatusChanged(bool enabled); // event for staking toggle
    event ERC20Recovered(address token, uint256 amount); // event for token recovery

    /**
     * @param _web3dToken The address of the WEB3D token contract
     */
    constructor(address _web3dToken) {
        require(_web3dToken != address(0), "Invalid token address");
        web3dToken = IERC20(_web3dToken);

        // Initialize staking pools with fixed APYs and deposit limits
        pools.push(
            Pool({
                apy: 10,
                minDeposit: 10_000 ether,
                maxDeposit: 20_000 ether,
                totalStaked: 0
            })
        ); // Pool 0
        pools.push(
            Pool({
                apy: 13,
                minDeposit: 20_000 ether,
                maxDeposit: 40_000 ether,
                totalStaked: 0
            })
        ); // Pool 1
        pools.push(
            Pool({
                apy: 16,
                minDeposit: 40_000 ether,
                maxDeposit: 70_000 ether,
                totalStaked: 0
            })
        ); // Pool 2
        pools.push(
            Pool({
                apy: 20,
                minDeposit: 70_000 ether,
                maxDeposit: 100_000 ether,
                totalStaked: 0
            })
        ); // Pool 3
        pools.push(
            Pool({
                apy: 24,
                minDeposit: 100_000 ether,
                maxDeposit: 150_000 ether,
                totalStaked: 0
            })
        ); // Pool 4
        pools.push(
            Pool({
                apy: 28,
                minDeposit: 150_000 ether,
                maxDeposit: 300_000 ether,
                totalStaked: 0
            })
        ); // Pool 5
    }

    /**
     * @notice Deposit tokens in a selected pool with a specified lock duration.
     * @param _poolId The ID of the staking pool (0-5)
     * @param _amount The amount of tokens to deposit
     * @param _lockDuration The lock duration (30, 60, or 90 days)
     */
    function deposit(
        uint256 _poolId,
        uint256 _amount,
        uint256 _lockDuration
    ) external nonReentrant {
        require(_poolId < pools.length, "Invalid pool ID");
        require(_isValidLockDuration(_lockDuration), "Invalid lock duration");
        require(stakingEnabled, "Staking is currently disabled"); // Prevent deposits if staking is disabled


        Pool storage pool = pools[_poolId];
        require(
            _amount >= pool.minDeposit && _amount <= pool.maxDeposit,
            "Deposit amount out of pool range"
        );

        // Transfer tokens from the user to the contract
        web3dToken.safeTransferFrom(msg.sender, address(this), _amount);

        // Record the user's stake
        userStakes[msg.sender].push(
            Stake({
                poolId: _poolId,
                amount: _amount,
                startTime: block.timestamp,
                lockDuration: _lockDuration,
                claimed: false
            })
        );

        // Update the total staked amount in the pool
        pool.totalStaked += _amount;

        emit Deposited(msg.sender, _poolId, _amount, _lockDuration, pool.apy);
    }

    /**
     * @notice Withdraw rewards and staked amount for a user from a specific pool.
     * @param _user The address of the user
     * @param _poolId The ID of the pool
     */
    function withdraw(address _user, uint256 _poolId) external nonReentrant {
        require(_poolId < pools.length, "Invalid pool ID");
        require(_user == msg.sender, "Cannot withdraw for another user");

        Stake[] storage stakes = userStakes[_user];
        Pool storage pool = pools[_poolId];

        uint256 totalStakedToWithdraw = 0;
        uint256 totalReward = 0;

        for (uint256 i = 0; i < stakes.length; i++) {
            Stake storage stakeData = stakes[i];

            if (stakeData.poolId == _poolId && !stakeData.claimed) {
                // Check if the lock duration has ended
                if (
                    block.timestamp >=
                    stakeData.startTime + stakeData.lockDuration
                ) {
                    uint256 reward = _calculateReward(
                        stakeData.amount,
                        pool.apy,
                        stakeData.lockDuration
                    );
                    totalStakedToWithdraw += stakeData.amount;
                    totalReward += reward;

                    // Mark the stake as claimed
                    stakeData.claimed = true;
                }
            }
        }

        require(totalStakedToWithdraw > 0, "No stakes eligible for withdrawal");

        // Update the pool's total staked amount
        pool.totalStaked -= totalStakedToWithdraw;

        // Transfer the total staked amount and rewards to the user
        uint256 totalAmount = totalStakedToWithdraw + totalReward;
        web3dToken.safeTransfer(_user, totalAmount);

        emit Withdrawn(_user, _poolId, totalStakedToWithdraw, totalReward);
    }

    /**
     * @notice Update pool information (only callable by the owner).
     * @param _poolId The ID of the pool to update
     * @param _apy The new APY for the pool
     * @param _minDeposit The new minimum deposit for the pool
     * @param _maxDeposit The new maximum deposit for the pool
     */
    function updatePool(
        uint256 _poolId,
        uint256 _apy,
        uint256 _minDeposit,
        uint256 _maxDeposit
    ) external onlyOwner {
        require(_poolId < pools.length, "Invalid pool ID");
        require(
            _minDeposit > 0 && _maxDeposit > _minDeposit,
            "Invalid deposit range"
        );

        Pool storage pool = pools[_poolId];
        pool.apy = _apy;
        pool.minDeposit = _minDeposit;
        pool.maxDeposit = _maxDeposit;

        emit PoolUpdated(_poolId, _apy, _minDeposit, _maxDeposit);
    }

    /**
     * @notice Get the pending rewards for a specific pool for a user.
     * @param _user The address of the user
     * @param _poolId The ID of the pool
     * @return totalReward The pending reward amount
     */
    function pendingReward(
        address _user,
        uint256 _poolId
    ) external view returns (uint256 totalReward) {
        Stake[] storage stakes = userStakes[_user];

        for (uint256 i = 0; i < stakes.length; i++) {
            Stake storage stakeData = stakes[i];

            if (stakeData.poolId == _poolId && !stakeData.claimed) {
                uint256 elapsedTime = block.timestamp >
                    (stakeData.startTime + stakeData.lockDuration)
                    ? stakeData.lockDuration
                    : block.timestamp - stakeData.startTime;

                Pool storage pool = pools[_poolId];
                totalReward += _calculateReward(
                    stakeData.amount,
                    pool.apy,
                    elapsedTime
                );
            }
        }
    }

    /**
     * @dev Calculate the reward for a given stake.
     * @param _amount The staked amount
     * @param _apy The APY of the pool
     * @param _duration The duration (in seconds)
     * @return reward The calculated reward amount
     */
    function _calculateReward(
        uint256 _amount,
        uint256 _apy,
        uint256 _duration
    ) internal pure returns (uint256 reward) {
        return (_amount * _apy * _duration) / (100 * 365 days);
    }

    /**
     * @dev Check if a lock duration is valid.
     * @param _lockDuration The lock duration to check
     * @return isValid True if the lock duration is valid, false otherwise
     */
    function _isValidLockDuration(
        uint256 _lockDuration
    ) internal view returns (bool isValid) {
        for (uint256 i = 0; i < lockDurations.length; i++) {
            if (lockDurations[i] == _lockDuration) {
                return true;
            }
        }
        return false;
    }

    /**
     * @notice Get all stakes of a specific user.
     * @param _user The address of the user.
     * @return stakes An array of `Stake` structs belonging to the user.
     */
    function getUserStakes(address _user) external view returns (Stake[] memory stakes) {
        return userStakes[_user];
    }
    /**
     * @notice Recover any ERC20 tokens sent to the contract by mistake.
     * @dev Only callable by the owner.
     * @param _token The address of the ERC20 token.
     * @param _amount The amount of tokens to recover.
     */
    function recoverERC20(address _token, uint256 _amount) external onlyOwner {
        require(_token != address(0), "Invalid token address");
        IERC20(_token).safeTransfer(owner(), _amount);
        emit ERC20Recovered(_token, _amount);
    }

    /**
     * @notice Enable or disable staking.
     * @param _enabled True to enable staking, false to disable.
     */
    function setStakingEnabled(bool _enabled) external onlyOwner {
        stakingEnabled = _enabled;
        emit StakingStatusChanged(_enabled);
    }
}
