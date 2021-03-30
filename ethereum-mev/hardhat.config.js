require("dotenv-safe").config({
  example: process.env.CI ? ".env.ci.example" : ".env.example",
});

require("@nomiclabs/hardhat-truffle5");

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      forking: {
        url:
          "https://eth-mainnet.alchemyapi.io/v2/nIseWZfbUbq2OC06HrB5ouYBT6MX1aBc",
      },
      accounts: [
        {
          privateKey: process.env.ACCOUNT_SECRET_VANITY,
          balance: '0xFFFFFFFFFFFFFFFF'
        }
      ],
    },
    mainnet: {
      url: `https://mainnet.infura.io/v3/${process.env.PROVIDER_INFURA_ID}`,
      accounts: [
        process.env.ACCOUNT_SECRET_DEPLOY,
        process.env.ACCOUNT_SECRET_VANITY,
        process.env.ACCOUNT_SECRET_OWNER,
      ],
    },
  },
  solidity: {
    version: "0.8.0",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1337,
      },
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    artifacts: "./build",
  },
  mocha: {
    timeout: 20000,
  },
};
