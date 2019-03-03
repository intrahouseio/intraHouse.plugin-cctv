const WebSocket = require('ws');
const Plugin = require('./lib/plugin');
const Rtsp = require('./lib/rtsp');

const tools = require('./lib/tools');


const plugin = new Plugin();

const STORE = {
  cams: { },
  channels: { ws: {}, p2p: {} },
  jpeg: {}
};


function rtsp_jpeg({ id, data }) {
  const t = data[16];
  const q = data[17];

  const reset = 64 <= t && t <= 127;
  const quant = 128  <= q && q <= 255;


  if (STORE.jpeg[id] === undefined) {
    STORE.jpeg[id] = { first: true, buffer: [], header: null };
  }

  if (STORE.jpeg[id].first === true) {
    if (STORE.jpeg[id].header === null) {
      STORE.jpeg[id].header = tools.genJpegHeader(reset, quant, data)
    }

    STORE.jpeg[id].buffer.push(STORE.jpeg[id].header);
  }

  STORE.jpeg[id].buffer.push(tools.sliceJpegData(reset, STORE.jpeg[id].first && quant, data))

  if (STORE.jpeg[id].first === true) {
    STORE.jpeg[id].first = false;
  }

  if (data[1] === 154) {
    rtsp_stream({ id, data: Buffer.concat(STORE.jpeg[id].buffer) })
    STORE.jpeg[id].buffer = [];
    STORE.jpeg[id].first = true;
  }
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
