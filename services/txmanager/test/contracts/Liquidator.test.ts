import { expect } from 'chai';

import ITx from '../../src/blocks/types/ITx';
import liquidator from '../../src/contracts/Liquidator';

describe('Liquidator Test', () => {
  const pricesArr = [
    ['0x0', '0x0', '0x0'],
    ['0x0', '0x0', '0x0'],
    ['SYM', 'YMS', 'MSY'],
  ];
  const addr = '0xC257274276a4E539741Ca11b590B9447B26A8051';

  it('should create tx for single with prices', async () => {
    let tx: ITx;
    tx = liquidator.liquidate(pricesArr[0], pricesArr[1], pricesArr[2], [addr], [addr], [addr], true);

    expect(tx.gasLimit).to.not.be.undefined;
    expect(tx.data).to.not.be.undefined;
    if (tx.data !== undefined) expect(tx.data.slice(2, 10)).to.equal('023d399a');

    tx = liquidator.liquidate(pricesArr[0], pricesArr[1], pricesArr[2], [addr], [addr], [addr], false);

    expect(tx.gasLimit).to.not.be.undefined;
    expect(tx.data).to.not.be.undefined;
    if (tx.data !== undefined) expect(tx.data.slice(2, 10)).to.equal('f263f3d0');
  });

  it('should create tx for single without prices', async () => {
    let tx: ITx;
    tx = liquidator.liquidate([], [], [], [addr], [addr], [addr], true);

    expect(tx.gasLimit).to.not.be.undefined;
    expect(tx.data).to.not.be.undefined;
    if (tx.data !== undefined) expect(tx.data.slice(2, 10)).to.equal('7a3a41e5');

    tx = liquidator.liquidate([], [], [], [addr], [addr], [addr], false);

    expect(tx.gasLimit).to.not.be.undefined;
    expect(tx.data).to.not.be.undefined;
    if (tx.data !== undefined) expect(tx.data.slice(2, 10)).to.equal('4693c8e6');
  });

  it('should create tx for multiple with prices', async () => {
    let tx: ITx;
    tx = liquidator.liquidate(pricesArr[0], pricesArr[1], pricesArr[2], [addr, addr], [addr, addr], [addr, addr], true);

    expect(tx.gasLimit).to.not.be.undefined;
    expect(tx.data).to.not.be.undefined;
    if (tx.data !== undefined) expect(tx.data.slice(2, 10)).to.equal('5e0b36f7');

    tx = liquidator.liquidate(
      pricesArr[0],
      pricesArr[1],
      pricesArr[2],
      [addr, addr],
      [addr, addr],
      [addr, addr],
      false,
    );

    expect(tx.gasLimit).to.not.be.undefined;
    expect(tx.data).to.not.be.undefined;
    if (tx.data !== undefined) expect(tx.data.slice(2, 10)).to.equal('52fae007');
  });

  it('should create tx for multiple without prices', async () => {
    let tx: ITx;
    tx = liquidator.liquidate([], [], [], [addr, addr], [addr, addr], [addr, addr], true);

    expect(tx.gasLimit).to.not.be.undefined;
    expect(tx.data).to.not.be.undefined;
    if (tx.data !== undefined) expect(tx.data.slice(2, 10)).to.equal('ceef3b48');

    tx = liquidator.liquidate([], [], [], [addr, addr], [addr, addr], [addr, addr], false);

    expect(tx.gasLimit).to.not.be.undefined;
    expect(tx.data).to.not.be.undefined;
    if (tx.data !== undefined) expect(tx.data.slice(2, 10)).to.equal('e40b65b5');
  });
});
