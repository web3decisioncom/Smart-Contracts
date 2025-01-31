// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract MockPancakeRouter {
    address public immutable WETH;

    constructor(address _weth) {
        require(_weth != address(0), "Invalid WETH address");
        WETH = _weth;
    }

    /**
     * @notice Mock function to simulate getting the amount of input tokens required for a swap.
     * @dev Changed from `pure` to `view` to allow reading WETH.
     */
    function getAmountsIn(uint256 amountOut, address[] calldata path) external view returns (uint256[] memory amounts) {
        require(path.length >= 2, "Invalid path");
        amounts = new uint256[](path.length);

        uint256 mockWeb3dToUsdtRate = 10;
        uint256 mockBnbToUsdtRate = 1000;

        if (path.length == 2) {
            if (path[0] == address(0)) {
                amounts[0] = amountOut * mockBnbToUsdtRate;
            } else {
                amounts[0] = amountOut * mockWeb3dToUsdtRate;
            }
        } 
        else if (path.length == 3 && path[1] == WETH) {
            amounts[0] = (amountOut * mockWeb3dToUsdtRate * mockBnbToUsdtRate) / 100;
        } else {
            revert("Unsupported swap path");
        }

        amounts[path.length - 1] = amountOut;
    }

    /**
     * @notice Mock function to simulate getting the output amount for a given input.
     * @dev Changed from `pure` to `view` to allow reading WETH.
     */
    function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts) {
        require(path.length >= 2, "Invalid path");
        amounts = new uint256[](path.length);

        uint256 mockWeb3dToUsdtRate = 10;
        uint256 mockBnbToUsdtRate = 1000;

        if (path.length == 2) {
            if (path[0] == address(0)) {
                amounts[path.length - 1] = amountIn / mockBnbToUsdtRate;
            } else {
                amounts[path.length - 1] = amountIn / mockWeb3dToUsdtRate;
            }
        } 
        else if (path.length == 3 && path[1] == WETH) {
            amounts[path.length - 1] = (amountIn / mockWeb3dToUsdtRate) / mockBnbToUsdtRate;
        } else {
            revert("Unsupported swap path");
        }

        amounts[0] = amountIn;
    }
}
