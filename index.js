const WebSocket = require('ws');
const Plugin = require('./lib/plugin');
const Rtsp = require('./lib/rtsp');
const fs = require('fs');


const plugin = new Plugin();

const STORE = {
  cams: { },
  channels: { ws: {}, p2p: {} },
};

x = new Buffer('ffd8ffe000104a46494600010100000100010000ffdb0043000d090a0b0a080d0b0a0b0e0e0d0f13201513121213271c1e17202e2931302e292d2c333a4a3e333646372c2d405741464c4e525352323e5a615a50604a51524fffdb0043010e0e0e131113261515264f352d354f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4fffc00011080168028003012200021101031101ffc4001f0000010501010101010100000000000000000102030405060708090a0bffc400b5100002010303020403050504040000017d01020300041105122131410613516107227114328191a1082342b1c11552d1f02433627282090a161718191a25262728292a3435363738393a434445464748494a535455565758595a636465666768696a737475767778797a838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2f3f4f5f6f7f8f9faffc4001f0100030101010101010101010000000000000102030405060708090a0bffc400b51100020102040403040705040400010277000102031104052131061241510761711322328108144291a1b1c109233352f0156272d10a162434e125f11718191a262728292a35363738393a434445464748494a535455565758595a636465666768696a737475767778797a82838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae2e3e4e5e6e7e8e9eaf2f3f4f5f6f7f8f9faffda000c03010002110311003f00','hex')
let buf = [x]

function rtsp_jpeg({ id, data }) {
  buf.push(data.slice(20))


  if (data[1] === 154) {
    x = Buffer.concat(buf);
    fs.writeFileSync('t0.jpg',x)
    buf = [x];
    process.exit(0)
  }


  // console.log(data.slice(12))

}

function rtsp_stream({ id, data }) {
  if (STORE.cams[id] !== undefined) {
      STORE.cams[id].subs
        .forEach(channelid => {
          if (STORE.channels.ws[channelid] !== undefined && STORE.channels.ws[channelid].socket.readyState === 1) {
            STORE.channels.ws[channelid].socket.send(Buffer.concat([Buffer.from([4, Number(id), 0, 0, 0, 0]), data]));
          }
      });
  }
}

function rtsp_play({ id, rawdata }) {
  if (STORE.cams[id] !== undefined) {
    STORE.cams[id].rtsp = rawdata;
  }
  STORE.cams[id].subs
    .forEach(channelid => {
      plugin.transferdata(channelid, { method: 'rtsp_ok', params: { camid: id, rawdata } });
    });
}

function create_rtsp(id, config) {
  console.log(`rtsp: ${config.id} (${config.url})`);
  STORE.cams[config.id].rtsp = new Rtsp(config);
  STORE.cams[config.id].rtsp.on('play', rtsp_play);
  STORE.cams[config.id].rtsp.on('stream', rtsp_stream);
  STORE.cams[config.id].rtsp.on('jpeg', rtsp_jpeg);
}

function registrationchannel(socket, type, channelid) {
  console.log(`registrationchannel: ${channelid}`);
  if (type === 'ws') {
    STORE.channels.ws[channelid] = { socket };
  }
}

function sub_cam(id, data) {
  console.log(`cam_sub: ${data.params.id} (${data.params.url})`);
  if (STORE.cams[data.params.id] === undefined) {
    STORE.cams[data.params.id] = { config: data.params, rtsp: null, subs: [] };
    STORE.cams[data.params.id].subs.push(id);
    create_rtsp(id, data.params)
  } else {
    if (STORE.cams[data.params.id].rtsp !== null) {
      plugin.transferdata(id, { method: 'rtsp_ok', params: { camid: data.params.id, rawdata: STORE.cams[data.params.id].rtsp } });
    }
    STORE.cams[data.params.id].subs.push(id);
  }
  plugin.transferdata(id, { method: 'cam_ok', params: data.params });
}

function wsmessage(ws, data) {
  switch (data[0]) {
    case 0:
      registrationchannel(ws, 'ws', data.slice(1).toString())
      break;
    default:
      break;
  }
}

function wsconnection(ws) {
  ws.on('message', data => wsmessage(ws, data));
  ws.on('close', () => console.log('close', new Date().toString()));
  ws.on('error', () => console.log('error', new Date().toString()));
}

function channel_settings(id, data) {
  if (data.params.type === 'ws') {
    plugin.transferdata(id, { method: 'channel_settings', params: { type: 'ws', port: 8089 } });
  }
}

plugin.on('transferdata', ({ id, data }) => {
  switch (data.method) {
    case 'create_channel':
      channel_settings(id, data);
      break;
    case 'sub_cam':
      sub_cam(id, data);
      break;
    default:
      break;
  }
});

plugin.on('start', () => {
  const wss = new WebSocket.Server({ port: 8089 });
  wss.on('connection', wsconnection);
});
