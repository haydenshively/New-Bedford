const { assert, expect } = require("chai");
const { artifacts } = require("hardhat");

const Liquidator = artifacts.require("Liquidator");
const MinerPayer = artifacts.require("MinerPayer");

async function checkRevenue(
  liquidator,
  balanceBefore,
  event,
  minerPayer,
  toMiner
) {
  assert.equal(event.address, minerPayer.address);

  const abi = minerPayer.contract._jsonInterface.filter(
    (abi) => abi.name === "Revenue"
  )[0];
  const decoded = web3.eth.abi.decodeLog(abi.inputs, event.data, event.topics);

  assert.notEqual(decoded.amount, "0");

  const amountKept =
    Number(await web3.eth.getBalance(liquidator.address)) - balanceBefore;
  const amountSent = Number(decoded.amount);

  console.log(`Actual toMiner: ${10000 * amountSent / (amountKept + amountSent)}`);
  assert.equal(Math.round(10000 * amountSent / (amountKept + amountSent)), toMiner);
}

describe("Liquidator Contract Test", function () {
  let accounts;
  let liquidator;
  let minerPayer;

  before(async function () {
    accounts = await web3.eth.getAccounts();
    liquidator = await Liquidator.new();
    minerPayer = await MinerPayer.new();

    await liquidator.changePayer(minerPayer.address, {
      from: "0xF1c73bb23934127A2C1Fa4bA7520822574fE9bA7",
    });
  });

  it("should liquidate USDT and seize WBTC @latest-block", async () => {
    const balance = Number(await web3.eth.getBalance(liquidator.address));
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

    await checkRevenue(
      liquidator,
      balance,
      events[events.length - 1],
      minerPayer,
      6000
    );
  });

  it("should repay ETH and seize DAI @known-block", async () => {
    const balance = Number(await web3.eth.getBalance(liquidator.address));
    const tx = await liquidator.liquidateS(
      "0x3cb5c393bb8941561657437605dc188588d78fe1",
      "0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5",
      "0x5d3a536e4d6dbd6114cc1ead35777bab948e3643",
      6000
    );
    assert.isTrue(tx.receipt.status);

    const events = tx.receipt.rawLogs;
    assert.equal(events.length, 18);

    console.log(`Gas used: ${tx.receipt.gasUsed}`);

    await checkRevenue(
      liquidator,
      balance,
      events[events.length - 1],
      minerPayer,
      6000
    );
  });

  it("should repay DAI and seize DAI @known-block", async () => {
    const balance = Number(await web3.eth.getBalance(liquidator.address));
    const tx = await liquidator.liquidateS(
      "0x77875aa8ea7f113eb08c7a2aa4c2975944b0f77b",
      "0x5d3a536e4d6dbd6114cc1ead35777bab948e3643",
      "0x5d3a536e4d6dbd6114cc1ead35777bab948e3643",
      5000
    );
    assert.isTrue(tx.receipt.status);

    const events = tx.receipt.rawLogs;
    assert.equal(events.length, 20);

    console.log(`Gas used: ${tx.receipt.gasUsed}`);

    await checkRevenue(
      liquidator,
      balance,
      events[events.length - 1],
      minerPayer,
      5000
    );
  });

  it("should repay USDC and seize ETH @known-block", async () => {
    const balance = Number(await web3.eth.getBalance(liquidator.address));
    const tx = await liquidator.liquidateS(
      "0xdec7eccd6e1abf4149b36ad5dd53afaf20eaa1a7",
      "0x39aa39c021dfbae8fac545936693ac917d5e7563",
      "0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5",
      4000
    );
    assert.isTrue(tx.receipt.status);

    const events = tx.receipt.rawLogs;
    assert.equal(events.length, 21);

    console.log(`Gas used: ${tx.receipt.gasUsed}`);

    await checkRevenue(
      liquidator,
      balance,
      events[events.length - 1],
      minerPayer,
      4000
    );
  });

  it("should repay BAT and seize UNI @known-block", async () => {
    const balance = Number(await web3.eth.getBalance(liquidator.address));
    const tx = await liquidator.liquidateS(
      "0xcb6681e95a56ab115d8be22c70299c7d47f943fc",
      "0x6c8c6b02e7b2be14d4fa6022dfd6d75921d90e4e",
      "0x35a18000230da775cac24873d00ff85bccded550",
      500
    );
    assert.isTrue(tx.receipt.status);

    const events = tx.receipt.rawLogs;
    assert.equal(events.length, 26);

    console.log(`Gas used: ${tx.receipt.gasUsed}`);

    await checkRevenue(
      liquidator,
      balance,
      events[events.length - 1],
      minerPayer,
      500
    );
  });

  it("should mint pseudo-CHI @latest-block", async () => {
    await web3.eth.sendTransaction({
      to: accounts[1],
      from: accounts[0],
      value: "1" + "0".repeat(18),
    });
    // mint some CHI
    const res = await liquidator.mintCHI(50, { from: accounts[1] });
    expect(res.receipt.gasUsed).to.be.greaterThanOrEqual(1500000);
  });

  it("should liquidate with CHI @known-block", async () => {
    // THE RESULTS OF THE FOLLOWING 2 TXNS ARE TESTED ELSEWHERE ----
    // make sure owner has enough ETH to call the setLiquidator function
    await web3.eth.sendTransaction({
      to: accounts[1],
      from: accounts[0],
      value: "1" + "0".repeat(18),
    });
    // mint some CHI
    await liquidator.mintCHI(50, { from: accounts[1] });

    // THE RESULT OF THE FOLLOWING TXN IS TESTED HERE ----------------
    // now perform actual liquidation
    const balance = Number(await web3.eth.getBalance(liquidator.address));
    const tx = await liquidator.liquidateSChi(
      "0x07737955549eef53a7845543dc20510f50903884",
      "0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5", // cETH
      "0x39aa39c021dfbae8fac545936693ac917d5e7563", // cUSDC
      7000
    );
    assert.isTrue(tx.receipt.status);

    const events = tx.receipt.rawLogs;
    assert.equal(events.length, 21);

    console.log(`Gas used: ${tx.receipt.gasUsed}`);

    await checkRevenue(
      liquidator,
      balance,
      events[events.length - 2],
      minerPayer,
      7000
    );
  });

  it("should liquidate with CHI again @known-block", async () => {
    const tx = await liquidator.liquidateSChi(
      "0x62b566fc95998f5cdee258482eab377cd8a412ec",
      "0x5d3a536e4d6dbd6114cc1ead35777bab948e3643", // cDAI
      "0x39aa39c021dfbae8fac545936693ac917d5e7563", // cUSDC
      0
    );
    assert.isTrue(tx.receipt.status);

    const events = tx.receipt.rawLogs;
    assert.equal(events.length, 26);

    console.log(`Gas used: ${tx.receipt.gasUsed}`);
  });

  it("should repay ETH and seize (a lot of) USDC @awesome-block", async () => {
    const tx = await liquidator.liquidateS(
      "0xb5535a3681cf8d5431b8acfd779e2f79677ecce9",
      "0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5",
      "0x39aa39c021dfbae8fac545936693ac917d5e7563",
      5000
    );
    assert.isTrue(tx.receipt.status);

    const events = tx.receipt.rawLogs;
    assert.equal(events.length, 18);

    console.log(`Gas used: ${tx.receipt.gasUsed}`);

    await checkRevenue(liquidator, events[events.length - 1], minerPayer, 5000);
  });
});
