const { assert } = require("chai");

const Treasury = artifacts.require("Treasury");
const Liquidator = artifacts.require("Liquidator");

contract("Treasury Test", (accounts) => {
  it("should start with 50/50 split @latest-block", async () => {
    const treasury = await Treasury.deployed();
    let res = await treasury.shares();

    assert.equal(res.sharesA.toNumber(), 50000);
    assert.equal(res.sharesB.toNumber(), 50000);
  });

  it("should payout ETH that isn't in the fund @latest-block", async () => {
    const treasury = await Treasury.deployed();

    // send 2 ETH to the Treasury (*not* via the fund() function)
    const two = "2" + "0".repeat(18);
    await web3.eth.sendTransaction({
      to: treasury.address,
      from: accounts[0],
      value: two,
    });

    // check that the Treasury received 2 ETH
    let balanceT;
    balanceT = await web3.eth.getBalance(treasury.address);
    assert.equal(balanceT, two);

    // check that both owners still have 50% share
    const res = await treasury.shares();
    assert.equal(res.sharesA.toNumber(), 50000);
    assert.equal(res.sharesB.toNumber(), 50000);

    // check that balance goes to 0 after a payout
    await treasury.payoutMax("0x0000000000000000000000000000000000000000");
    balanceT = await web3.eth.getBalance(treasury.address);
    assert.equal(balanceT, "0");
  });

  it("should keep track of funds @latest-block", async () => {
    const treasury = await Treasury.deployed();

    // manually read owner addresses from storage (since they're private)
    const ownerA = await web3.eth.getStorageAt(treasury.address, "0");
    const ownerB = await web3.eth.getStorageAt(treasury.address, "1");

    // send 1 ETH to the Treasury for ownerA
    const one = "1" + "0".repeat(18);
    await treasury.fund(ownerA, { value: one });

    // send 2 ETH to the treasury for ownerB
    const two = "2" + "0".repeat(18);
    await treasury.fund(ownerB, { value: two });

    // check that stored balances match expectations
    const balanceAStored = await treasury.balanceAStored();
    const balanceBStored = await treasury.balanceBStored();

    assert.equal(balanceAStored.toString(10, 0), one);
    assert.equal(balanceBStored.toString(10, 0), two);
  });

  it("should set liquidator from owner account @latest-block", async () => {
    const treasury = await Treasury.deployed();
    const liquidator = await Liquidator.deployed();

    // verify that we can send a transaction as an owner
    const ownerA = await web3.eth.getStorageAt(treasury.address, "0");
    assert.equal(ownerA, accounts[1].toLowerCase());

    // set liquidator and check that proxy is created
    await treasury.setLiquidator(liquidator.address, { from: ownerA });
    const store8 = await web3.eth.getStorageAt(treasury.address, "8");
    const store9 = await web3.eth.getStorageAt(treasury.address, "9");

    assert.equal(store8, liquidator.address.toLowerCase());
    assert.notEqual(store9, "0x0000000000000000000000000000000000000000");
  });

  it("should provide caller with an allowance @latest-block", async () => {
    const treasury = await Treasury.deployed();

    // check that caller is deployer
    const caller = await web3.eth.getStorageAt(treasury.address, "2");
    assert.equal(caller, accounts[0].toLowerCase());

    // check that new caller receives allowance when changing identity
    const before = await web3.eth.getBalance(accounts[3]);
    await treasury.changeIdentity(accounts[3], { from: caller });
    const after = await web3.eth.getBalance(accounts[3]);

    const allowance = await web3.eth.getStorageAt(treasury.address, "3");
    assert.equal(
      (Number(after) - Number(before)).toFixed(),
      web3.utils.hexToNumberString(allowance)
    );
  });

  it("should adjust shares when allowance/2>stored @latest-block", async () => {
    const treasury = await Treasury.deployed();

    const caller = await web3.eth.getStorageAt(treasury.address, "2");
    const one = "1" + "0".repeat(18);
    await treasury.changeIdentity(accounts[0], { from: caller, value: one });

    // check shares now that uneven amounts of funds are at risk
    const res = await treasury.shares();
    assert.equal(res.sharesA.toNumber(), 25000);
    assert.equal(res.sharesB.toNumber(), 75000);
  });

  it("should mint CHI @latest-block", async () => {
    const treasury = await Treasury.deployed();

    const ownerA = await web3.eth.getStorageAt(treasury.address, "0");

    // make sure treasury has funds to refund minter
    const one = "1" + "0".repeat(18);
    await treasury.fund(ownerA, { value: one });

    // make sure minter gets refunded for their tx fees
    const before = await web3.eth.getBalance(ownerA);
    await treasury.mintCHI(ownerA, 50, {
      from: ownerA,
      gasPrice: web3.utils.toHex(50e9),
      gasLimit: web3.utils.toHex("5000000")
    });
    const after = await web3.eth.getBalance(ownerA);

    assert.isAtLeast(Number(after) / Number(before), 0.999);
  });

  it("should payout ERC20 @latest-block", async () => {
    const treasury = await Treasury.deployed();
    await treasury.payoutMax("0x0000000000004946c0e9F43F4Dee607b0eF1fA1c");
  });
});
