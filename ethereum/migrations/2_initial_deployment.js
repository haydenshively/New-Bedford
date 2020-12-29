const Treasury = artifacts.require("Treasury");
const Liquidator = artifacts.require("Liquidator");

module.exports = (deployer, network, accounts) => {
  let ownerA;
  let ownerB;
  let comptroller;

  switch (network) {
    case "ganache":
      ownerA = accounts[1];
      ownerB = accounts[2];
      comptroller = "0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B";
      break;
    case "production":
      ownerA = "0xF1c73bb23934127A2C1Fa4bA7520822574fE9bA7";
      ownerB = "0xfC7F3c4FfC89BCe6BF518b41774e76e3147235e2";
      comptroller = "0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B";
      break;
    default:
      console.error("Unknown network -- constructor args unspecified");
  }

  deployer.deploy(Treasury, ownerA, ownerB).then((treasury) => {
    return deployer.deploy(
      Liquidator,
      treasury.address,
      comptroller
    );
  });
};
