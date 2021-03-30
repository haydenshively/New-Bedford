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
      "0x3cb5c393bb8941561657437605dc188588d78fe1",
      "0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5",
      "0x5d3a536e4d6dbd6114cc1ead35777bab948e3643"
    );
    assert.isTrue(tx.receipt.status);

    const events = tx.receipt.rawLogs;
    assert.equal(events.length, 18);

    checkRevenueDistributed(
      treasury,
      events[events.length - 1],
      "0x0000000000000000000000000000000000000000" // ETH
    );
  });

  it("should repay DAI and seize DAI @known-block", async () => {
    const liquidator = await Liquidator.deployed();
    const treasury = await Treasury.deployed();

    const tx = await liquidator.liquidateS(
      "0x77875aa8ea7f113eb08c7a2aa4c2975944b0f77b",
      "0x5d3a536e4d6dbd6114cc1ead35777bab948e3643",
      "0x5d3a536e4d6dbd6114cc1ead35777bab948e3643"
    );
    assert.isTrue(tx.receipt.status);

    const events = tx.receipt.rawLogs;
    assert.equal(events.length, 20);

    checkRevenueDistributed(
      treasury,
      events[events.length - 1],
      "0x0000000000000000000000000000000000000000" // ETH
    );
  });

  it("should repay USDC and seize ETH @known-block", async () => {
    const liquidator = await Liquidator.deployed();
    const treasury = await Treasury.deployed();

    const tx = await liquidator.liquidateS(
      "0xdec7eccd6e1abf4149b36ad5dd53afaf20eaa1a7",
      "0x39aa39c021dfbae8fac545936693ac917d5e7563",
      "0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5"
    );
    assert.isTrue(tx.receipt.status);

    const events = tx.receipt.rawLogs;
    assert.equal(events.length, 21);

    checkRevenueDistributed(
      treasury,
      events[events.length - 1],
      "0x0000000000000000000000000000000000000000" // ETH
    );
  });

  it("should repay BAT and seize UNI @known-block", async () => {
    const liquidator = await Liquidator.deployed();
    const treasury = await Treasury.deployed();

    const tx = await liquidator.liquidateS(
      "0xcb6681e95a56ab115d8be22c70299c7d47f943fc",
      "0x6c8c6b02e7b2be14d4fa6022dfd6d75921d90e4e",
      "0x35a18000230da775cac24873d00ff85bccded550"
    );
    assert.isTrue(tx.receipt.status);

    const events = tx.receipt.rawLogs;
    assert.equal(events.length, 27);

    checkRevenueDistributed(
      treasury,
      events[events.length - 1],
      "0x0000000000000000000000000000000000000000" // ETH
    );
  });

  xit("should liquidate one from list with CHI @known-block", async () => {
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
      "0x07737955549eef53a7845543dc20510f50903884",
      "0x62b566fc95998f5cdee258482eab377cd8a412ec",
    ];
    const tokens = [
      "0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5", // cETH
      "0x39aa39c021dfbae8fac545936693ac917d5e7563", // cUSDC
      "0x5d3a536e4d6dbd6114cc1ead35777bab948e3643", // cDAI
      "0x39aa39c021dfbae8fac545936693ac917d5e7563", // cUSDC
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

  xit("should delegate from proxy to liquidator @known-block", async () => {
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
