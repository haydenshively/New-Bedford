import crypto from 'crypto';
import nfetch from 'node-fetch';

/* eslint-disable @typescript-eslint/no-var-requires */
const AbiCoder = require('web3-eth-abi');
/* eslint-enable @typescript-eslint/no-var-requires */

interface DecodedMessage {
  key: string;
  price: string;
  timestamp: string;
}

interface LocalSignature {
  hash: string;
  timestamp: string;
}

interface CoinbaseReport {
  message?: string,
  timestamp: string;
  messages: string[];
  signatures: string[];
  prices: { [i: string]: string };
}

export default class CoinbaseReporter {
  private readonly coinbaseEndpoint: string;
  private readonly coinbaseKey: string;
  private readonly coinbaseSecret: string;
  private readonly coinbasePassphrase: string;

  constructor(coinbaseEndpoint: string, coinbaseKey: string, coinbaseSecret: string, coinbasePassphrase: string) {
    this.coinbaseEndpoint = coinbaseEndpoint;
    this.coinbaseKey = coinbaseKey;
    this.coinbaseSecret = coinbaseSecret;
    this.coinbasePassphrase = coinbasePassphrase;
  }

  public static decode(message: string): DecodedMessage {
    const {
      // 0: kind,
      1: timestamp,
      2: key,
      3: price,
    } = AbiCoder.decodeParameters(['string', 'uint64', 'string', 'uint64'], message);

    return {
      key: key,
      price: price,
      timestamp: timestamp,
    };
  }

  protected async fetchCoinbasePrices(): Promise<CoinbaseReport> {
    const path = '/oracle';
    const method = 'GET';

    const sig = this.localSignature(path, method);
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'CB-ACCESS-KEY': this.coinbaseKey,
      'CB-ACCESS-SIGN': sig.hash,
      'CB-ACCESS-TIMESTAMP': sig.timestamp,
      'CB-ACCESS-PASSPHRASE': this.coinbasePassphrase,
    };

    const res = await nfetch(this.coinbaseEndpoint + path, {
      method: method,
      headers: headers,
    });
    return res.json();
  }

  private localSignature(path = '/oracle', method = 'GET', body = ''): LocalSignature {
    const timestamp = (Date.now() / 1000).toFixed(0);
    const prehash = timestamp + method.toUpperCase() + path + body;
    const hash = crypto
      .createHmac('sha256', Buffer.from(this.coinbaseSecret, 'base64'))
      .update(prehash)
      .digest('base64');

    return {
      hash: hash,
      timestamp: timestamp,
    };
  }
}
