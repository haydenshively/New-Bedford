const Web3 = require("web3");
const net = require("net");

const IPCProvider = path => {
  return new Web3(path, net);
};
const WSProvider = path => {
  return new Web3(path);
};
const HTTPProvider = path => {
  return new Web3(path);
};

/**
 *
 * @param {String} chain the chain, e.g "mainnet"
 * @param {Object} spec see example below
 * @returns {Provider} a Web3 provider
 *
 * @example
 * {
 *   type: "WS_Infura",
 *   envKeyID: "PROVIDER_INFURA_ID"
 * }
 */
const ProviderFor = (chain, spec) => {
  switch (spec.type) {
    case "IPC":
      return IPCProvider(process.env[spec.envKeyPath]);
    case "WS_Infura":
      return WSProvider(
        `wss://${chain}.infura.io/ws/v3/` + process.env[spec.envKeyID]
      );
    case "WS_Alchemy":
      return WSProvider(
        `wss://eth-${chain}.ws.alchemyapi.io/v2/` + process.env[spec.envKeyKey]
      );
    case "HTTP_Infura":
      return HTTPProvider(
        `https://${chain}.infura.io/v3/` + process.env[spec.envKeyID]
      );
    case "HTTP_Alchemy":
      return HTTPProvider(
        `https://eth-${chain}.alchemyapi.io/v2/` + process.env[spec.envKeyKey]
      );
  }
};
exports.ProviderFor = ProviderFor;

/**
 *
 * @param {String} chain the chain, e.g "mainnet"
 * @param {Object} specs see example below
 * @returns {Array<Provider>} a Web3 provider
 *
 * @example
 * [
 *   {
 *     type: "WS_Infura",
 *     envKeyID: "PROVIDER_INFURA_ID"
 *   },
 *   {
 *     type: "WS_Alchemy",
 *     envKeyKey: "PROVIDER_ALCHEMY_KEY"
 *   }
 * ]
 */
const ProvidersFor = (chain, specs) => {
  return specs.map(spec => ProviderFor(chain, spec));
};

class MultiSendProvider {
  constructor(chain, specs) {
    this.providers = ProvidersFor(chain, specs);

    // Use proxy to match ordinary Web3 API
    return new Proxy(this, {
      get: function(target, prop, receiver) {
        if (prop === "eth") return receiver;
        if (prop in target) return target[prop];
        // fallback
        return target.providers[0].eth[prop];
      }
    });
  }

  call(tx, block) {
    return this.providers[0].eth.call(tx, block);
  }

  sendSignedTransaction(signedTx) {
    const sentTx = this.providers[0].eth.sendSignedTransaction(signedTx);
    for (let i = 1; i < this.providers.length; i++)
      this.providers[i].eth
        .sendSignedTransaction(signedTx)
        .on("error", e => console.log(e.name + " " + e.message));
    return sentTx;
  }

  clearSubscriptions() {
    this.providers.forEach(p => p.eth.clearSubscriptions());
  }

  // Double-underscore because this isn't part of the web3.eth namespace
  __close() {
    this.providers.forEach(p => {
      try {
        p.currentProvider.connection.close();
      } catch {
        try {
          p.currentProvider.connection.destroy();
        } catch {
          console.log("Cannot close HTTP provider's connection");
        }
      }
    });
  }

  get currentProvider() {
    return { connection: { close: this.__close.bind(this) } };
  }
}

exports.MultiSendProvider = MultiSendProvider;
