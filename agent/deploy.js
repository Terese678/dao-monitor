const { HttpHandler, RpcClient, PrivateKey, KeyAlgorithm, SessionBuilder, ContractWasm, FixedMode, PricingMode } = require("casper-js-sdk");
const fs = require("fs");
const path = require("path");

async function main() {
  const keyPem = fs.readFileSync("C:\\Users\\HomePC\\.casper-keys\\secret_key.pem", "utf8");
  const privateKey = await PrivateKey.fromPem(keyPem, KeyAlgorithm.ED25519);

  const wasmBytes = fs.readFileSync(path.join(__dirname, "../wasm/DaoMonitor.wasm"));

  const rpcHandler = new HttpHandler("https://node.testnet.casper.network/rpc");
  const rpcClient = new RpcClient(rpcHandler);

  // Build transaction using SessionBuilder
  const sessionBuilder = new SessionBuilder();
  sessionBuilder.wasm(new ContractWasm(wasmBytes));
  const transaction = sessionBuilder.installOrUpgrade()
    .from(privateKey.publicKey)
    .chainName("casper-test")
    .build();

  transaction.sign(privateKey);

  const result = await rpcClient.putTransaction(transaction);
  console.log("Success! Hash:", JSON.stringify(result));
}

main().catch(err => console.error("Error:", err.message || err));