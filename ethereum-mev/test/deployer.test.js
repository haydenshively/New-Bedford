const { assert, expect } = require("chai");

const Deployer = artifacts.require("Deployer");
const Liquidator = artifacts.require("Liquidator");

const SALT = "0x9bfeae870838ab5c401aa60c0df8a8a4d072c92a1e7b966d9a48b6b31dab10f1";
const ADDR = "0x0000000000338f472c9677956e16d7d6b77ec580";

describe("Deployer Contract Test", function () {
  let accounts;
  let deployer;
  let liquidator;

  before(async function () {
    accounts = await web3.eth.getAccounts();
  });

  describe("Deploy Deployer @latest-block", function () {
    it("should deploy from vanity address", async () => {
      expect(accounts[0]).to.equal(
        "0x21EFdAc2F1AEC8F7Bd38208380a504027850BE0e"
      );
    });

    it("should deploy to expected address", async () => {
      deployer = await Deployer.new();
      expect(deployer.address).to.equal(
        "0x00000000005b39005362E1AC1C3A7Bdea6c11fac"
      );
    });
  });

  describe("Use Deployer @latest-block", function () {
    it("should deploy liquidator to expected address", async () => {
      let tx = await deployer.deploy(SALT);
      expect(tx.receipt.status).to.be.true;

      liquidator = await Liquidator.at(ADDR);
      tx = await liquidator.payoutMax("0x0000000000000000000000000000000000000000");
      expect(tx.receipt.status).to.be.true;
    });

    it("should liquidate someone", async () => {
      const tx = await liquidator.liquidateS(
        "0xf2ea7df6e3636a69ae76073251a23acbbcca4478",
        "0xf650c3d88d12db855b8bf7d11be6c55a4e07dcc9",
        "0x70e36f6bf80a52b3b46b3af8e106cc0ed743e8e4",
        6000
      );
      assert.isTrue(tx.receipt.status);

      const events = tx.receipt.rawLogs;
      assert.equal(events.length, 25);

      console.log(`Gas used: ${tx.receipt.gasUsed}`);
    });
  });
});
