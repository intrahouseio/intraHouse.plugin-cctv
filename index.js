const Plugin = require('./lib/plugin');
const Rtsp = require('./lib/rtsp');


const plugin = new Plugin();

const STORE = {};


plugin.on('start', () => {
  const rtsp1 = new Rtsp();
});
