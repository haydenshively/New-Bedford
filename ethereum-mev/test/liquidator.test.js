const { assert } = require("chai");

const Treasury = artifacts.require("Treasury");
const Liquidator = artifacts.require("Liquidator");

function checkRevenueDistributed(treasury, event, asset) {
  assert.equal(event.address, treasury.address);

  const abi = treasury.contract._jsonInterface.filter(
    (abi) => abi.name === "RevenueDistributed"
  )[0];
  const decoded = web3.eth.abi.decodeLog(abi.inputs, event.data, event.topics);

  assert.equal(decoded.asset, asset);
  assert.notEqual(decoded.amount, "0");
}

function checkTokenTransferred(event, from, to, value) {
  const inputs = [
    { type: "address", internalType: "address", name: "from", indexed: true },
    { type: "address", internalType: "address", name: "to", indexed: true },
    { type: "uint256", internalType: "uint256", name: "value", indexed: false },
  ];
  const decoded = web3.eth.abi.decodeLog(
    inputs,
    event.data,
    event.topics.slice(1)
  );

  assert.equal(decoded.from, from);
  assert.equal(decoded.to, to);
  assert.equal(decoded.value, value);
}

contract("Liquidator Test", (accounts) => {
  it("should repay ETH and seize DAI @known-block", async () => {
    const liquidator = await Liquidator.deployed();
    const treasury = await Treasury.deployed();

    const tx = await liquidator.liquidateS(
      "0x8d06a175660cfe52d9ce82fedb58e25c02e8ae8c",
      "0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5",
      "0x5d3a536e4d6dbd6114cc1ead35777bab948e3643"
    );
    assert.isTrue(tx.receipt.status);

    const events = tx.receipt.rawLogs;
    assert.equal(events.length, 28);

    checkRevenueDistributed(
      treasury,
      events[events.length - 1],
      "0x6B175474E89094C44Da98b954EedeAC495271d0F" // DAI
    );
  });

  it("should repay DAI and seize DAI @known-block", async () => {
    const liquidator = await Liquidator.deployed();
    const treasury = await Treasury.deployed();

    const tx = await liquidator.liquidateS(
      "0x2284de4652f31749d4c42dd663f68487d9d7cf42",
      "0x5d3a536e4d6dbd6114cc1ead35777bab948e3643",
      "0x5d3a536e4d6dbd6114cc1ead35777bab948e3643",
    );
    assert.isTrue(tx.receipt.status);

    const events = tx.receipt.rawLogs;
    assert.equal(events.length, 38);

    checkRevenueDistributed(
      treasury,
      events[events.length - 1],
      "0x6B175474E89094C44Da98b954EedeAC495271d0F" // DAI
    );
  });

  it("should repay DAI and seize ETH @known-block", async () => {
    const liquidator = await Liquidator.deployed();
    const treasury = await Treasury.deployed();

    const tx = await liquidator.liquidateS(
      "0x2284de4652f31749d4c42dd663f68487d9d7cf42",
      "0x5d3a536e4d6dbd6114cc1ead35777bab948e3643",
      "0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5"
    );
    assert.isTrue(tx.receipt.status);

    const events = tx.receipt.rawLogs;
    assert.equal(events.length, 28);

    checkRevenueDistributed(
      treasury,
      events[events.length - 1],
      "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" // WETH
    );
  });

  it("should repay WBTC and seize USDC @known-block", async () => {
    const liquidator = await Liquidator.deployed();
    const treasury = await Treasury.deployed();

    const tx = await liquidator.liquidateS(
      "0x9d2435a72fd9033fdc4063fee15c22df40dd68dd",
      "0xc11b1268c1a384e55c48c2391d8d480264a3a7f4",
      "0x39aa39c021dfbae8fac545936693ac917d5e7563"
    );
    assert.isTrue(tx.receipt.status);

    const events = tx.receipt.rawLogs;
    assert.equal(events.length, 26);

    checkRevenueDistributed(
      treasury,
      events[events.length - 1],
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" // USDC
    );
  });

  it("should liquidate one from list with CHI @known-block", async () => {
    const liquidator = await Liquidator.deployed();
    const treasury = await Treasury.deployed();

    // THE RESULTS OF THE FOLLOWING 3 TXNS ARE TESTED ELSEWHERE ----
    // make sure owner has enough ETH to call the setLiquidator function
    await web3.eth.sendTransaction({
      to: accounts[1],
      from: accounts[0],
      value: "1" + "0".repeat(18),
    });
    // tell the treasury what the liquidator's address is
    await treasury.setLiquidator(liquidator.address, { from: accounts[1] });
    // mint some CHI
    await treasury.mintCHI(accounts[1], 50, { from: accounts[1] });

    // THE RESULT OF THE FOLLOWING TXN IS TESTED HERE ----------------
    // now perform actual liquidation
    const borrowers = [
      "0x18fc6e5341d57c757659b888db134c2eb366e97b",
      "0x6e197190de43166839665157274ee695456259f7",
    ];
    const tokens = [
      "0xc11b1268c1a384e55c48c2391d8d480264a3a7f4", // cWBTC
      "0xb3319f5d18bc0d84dd1b4825dcde5d5f7266d407", // cZRX
      "0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5", // cETH
      "0x6c8c6b02e7b2be14d4fa6022dfd6d75921d90e4e", // cBAT
    ];

    const tx = await liquidator.liquidateSNChi(borrowers, tokens);
    assert.isTrue(tx.receipt.status);

    const events = tx.receipt.rawLogs;
    assert.equal(events.length, 33);

    const transferCHI = events[events.length - 2];
    assert.equal(
      transferCHI.address,
      "0x0000000000004946c0e9F43F4Dee607b0eF1fA1c"
    );

    checkTokenTransferred(
      transferCHI,
      treasury.address,
      "0x0000000000000000000000000000000000000000",
      "34"
    );
  });

  it("should delegate from proxy to liquidator @known-block", async () => {
    const treasury = await Treasury.deployed();

    const wrapperAddress = await treasury.liquidatorWrapper();
    const wrapper = await Liquidator.at(wrapperAddress);

    const tx = await wrapper.liquidateSChi(
      "0x6e197190de43166839665157274ee695456259f7",
      "0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5",
      "0x6c8c6b02e7b2be14d4fa6022dfd6d75921d90e4e"
    );
    assert.isTrue(tx.receipt.status);
    assert.equal(tx.receipt.to, wrapperAddress.toLowerCase());

    const events = tx.receipt.rawLogs;
    assert.equal(events.length, 2);

    const transferCHI = events[events.length - 2];
    assert.equal(
      transferCHI.address,
      "0x0000000000004946c0e9F43F4Dee607b0eF1fA1c"
    );

    checkTokenTransferred(
      transferCHI,
      treasury.address,
      "0x0000000000000000000000000000000000000000",
      "2"
    );
  });
});
