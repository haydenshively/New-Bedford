require("dotenv-safe").config({
  example: process.env.CI ? ".env.ci.example" : ".env.example",
});

require("@nomiclabs/hardhat-truffle5");

const mochaConfig = {
  timeout: 180000,
  grep: "@latest-block",
};
let blockToFork = undefined;
if (process.env.KNOWN_BLOCK === "true") {
  blockToFork = 12138570;
  mochaConfig.grep = "@known-block";
} else if (process.env.KNOWN_BLOCK !== undefined) {
  blockToFork = Number(process.env.KNOWN_BLOCK);
  mochaConfig.grep = "@awesome-block";
}

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      forking: {
        url: `https://eth-mainnet.alchemyapi.io/v2/${process.env.PROVIDER_ALCHEMY_KEY}`,
        blockNumber: blockToFork,
      },
      accounts: [
        {
          privateKey: process.env.ACCOUNT_SECRET_VANITY,
          balance: "0xFFFFFFFFFFFFFFFF",
        },
        {
          privateKey: process.env.ACCOUNT_SECRET_OWNER,
          balance: "0xFFFFFFFFFFFFFFFF",
        },
      ],
    },
    mainnet: {
      url: `https://eth-mainnet.alchemyapi.io/v2/${process.env.PROVIDER_ALCHEMY_KEY}`, //`https://mainnet.infura.io/v3/${process.env.PROVIDER_INFURA_ID}`,
      accounts: [
        process.env.ACCOUNT_SECRET_VANITY,
        process.env.ACCOUNT_SECRET_DEPLOY,
        process.env.ACCOUNT_SECRET_OWNER,
      ],
      gasPrice: 90000000000,
      gasMultiplier: 1.15,
      timeout: 720000,
    },
  },
  solidity: {
    version: "0.8.3",
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
  mocha: mochaConfig,
};
