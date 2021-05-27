const Liquidator = artifacts.require("Liquidator");

async function payoutCHI() {
  const accounts = await web3.eth.getAccounts();
  if (accounts[0] !== "0xF1c73bb23934127A2C1Fa4bA7520822574fE9bA7") {
    console.error("accounts[0] doesn't seem correct");
    return;
  }

  const liquidator = await Liquidator.at(
    "0x0000000073aB64137E95dea458bAc6d7AA503636"
  );
  const tx = await liquidator.payoutMax("0x0000000000004946c0e9F43F4Dee607b0eF1fA1c");
  console.log(tx.receipt);
}

async function kill() {
  const accounts = await web3.eth.getAccounts();
  if (accounts[0] !== "0xF1c73bb23934127A2C1Fa4bA7520822574fE9bA7") {
    console.error("accounts[0] doesn't seem correct");
    return;
  }

  const liquidator = await Liquidator.at(
    "0x0000000073aB64137E95dea458bAc6d7AA503636"
  );
  const tx = await liquidator.kill();
  console.log(tx.receipt);
}

// payoutCHI();
// kill();
