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
  cWBTC = '0xC11b1268C1A384e55C48c2391d8d480264A3A7F4',
  cZRX = '0xB3319f5D18Bc0D84dD1b4825Dcde5d5f7266d407',
}

export type CTokenSymbol = keyof typeof CTokens;
export const cTokenSymbols = <CTokenSymbol[]>Object.keys(CTokens);

export const CTokenCreationBlocks: { [_ in CTokenSymbol]: number } = {
  cBAT: 7710735,
  cCOMP: 10960099,
  cDAI: 8983575,
  cETH: 7710758,
  cREP: 7710755,
  cSAI: 7710752,
  cUNI: 10921410,
  cUSDC: 7710760,
  cUSDT: 9879363,
  cWBTC: 8163813,
  cZRX: 7710733,
};

export const CTokenUnderlyingDecimals: { [_ in CTokenSymbol]: number } = {
  cBAT: 18,
  cCOMP: 18,
  cDAI: 18,
  cETH: 18,
  cREP: 18,
  cSAI: 18,
  cUNI: 18,
  cUSDC: 6,
  cUSDT: 6,
  cWBTC: 8,
  cZRX: 18,
};
