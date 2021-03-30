const { web3 } = require("hardhat");

const liquidator = artifacts.require("Liquidator");

const comptroller = "0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B";
let address;

const contract = new web3.eth.Contract(
  liquidator.abi,
  "0x0000000073aB64137E95dea458bAc6d7AA503636"
);
const payload = { data: liquidator.bytecode, arguments: [comptroller] };
const parameters = {
  from: "0x5309A37bB9eC90081b6cCfe58e4aa82064275f37",
  gas: web3.utils.toHex("3200000"),
  gasPrice: web3.utils.toHex(web3.utils.toWei("120", "gwei")),
  nonce: 0,
};

async function go() {
  // await web3.eth.sendTransaction({
  //   from: "0x5309A37bB9eC90081b6cCfe58e4aa82064275f37",
  //   to: "0x5309A37bB9eC90081b6cCfe58e4aa82064275f37",
  //   gas: 21000,
  //   gasPrice: 132000000000,
  //   nonce: 1,
  // });
  // return;

  const gas = await contract.deploy(payload).estimateGas(parameters);
  console.log(`Gas: ${gas}`);

  const sentTx = contract.deploy(payload).send(parameters);
  sentTx.on("transactionHash", (hash) => console.log("Hash: ", hash));
  const deployedInstance = await sentTx;

  address = deployedInstance.options.address;
  console.log("Address: ", address);
  contract.options = deployedInstance.options;

  // const tx = contract.methods.mintCHI(50);
  // const receipt = await tx.send({
  //   from: "0x5309A37bB9eC90081b6cCfe58e4aa82064275f37",
  // });
  // console.log(receipt);

  // const tx = contract.methods.changeOwner(
  //   "0xF1c73bb23934127A2C1Fa4bA7520822574fE9bA7"
  // );
  // const receipt = await tx.send({
  //   from: "0x5309A37bB9eC90081b6cCfe58e4aa82064275f37",
  // });
  // console.log(receipt);
}

go();
