require("dotenv").config();

const HDWalletProvider = require("@truffle/hdwallet-provider");

module.exports = {
  networks: {
    development: {
      provider: () =>
        new HDWalletProvider(
          process.env.ACCOUNT_SECRET_TEST,
          "https://ropsten.infura.io/v3/" + process.env.PROVIDER_INFURA_ID
        ),
      gas: 4000000,
      gasPrice: 20e9,
      networkId: "*"
    },
    production: {
      provider: () =>
        new HDWalletProvider(
          process.env.ACCOUNT_SECRET_TEST,
          "https://mainnet.infura.io/v3/" + process.env.PROVIDER_INFURA_ID
        ),
      gas: 4000000,
      gasPrice: 20e9,
      networkId: "*"
    }
  }
};
