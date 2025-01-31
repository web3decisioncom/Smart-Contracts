// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";

contract PaymentProcessor is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable web3d;
    IERC20 public immutable usdt;
    IUniswapV2Router02 public immutable pancakeRouter;

    uint256 public auditPriceUSDT = 300 * 10 ** 18; // Audit price in USDT (18 decimals)
    uint256 public kycPriceUSDT = 300 * 10 ** 18;   // KYC price in USDT (18 decimals)

    struct User {
        uint256 totalPaidWEB3D;
        uint256 auditCount;
        uint256 kycCount;
    }

    mapping(address => User) public users;

    event ServicePayment(address indexed user, string service, uint256 amountWEB3D);
    event PricesUpdated(uint256 newAuditPriceUSDT, uint256 newKycPriceUSDT);

    /**
     * @dev Constructor to initialize the contract.
     * @param _web3d Address of the WEB3D token.
     * @param _usdt Address of the USDT token (used for price comparison).
     * @param _pancakeRouter Address of the PancakeSwap router.
     */
    constructor(
        address _web3d,
        address _usdt,
        address _pancakeRouter
    ) {
        require(_web3d != address(0), "Invalid WEB3D address");
        require(_usdt != address(0), "Invalid USDT address");
        require(_pancakeRouter != address(0), "Invalid PancakeRouter address");

        web3d = IERC20(_web3d);
        usdt = IERC20(_usdt);
        pancakeRouter = IUniswapV2Router02(_pancakeRouter);
    }

    /**
     * @notice Allows users to pay for the Audit service using WEB3D.
     * @dev Requires the user to approve WEB3D tokens before calling this function.
     */
    function payForAudit() external nonReentrant {
        uint256 web3dAmount = _getWEB3DAmountForUSDT(auditPriceUSDT);
        _processPayment(web3dAmount, "Audit");
        users[msg.sender].auditCount += 1;
    }

    /**
     * @notice Allows users to pay for the KYC service using WEB3D.
     * @dev Requires the user to approve WEB3D tokens before calling this function.
     */
    function payForKyc() external nonReentrant {
        uint256 web3dAmount = _getWEB3DAmountForUSDT(kycPriceUSDT);
        _processPayment(web3dAmount, "KYC");
        users[msg.sender].kycCount += 1;
    }

    /**
     * @notice Updates the USDT prices for Audit and KYC services.
     * @dev Only the owner can update the prices.
     * @param newAuditPriceUSDT New price of the Audit service in USDT (18 decimals).
     * @param newKycPriceUSDT New price of the KYC service in USDT (18 decimals).
     */
    function updatePrices(uint256 newAuditPriceUSDT, uint256 newKycPriceUSDT) external onlyOwner {
        require(newAuditPriceUSDT > 0, "Audit price must be greater than 0");
        require(newKycPriceUSDT > 0, "KYC price must be greater than 0");

        auditPriceUSDT = newAuditPriceUSDT;
        kycPriceUSDT = newKycPriceUSDT;

        emit PricesUpdated(newAuditPriceUSDT, newKycPriceUSDT);
    }

    /**
     * @notice Processes the payment by transferring WEB3D tokens.
     * @param amountWEB3D The amount of WEB3D tokens to transfer.
     * @param serviceName The name of the service being paid for.
     */
    function _processPayment(uint256 amountWEB3D, string memory serviceName) internal {
        require(web3d.balanceOf(msg.sender) >= amountWEB3D, "Insufficient WEB3D balance");
        require(web3d.allowance(msg.sender, address(this)) >= amountWEB3D, "Insufficient WEB3D allowance");

        web3d.safeTransferFrom(msg.sender, address(this), amountWEB3D);
        users[msg.sender].totalPaidWEB3D += amountWEB3D;

        emit ServicePayment(msg.sender, serviceName, amountWEB3D);
    }

    /**
     * @notice Calculates the required amount of WEB3D for a given USDT price.
     * @param usdtAmount The USDT amount to convert (18 decimals).
     * @return The equivalent amount of WEB3D (18 decimals).
     */
    function _getWEB3DAmountForUSDT(uint256 usdtAmount) public view returns (uint256) {
        address[] memory path = new address[](3);
        path[0] = address(web3d);          // Start with WEB3D
        path[1] = pancakeRouter.WETH();    // Intermediate token (WBNB)
        path[2] = address(usdt);           // Convert to USDT

        uint256[] memory amounts = pancakeRouter.getAmountsIn(usdtAmount, path);
        return amounts[0]; // Amount of WEB3D required
    }

    /**
     * @notice Allows the owner to withdraw accumulated WEB3D tokens from the contract.
     */
    function withdraw() external onlyOwner nonReentrant {
        uint256 balance = web3d.balanceOf(address(this));
        require(balance > 0, "No WEB3D to withdraw");
        web3d.safeTransfer(owner(), balance);
    }
}
