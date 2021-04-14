const Deployer = artifacts.require("Deployer");
const Liquidator = artifacts.require("Liquidator");

const SALT =
  "0x9bfeae870838abd288dea5629e21a9a4d072c92a1e7b966d9a48b6b31dab10f1";
const ADDR = "0x0000000000006901a258504fa71fe8c89358f467";

async function deploy() {
  const accounts = await web3.eth.getAccounts();
  if (accounts[0] !== "0x21EFdAc2F1AEC8F7Bd38208380a504027850BE0e") {
    console.error("accounts[0] doesn't seem correct");
    return;
  }

  // const deployer = await Deployer.new({ gas: 10000000 });
  // if (deployer.address !== "0x00000000005b39005362E1AC1C3A7Bdea6c11fac") {
  //   console.error("deployer ended up at the wrong address");
  //   return;
  // }

  const deployer = await Deployer.at("0x00000000005b39005362E1AC1C3A7Bdea6c11fac");

  const tx = await deployer.deploy(SALT);
  if (!tx.receipt.status) {
    console.error("deployer failed to deploy liquidator");
    return;
  }
}

async function mintCHI(amount) {
  const liquidator = await Liquidator.at(ADDR);
  const tx = await liquidator.mintCHI(amount);

  if (!tx.receipt.status) {
    console.error("failed to mint pseudo-chi");
    return;
  }
}

deploy();

// const comptroller = "0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B";
// let address;

// const contract = new web3.eth.Contract(
//   liquidator.abi,
//   "0x0000000073aB64137E95dea458bAc6d7AA503636"
// );
// const payload = { data: liquidator.bytecode, arguments: [comptroller] };
// const parameters = {
//   from: "0x5309A37bB9eC90081b6cCfe58e4aa82064275f37",
//   gas: web3.utils.toHex("3200000"),
//   gasPrice: web3.utils.toHex(web3.utils.toWei("120", "gwei")),
//   nonce: 0,
// };

// async function go() {
//   // await web3.eth.sendTransaction({
//   //   from: "0x5309A37bB9eC90081b6cCfe58e4aa82064275f37",
//   //   to: "0x5309A37bB9eC90081b6cCfe58e4aa82064275f37",
//   //   gas: 21000,
//   //   gasPrice: 132000000000,
//   //   nonce: 1,
//   // });
//   // return;

//   const gas = await contract.deploy(payload).estimateGas(parameters);
//   console.log(`Gas: ${gas}`);

//   const sentTx = contract.deploy(payload).send(parameters);
//   sentTx.on("transactionHash", (hash) => console.log("Hash: ", hash));
//   const deployedInstance = await sentTx;

//   address = deployedInstance.options.address;
//   console.log("Address: ", address);
//   contract.options = deployedInstance.options;

//   // const tx = contract.methods.mintCHI(50);
//   // const receipt = await tx.send({
//   //   from: "0x5309A37bB9eC90081b6cCfe58e4aa82064275f37",
//   // });
//   // console.log(receipt);

//   // const tx = contract.methods.changeOwner(
//   //   "0xF1c73bb23934127A2C1Fa4bA7520822574fE9bA7"
//   // );
//   // const receipt = await tx.send({
//   //   from: "0x5309A37bB9eC90081b6cCfe58e4aa82064275f37",
//   // });
//   // console.log(receipt);
// }
