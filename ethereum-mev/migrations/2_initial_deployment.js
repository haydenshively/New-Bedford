const Liquidator = artifacts.require("Liquidator");

module.exports = (deployer, network, accounts) => {
  let comptroller;
  let vanityDeployer;

  switch (network) {
    case "ganache-fork":
    case "ganache":
      comptroller = "0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B";
      vanityDeployer = accounts[0];
      break;
    case "production-fork":
    case "production":
      comptroller = "0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B";
      vanityDeployer = accounts[1];
      break;
    default:
      console.error("Unknown network -- constructor args unspecified");
  }

  deployer.deploy(Liquidator, { from: vanityDeployer });
};
