import ipc from 'node-ipc';

ipc.config.appspace = 'newbedford.';
ipc.config.id = 'delegator';
// ipc.config.silent = true;
ipc.connectTo('txmanager', '/tmp/newbedford.txmanager', () => {
  ipc.of['txmanager'].on('connect', () => {
    console.log('Connected');

    ipc.of['txmanager'].emit('liquidation-candidate-add', 'My message');
  });
});
