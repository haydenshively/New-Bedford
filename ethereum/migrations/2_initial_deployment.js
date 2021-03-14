const Treasury = artifacts.require("Treasury");
const Liquidator = artifacts.require("Liquidator");

module.exports = (deployer, network, accounts) => {
  let owner;
  let comptroller;
  let vanityDeployer;

  switch (network) {
    case "ganache-fork":
    case "ganache":
      owner = accounts[1];
      comptroller = "0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B";
      vanityDeployer = accounts[0];
      break;
    case "production-fork":
    case "production":
      owner = "0xF1c73bb23934127A2C1Fa4bA7520822574fE9bA7";
      comptroller = "0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B";
      vanityDeployer = accounts[1];
      break;
    default:
      console.error("Unknown network -- constructor args unspecified");
  }

  deployer.deploy(Treasury, owner, { from: vanityDeployer }).then((treasury) => {
    return deployer.deploy(
      Liquidator,
      treasury.address,
      comptroller,
      { from: vanityDeployer }
    );
  });
};
