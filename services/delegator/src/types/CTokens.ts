import { CoinbaseKey } from './CoinbaseKeys';

export enum CTokens {
  cBAT = '0x6C8c6b02E7b2BE14d4fA6022Dfd6d75921D90E4E',
  cCOMP = '0x70e36f6BF80a52b3B46b3aF8e106CC0ed743E8e4',
  cDAI = '0x5d3a536E4D6DbD6114cc1Ead35777bAB948E3643',
  cETH = '0x4Ddc2D193948926D02f9B1fE9e1daa0718270ED5',
  cREP = '0x158079Ee67Fce2f58472A96584A73C7Ab9AC95c1',
  cSAI = '0xF5DCe57282A584D2746FaF1593d3121Fcac444dC',
  cUNI = '0x35A18000230DA775CAc24873d00Ff85BccdeD550',
  cUSDC = '0x39AA39c021dfbaE8faC545936693aC917d5E7563',
  cUSDT = '0xf650C3d88D12dB855b8bf7D11Be6C55A4e07dCC9',
  cLINK = '0xFAce851a4921ce59e912d19329929CE6da6EB0c7',
  cTUSD = '0x12392F67bdf24faE0AF363c24aC620a2f67DAd86',
  cWBTC = '0xC11b1268C1A384e55C48c2391d8d480264A3A7F4',
  cWBTC2 = '0xccF4429DB6322D5C611ee964527D42E5d685DD6a',
  cZRX = '0xB3319f5D18Bc0D84dD1b4825Dcde5d5f7266d407',
}

export enum CTokenVersion {
  V1,
  V2,
  ETH,
}

export type CTokenSymbol = keyof typeof CTokens;
export const cTokenSymbols = <CTokenSymbol[]>Object.keys(CTokens);

export const cTokenCreationBlocks: { [_ in CTokenSymbol]: number } = {
  cBAT: 7710735,
  cCOMP: 10960099,
  cDAI: 8983575,
  cETH: 7710758,
  cREP: 7710755,
  cSAI: 7710752,
  cUNI: 10921410,
  cUSDC: 7710760,
  cUSDT: 9879363,
  cLINK: 12286030,
  cTUSD: 11008385,
  cWBTC: 8163813,
  cWBTC2: 12038653,
  cZRX: 7710733,
};

export const cTokenUnderlyingDecimals: { [_ in CTokenSymbol]: number } = {
  cBAT: 18,
  cCOMP: 18,
  cDAI: 18,
  cETH: 18,
  cREP: 18,
  cSAI: 18,
  cUNI: 18,
  cUSDC: 6,
  cUSDT: 6,
  cLINK: 18,
  cTUSD: 18,
  cWBTC: 8,
  cWBTC2: 8,
  cZRX: 18,
};

export const cTokenVersions: { [_ in CTokenSymbol]: CTokenVersion } = {
  cBAT: CTokenVersion.V1,
  cCOMP: CTokenVersion.V2,
  cDAI: CTokenVersion.V2,
  cETH: CTokenVersion.ETH,
  cREP: CTokenVersion.V1,
  cSAI: CTokenVersion.V1,
  cUNI: CTokenVersion.V2,
  cUSDC: CTokenVersion.V1,
  cUSDT: CTokenVersion.V2,
  cLINK: CTokenVersion.V2,
  cTUSD: CTokenVersion.V2,
  cWBTC: CTokenVersion.V1,
  cWBTC2: CTokenVersion.V2,
  cZRX: CTokenVersion.V1,
};

export const cTokenCoinbaseKeys: { [_ in CTokenSymbol]: CoinbaseKey | null } = {
  cBAT: 'BAT',
  cCOMP: 'COMP',
  cDAI: 'DAI',
  cETH: 'ETH',
  cREP: 'REP',
  cSAI: null,
  cUNI: 'UNI',
  cUSDC: null,
  cUSDT: null,
  cLINK: 'LINK',
  cTUSD: null,
  cWBTC: 'BTC',
  cWBTC2: 'BTC',
  cZRX: 'ZRX',
};

export const CTokensReversed: { [i: string]: CTokenSymbol } = Object.fromEntries(
  cTokenSymbols.map((symbol) => [CTokens[symbol], symbol]),
);
