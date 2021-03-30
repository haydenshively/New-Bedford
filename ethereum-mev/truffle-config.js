require("dotenv-safe").config({
  example: process.env.CI ? ".env.ci.example" : ".env.example",
});

const ganache = require("ganache-cli");
const HDWalletProvider = require("@truffle/hdwallet-provider");

const { ProviderFor } = require("./providers");

// IPC provider is the fastest for tests that can run on the most up-to-date
// mainnet data, but it can't be used for forking at a specific block.
// WS provider is used in order to run tests in the CI
const mainnet_ws = ProviderFor("mainnet", {
  type: "WS_Infura",
  envKeyID: "PROVIDER_INFURA_ID",
});
// Alchemy allows for forking at a specific block, which lets us use
// hard-coded values to test liquidation abilities
const mainnet_alchemy = ProviderFor("mainnet", {
  type: "HTTP_Alchemy",
  envKeyKey: "PROVIDER_ALCHEMY_KEY",
});
const maxUINT256 = "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF";

const mainnet_ipc = ProviderFor("mainnet", {
  type: "IPC",
  envKeyPath: "PROVIDER_IPC_PATH",
})

const ganacheServerConfig = {
  fork: mainnet_ws,
  accounts: [
    {
      balance: maxUINT256,
      // secretKey: "0x" + process.env.ACCOUNT_SECRET_TEST,
    },
    { balance: "0x0" },
    { balance: "0x0" },
    { balance: "0x0" },
  ],
  ws: true,
};
const mochaConfig = { grep: "@latest-block" };
if (process.env.KNOWN_BLOCK === "true") {
  ganacheServerConfig.fork = mainnet_ipc;
  // ganacheServerConfig.fork_block_number = "12132635";
  mochaConfig.grep = "@known-block";
}

// Start ganache server. Sometimes it won't get used, but this seems to be the
// only place it can be put and function correctly
const ganacheServer = ganache.server(ganacheServerConfig);
ganacheServer.listen(8546, "127.0.0.1");

module.exports = {
  /**
   * Networks define how you connect to your ethereum client and let you set the
   * defaults web3 uses to send transactions. If you don't specify one truffle
   * will spin up a development blockchain for you on port 9545 when you
   * run `develop` or `test`. You can ask a truffle command to use a specific
   * network from the command line, e.g
   *
   * $ truffle test --network <network-name>
   */

  networks: {
    ganache: {
      port: 8546,
      host: "127.0.0.1",
      network_id: "*",
    },

    production: {
      provider: () =>
        new HDWalletProvider(
          [
            process.env.ACCOUNT_SECRET_DEPLOY,
            process.env.ACCOUNT_SECRET_VANITY,
            process.env.ACCOUNT_SECRET_OWNER,
          ],
          "https://mainnet.infura.io/v3/" + process.env.PROVIDER_INFURA_ID
        ),
      network_id: "*",
      gasPrice: 175e9,
      gas: 1000000,
    },
  },

  // Set default mocha options here, use special reporters etc.
  mocha: mochaConfig,

  // Configure your compilers
  compilers: {
    solc: {
      version: "0.8.0", // Fetch exact version from solc-bin (default: truffle's version)
      docker: false, // Use "0.5.1" you've installed locally with docker (default: false)
      settings: {
        // See the solidity docs for advice about optimization and evmVersion
        optimizer: {
          enabled: true,
          runs: 1337,
        },
        evmVersion: "byzantium",
      },
    },
  },
};
