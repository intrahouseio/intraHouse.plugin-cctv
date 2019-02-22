const EventEmitter = require('events');
const crypto = require('crypto');
const net = require('net');
const dgram = require('dgram');

function parseParams(text) {
  if (text.indexOf('=') !== -1 && text.indexOf(', ') !== -1) {
    const temp = {};
    const parse = text.replace(/\"/gi, '').split(', ');
    parse.forEach(row => {
      const item = row.split('=');
      if (item.length === 2) {
        const key = item[0].replace(/ /gi, '')
        temp[key.toLowerCase()] = item[1];
      }
    });
    return temp;
  }
  if (text.indexOf('=') !== -1 && text.indexOf(';') !== -1) {
    const temp = {};
    const parse = text.replace(/\"/gi, '').split(';');
    parse.forEach(row => {
      const item = row.split('=');
      if (item.length === 2) {
        const key = item[0].replace(/ /gi, '')
        temp[key.toLowerCase()] = item[1];
      }
      if (item.length === 1 && temp['value'] === undefined) {
        temp['value'] = item[0].replace(/ /gi, '')
      }
    });
    return temp;
  }

  return text;
}

function parseHeaders(text) {
  const temp = {
    code: null,
    status: null,
    version: null,
  };
  if (text !== undefined) {
    const parse = text.split('\r\n');
    if (parse.length !== 0) {
      parse.forEach(row => {
        const item = row.split(': ');
        if (item.length === 1) {
          const i = item[0].split(' ');
          if (i.length >= 3) {
            temp['version'] = i[0];
            temp['code'] = i[1];
            temp['status'] = i[2];
          }
        }
        if (item.length === 2) {
          const key = item[0].toLowerCase();
          if (temp[key]) {
            temp[key + '2'] = parseParams(item[1]);
          } else {
            temp[key] = parseParams(item[1]);
          }
        }
      });
    }
  }
  return temp;
}

function parseBody(text) {
  if (text !== undefined) {
    return text.split('\r\n')
  }
  return [];
}

function parse(text) {
  const parse = text.split('\r\n\r\n');

  return { headers: parseHeaders(parse[0]), body: parseBody(parse[1])  };
}

function checkrawdata(data) {
  const text = String(data);
  const index = text.indexOf('m=audio');
  if (index !== -1) {
    const temp = text.split('\r\n\r\n');
    if (temp.length === 2) {
      const l = temp[1].length;
      const index2 = temp[1].indexOf('m=audio');
      if (index2 !== -1) {
        const temp2 = temp[1].slice(0, index2) + '\r\n';
        const temp3 = temp[0].replace(`ength: ${l}`, `ength: ${temp2.length}`);
        return temp3 + '\r\n\r\n' + temp2;
      }
    }
  }
  return text;
}


class Rtsp extends EventEmitter {

  constructor(options) {
    super();

    this.id = options.id;
    this.cseq = 2;
    this.pversion = 'RTSP/1.0';
    this.useragent = 'ih-cctv (intraHouse plugin cctv)';

    this.host = '192.168.0.64';
    this.port = 554;

    this.url = `rtsp://${this.host}:${this.port}/videoMain`;
    this.login = 'admin';
    this.pass = 'hikvision662412' || 'hikvision662412';
    this.auth = false;
    this.digestrealm = '';
    this.nonce = '';
    this.udpport1 = '';
    this.udpport2 = '';

    this.type = 'udp';
    this.rawdata = [];

    this.client = new net.Socket();
    this.client.on('data', this.message.bind(this));
    this.client.on('error', this.error.bind(this));
    this.client.on('close', this.close.bind(this));

    this.udpserver = dgram.createSocket('udp4');
    this.udpserver.on('message', this.udpserver_message.bind(this));
    this.udpserver.on('error', this.udpserver_error.bind(this));
    this.udpserver.on('listening', this.udpserver_listening.bind(this));

    this.start();
  }

  udpserver_message(data) {
    this.emit('stream', { id: this.id, data });
  }

  udpserver_error() {

  }

  udpserver_listening() {
    const address = this.udpserver.address();
    this.udpport1 = address.port;
    this.udpport2 = address.port + 1;
    this.send(this.packet_setup());
  }

  getAuth() {
    if (this.auth && this.login !== '') {
      if (this.digestrealm === '' && this.nonce === '') {
        const a = Buffer.from(`${this.login}:${this.pass}`).toString('base64');
        return 'Authorization: Basic ' + a + '\r\n';
      } else {
        const a = crypto.createHash('md5').update(`${this.login}:${this.digestrealm}:${this.pass}`).digest("hex");
        const b = crypto.createHash('md5').update(`${this.method}:${this.url}`).digest("hex");
        const c = crypto.createHash('md5').update(`${a}:${this.nonce}:${b}`).digest("hex");
        const d = `Digest username="${this.login}", realm="${this.digestrealm}", nonce="${this.nonce}", uri="${this.url}", response="${c}"`;
        return 'Authorization: ' + d + '\r\n';
      }
    }
    return '';
  }

  packet_options() {
    this.method = 'OPTIONS';
    return `${this.method} ${this.url} ${this.pversion}\r\n` +
           `CSeq: ${this.cseq}\r\n` +
           `User-Agent: ${this.useragent}`
  }

  packet_describe() {
    this.method = 'DESCRIBE';
    return `${this.method} ${this.url} ${this.pversion}\r\n` +
           `CSeq: ${this.cseq}\r\n` +
           `User-Agent: ${this.useragent}\r\n` +
            this.getAuth() +
           'Accept: application/sdp'
  }

  packet_setup() {
    this.method = 'SETUP';
    return `${this.method} ${this.url}${this.uri} ${this.pversion}\r\n` +
           `CSeq: ${this.cseq}\r\n` +
           `User-Agent: ${this.useragent}\r\n` +
            this.getAuth() +
           `Transport: RTP/AVP;unicast;client_port=${this.udpport1}-${this.udpport2}`
  }

  packet_play() {
    this.method = 'PLAY';
    return `${this.method} ${this.url} ${this.pversion}\r\n` +
           `CSeq: ${this.cseq}\r\n` +
           `User-Agent: ${this.useragent}\r\n` +
            this.getAuth() +
           `Session: ${this.session}\r\n` +
           'Range: npt=0.000-'
  }

  responseOK(msg) {
    if (this.method === 'PLAY') {
      this.emit('play', { id: this.id, rawdata: this.rawdata });
      console.log(`normal: ${this.url} (rtsp play)`);
    }

    if (this.method === 'SETUP') {
      if (msg.headers['session'] !== undefined && msg.headers['session']['value']) {
        this.session = msg.headers['session']['value'];
      }
      this.send(this.packet_play());
    }

    if (this.method === 'DESCRIBE') {
      let check = false;

      msg.body.forEach(i => {
        const mv = i.indexOf('m=video');
        const ma = i.indexOf('m=audio');
        if (mv !== -1) {
          check = true;
        }
        if (ma !== -1) {
          check = false;
        }
        if (check) {
          const ac = i.indexOf('a=control:');
          if (ac !== -1) {
            this.uri = i.slice(10 + ac)
          }
        }
      })
      if (msg.headers['content-base'] !== undefined) {
        this.url = msg.headers['content-base'];
      }
      if (this.type === 'udp') {
        this.udpserver.bind();
      }
    }

    if (this.method === 'OPTIONS') {
      this.send(this.packet_describe());
    }
  }

  responseError(msg) {
    if (this.method === 'DESCRIBE' && this.auth === true && msg.headers.code === '401') {
      console.log(`error: ${this.url} (fail auth)`);
    }

    if (this.method === 'DESCRIBE' && this.auth === false && msg.headers.code === '401') {
      if (msg.headers['www-authenticate']) {
        if (msg.headers['www-authenticate']['digestrealm'] && msg.headers['www-authenticate']['digestrealm'] !== '') {
          this.digestrealm = msg.headers['www-authenticate']['digestrealm'];
        }
        if (msg.headers['www-authenticate']['nonce'] && msg.headers['www-authenticate']['nonce'] !== '') {
          this.nonce = msg.headers['www-authenticate']['nonce'];
        }
      }
      this.auth = true;
      this.send(this.packet_describe());
      console.log(`warning: ${this.url} (need auth)`);
    }

    if (msg.headers.code !== '401') {
      const text = msg.headers.status.toLowerCase ? msg.headers.status.toLowerCase() : msg.headers.status;
      console.log(`error: ${this.url} (${text})`);
    }
  }

  close() {

  }

  error(e) {
    console.log('error')
  }

  send(data) {
    this.client.write(data + '\r\n\r\n');
    this.cseq++;
  }

  open() {
    this.send(this.packet_options());
  }

  message(data) {
    const msg = parse(String(data));
    if (msg.headers.code === '200') {
      this.rawdata.push(checkrawdata(data))
      this.responseOK(msg);
    } else {
      this.responseError(msg);
    }
  }

  start() {
    this.client.connect(this.port, this.host, this.open.bind(this));
  }
}

module.exports = Rtsp;
