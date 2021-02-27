const { assert } = require("chai");

const Treasury = artifacts.require("Treasury");
const Liquidator = artifacts.require("Liquidator");

contract("Treasury Test", (accounts) => {

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

    // check that balance goes to 0 after a payout
    await treasury.payoutMax("0x0000000000000000000000000000000000000000");
    balanceT = await web3.eth.getBalance(treasury.address);
    assert.equal(balanceT, "0");
  });

  it("should keep track of funds @latest-block", async () => {
    const treasury = await Treasury.deployed();

    // manually read owner addresses from storage (since they're private)
    const owner = await web3.eth.getStorageAt(treasury.address, "0");

    // send 3 ETH to the Treasury for owner
    const three = "3" + "0".repeat(18);
    await treasury.fund(owner, { value: three });

    // check that stored balances match expectations
    const balanceStored = await treasury.balanceStored();

    assert.equal(balanceStored.toString(10, 0), three);
  });

  it("should set liquidator from owner account @latest-block", async () => {
    const treasury = await Treasury.deployed();
    const liquidator = await Liquidator.deployed();

    // verify that we can send a transaction as an owner
    const owner = await web3.eth.getStorageAt(treasury.address, "0");
    assert.equal(owner, accounts[1].toLowerCase());

    // set liquidator and check that proxy is created
    await treasury.setLiquidator(liquidator.address, { from: owner });
    const store4 = await web3.eth.getStorageAt(treasury.address, "4");
    const store5 = await web3.eth.getStorageAt(treasury.address, "5");

    assert.equal(store4, liquidator.address.toLowerCase());
    assert.notEqual(store5, "0x0000000000000000000000000000000000000000");
  });

  it("should provide caller with an allowance @latest-block", async () => {
    const treasury = await Treasury.deployed();

    // check that caller is deployer
    const caller = await web3.eth.getStorageAt(treasury.address, "1");
    assert.equal(caller, accounts[0].toLowerCase());

    // check that new caller receives allowance when changing identity
    const before = await web3.eth.getBalance(accounts[3]);
    await treasury.changeIdentity(accounts[3], { from: caller });
    const after = await web3.eth.getBalance(accounts[3]);

    const allowance = await web3.eth.getStorageAt(treasury.address, "2");
    assert.equal(
      (Number(after) - Number(before)).toFixed(),
      web3.utils.hexToNumberString(allowance)
    );
  });

  it("should mint CHI @latest-block", async () => {
    const treasury = await Treasury.deployed();

    const owner = await web3.eth.getStorageAt(treasury.address, "0");

    // make sure treasury has funds to refund minter
    const one = "1" + "0".repeat(18);
    await treasury.fund(owner, { value: one });

    // make sure minter gets refunded for their tx fees
    const before = await web3.eth.getBalance(owner);
    await treasury.mintCHI(owner, 50, {
      from: owner,
      gasPrice: web3.utils.toHex(50e9),
      gasLimit: web3.utils.toHex("5000000")
    });
    const after = await web3.eth.getBalance(owner);

    assert.isAtLeast(Number(after) / Number(before), 0.999);
  });

  it("should payout ERC20 @latest-block", async () => {
    const treasury = await Treasury.deployed();
    await treasury.payoutMax("0x0000000000004946c0e9F43F4Dee607b0eF1fA1c");
  });
});
