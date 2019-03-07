const WebSocket = require('ws');
const Plugin = require('./lib/plugin');
const Rtsp = require('./lib/rtsp');
const fs = require('fs');

const tools = require('./lib/tools');


const plugin = new Plugin();

const STORE = {
  cams: { },
  channels: { ws: {}, p2p: {} },
  jpeg: {},
  check: {
    cams: {},
    ws: {},
    p2p: {},
  },
};

const SYSTEM_CHECK_INTERVAL = 1000 * 20;
const CHANNEL_CHECK_INTERVAL = 1000 * 10;

const SUB_TIMEOUT = 1000 * 120;
const WS_TIMEOUT = 1000 * 20;
const P2P_TIMEOUT = 1000 * 20;



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
    send_channel({ id, data: Buffer.concat(STORE.jpeg[id].buffer) });
    STORE.jpeg[id].buffer = [];
    STORE.jpeg[id].first = true;
  }
}

function rtsp_stream({ id, data }) {
  const type = data[12] & 0x1F;
  const nri = data[12] & 0x60;
  const is_start = (data[13] & 0x80) >>> 7;
  const is_end = (data[13] & 0x40) >>> 6;
  const payload_type = data[13] & 0x1F;

   // console.log( type, nri, payload_type, is_start, is_end, data.slice(0, 25))

  send_channel({ id, data });

}

function send_channel({ id, data }) {
  if (STORE.cams[id] !== undefined) {
      if (STORE.cams[id].config.transport === 'ws') {
        STORE.cams[id].subs
          .forEach(channelid => {
            if (STORE.channels.ws[channelid] !== undefined && STORE.channels.ws[channelid].socket.readyState === 1) {
              const temp = Buffer.concat([Buffer.from([4, 0, 0, 0, 0, 0, 0]), data]);
              temp.writeUInt16BE(Number(id), 1)
              STORE.channels.ws[channelid].socket.send(temp);
            }
        });
      }
  }
}

function rtsp_play({ id, rawdata }) {
  if (STORE.cams[id] !== undefined) {
    STORE.cams[id].rawdata = rawdata;
  }
  STORE.cams[id].subs
    .forEach(channelid => {
      plugin.transferdata(channelid, { method: 'rtsp_ok', params: { camid: id, rawdata } });
    });
}

function rtsp_close({ id, msg }) {
  console.log(`camtimeout: ${id}`);
  unsub_cam(id, true);
}

function create_cam(id, config) {
  switch (config.type) {
    case 'rtsp/h264':
        STORE.cams[config.id].rtsp = new Rtsp(config);
        STORE.cams[config.id].rtsp.on('play', rtsp_play);
        STORE.cams[config.id].rtsp.on('stream', rtsp_stream);
        STORE.cams[config.id].rtsp.on('close', rtsp_close);
      break;
    case 'rtsp/mjpeg':
        STORE.cams[config.id].rtsp = new Rtsp(config);
        STORE.cams[config.id].rtsp.on('play', rtsp_play);
        STORE.cams[config.id].rtsp.on('stream', rtsp_jpeg);
        STORE.cams[config.id].rtsp.on('close', rtsp_close);
      break;
    default:
      break;
  }
}

function checkchannel(type, channelid) {
  if (type === 'ws') {
    if (STORE.channels.ws[channelid] !== undefined && STORE.channels.ws[channelid].socket.readyState === 1) {
      STORE.channels.ws[channelid].socket.send(Buffer.from([1]));
    }
  }
}

function registrationchannel(socket, type, channelid) {
  console.log(`registrationchannel: ${channelid}`);
  if (type === 'ws') {
    STORE.channels.ws[channelid] = {
      socket,
      activity: Date.now(),
      timer: setInterval(() => checkchannel(type, channelid), CHANNEL_CHECK_INTERVAL)
    };
  }
}

function removechannel(type, channelid) {
  console.log(`removechannel: ${channelid}`);
  if (type === 'ws') {
    Object
      .keys(STORE.cams)
      .forEach(camid => {
        if (STORE.cams[camid] !== undefined && STORE.cams[camid].subs) {
          STORE.cams[camid].subs = STORE.cams[camid].subs.filter(i => i !== channelid)
        }
      });

      if (STORE.channels.ws[channelid] !== undefined) {
        clearInterval(delete STORE.channels.ws[channelid].timer)
        delete STORE.channels.ws[channelid];
      }

    if (STORE.check.ws[channelid] !== undefined) {
      delete STORE.check.ws[channelid]
    }
  }
}

function echochannel(type, channelid) {
  console.log(`echochannel: ${channelid}`);

  if (type === 'ws') {
    if (STORE.channels.ws[channelid] !== undefined) {
      STORE.channels.ws[channelid].activity = Date.now();
    }
  }
}

function sub_cam(id, data) {
  console.log(`cam_sub: ${data.params.id} (${data.params.url})`);
  if (STORE.cams[data.params.id] === undefined) {
    STORE.cams[data.params.id] = { config: data.params, rtsp: null, subs: [] };
    STORE.cams[data.params.id].subs.push(id);
    create_cam(id, data.params)
  } else {
    if (STORE.cams[data.params.id].rtsp !== null) {
      plugin.transferdata(id, { method: 'rtsp_ok', params: { camid: data.params.id, rawdata: STORE.cams[data.params.id].rawdata } });
    }
    STORE.cams[data.params.id].subs.push(id);
  }
  plugin.transferdata(id, { method: 'cam_ok', params: data.params });
}

function unsub_cam(camid, notification) {
  console.log(`cam_unsub: ${camid}`);
  if (STORE.cams[camid] !== undefined) {

    if (notification) {
      STORE.cams[camid].subs
        .forEach(id => {
          plugin.transferdata(id, { method: 'cam_close', params: { camid } });
        });
    }

    switch (STORE.cams[camid].config.type) {
      case 'rtsp/mjpeg':
      case 'rtsp/h264':
        STORE.cams[camid].rtsp.destroy();
        break;
      default:
        break;
    }
    delete STORE.cams[camid];
  }

  if (STORE.check.cams[camid] !== undefined) {
    delete STORE.check.cams[camid];
  }
}

function wsmessage(ws, data) {
  switch (data[0]) {
    case 0:
      registrationchannel(ws, 'ws', data.slice(1).toString())
      break;
    case 2:
      echochannel('ws', data.slice(1).toString())
      break;
    default:
      break;
  }
}

function wsclose(ws, e) {
  Object
    .keys(STORE.channels.ws)
    .forEach(key => {
      if (STORE.channels.ws[key] !== undefined && STORE.channels.ws[key].socket) {
        if (STORE.channels.ws[key].socket === ws) {
          removechannel('ws', key);
        }
      }
    })
}

function wsconnection(ws) {
  ws.on('message', data => wsmessage(ws, data));
  ws.on('close', e => wsclose(ws, e));
}

function channel_settings(id, data) {
  if (data.params.type === 'ws') {
    plugin.transferdata(id, { method: 'channel_settings', params: { type: 'ws', port: 8089 } });
  }
}

function systemCheck() {
  const cams = Object.keys(STORE.cams);
  const ws = Object.keys(STORE.channels.ws);
  const p2p = Object.keys(STORE.channels.p2p);
  console.log('system activity check');
  console.log(`cams: ${cams.length}`);

  cams.forEach(key => {
    if (STORE.cams[key] !== undefined && STORE.cams[key].subs) {
      console.log(`cam ${key}: subs ${STORE.cams[key].subs.length}`);
      if (STORE.cams[key].subs.length === 0) {
        if (STORE.check.cams[key] === undefined) {
          STORE.check.cams[key] = 1;
        } else {
          STORE.check.cams[key] = STORE.check.cams[key] + 1;
        }
      } else {
        if (STORE.check.cams[key] !== undefined) {
          delete STORE.check.cams[key];
        }
      }
    }
  });

  console.log(`channels_ws: ${ws.length}`);

  ws.forEach(key => {
    if (STORE.channels.ws[key] !== undefined) {
      const interval = Date.now() - STORE.channels.ws[key].activity;
      if (interval >= WS_TIMEOUT) {
        STORE.check.ws[key] = true;
      }
    }
  });

  console.log(`channels_p2p: ${p2p.length}`);

  p2p.forEach(key => {
    if (STORE.channels.p2p[key] !== undefined) {
      const interval = Date.now() - STORE.channels.p2p[key].activity;
      if (interval >= WS_TIMEOUT) {
        STORE.check.p2p[key] = true;
      }
    }
  });

  console.log('---------------------------');
  console.log('');

  const tcams = Object.keys(STORE.check.cams);
  const tws = Object.keys(STORE.check.ws);
  const tp2p = Object.keys(STORE.check.p2p);

  console.log('system timeout check');
  console.log(`timeout subs: ${tcams.length}`);

  tcams.forEach(key => {
    if (STORE.check.cams[key] !== undefined) {
      const interval = STORE.check.cams[key] * SYSTEM_CHECK_INTERVAL;

      if (interval > SUB_TIMEOUT) {
        unsub_cam(key, false);
        delete STORE.check.cams[key];
      } else {
        console.log(`sub cam ${key}: timeout ${interval}`);
      }
    }
  });

  console.log(`timeout channels_ws: ${tws.length}`);
  tws.forEach(key => {
    if (STORE.check.ws[key] !== undefined) {
      removechannel('ws', key);
      delete STORE.check.ws[key]
    }
  });

  console.log(`timeout channels_p2p: ${tp2p.length}`);
  tp2p.forEach(key => {
    if (STORE.check.p2p[key] !== undefined) {
      removechannel('p2p', key);
      delete STORE.check.p2p[key]
    }
  });
  console.log('---------------------------');
  console.log('');
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

  setInterval(systemCheck, SYSTEM_CHECK_INTERVAL);
});
