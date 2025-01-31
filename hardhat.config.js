require('@nomicfoundation/hardhat-toolbox')
require('dotenv').config()
require('hardhat-contract-sizer')
const PRIVATE_KEY = process.env.PK
/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: '0.8.17',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  mocha: {
    timeout: 100000000,
  },
  networks: {
    // mainnet: {
    //   url: `https://rpcapi.fantom.network`,
    //   chainId: 250,
    //   accounts: [`0x${PRIVATE_KEY}`]
    // },
    //goerli testnet
    bsc: {
      url: 'https://bsc-dataseed.binance.org',
      accounts: [`0x${PRIVATE_KEY}`],
    },
    goerli: {
      url: 'https://endpoints.omniatech.io/v1/eth/goerli/public',
      accounts: [`0x${PRIVATE_KEY}`],
    },

    testnet: {
      url: `https://data-seed-prebsc-1-s1.binance.org:8545`,
      chainId: 97,
      accounts: [`0x${PRIVATE_KEY}`],
    },
    mumbai: {
      url: 'https://rpc-mumbai.maticvigil.com/v1/bb7c100e9324f9c06e6d5839e0011a13123f7c0c',
      accounts: [`0x${PRIVATE_KEY}`],
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS ? true : false,
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
}
