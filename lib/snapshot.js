const EventEmitter = require('events');
const request = require('request');


class Snapshot extends EventEmitter {

  constructor(options) {
    super();

    this.id = options.id;
    this.type = options.protocol;
    this.transport = options.transport;
    this.url = options.url;

    this._res = this.res.bind(this);

    setTimeout(() => this.start(), 250)
  }

  req() {
    const options = {
      uri: 'http://192.168.0.64/ISAPI/Streaming/channels/102/picture',
      encoding: null,
      auth: {
        user: 'admin',
        pass: 'hikvision662412',
        sendImmediately: false
      }
    };
    request(options, this._res);
  }

  res(error, response, body) {
    if (error === null) {
      this.emit('stream', { id: this.id, data: body });
      this.req();
    } else {
      console.log('error', error);
    }
  }

  destroy() {

  }

  start() {
    this.emit('play', { id: this.id, rawdata: [] });
    this.req();
  }
}

module.exports = Snapshot;
