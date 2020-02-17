const EventEmitter = require('events');


class Plugin extends EventEmitter {

  constructor() {
    super();

    process.on('message', this.message.bind(this));
    this.unitid = process.argv[2];
    this.mode = 0;
    this.channels = [];
    this.system = {};
    this.params = {};
    this.start();
  }

  debug(data) {
    process.send({ type: 'debug', txt: data });
  }

  message(msg) {
    if (msg.type === 'get' && msg.hasOwnProperty('system')) {
      this.system = msg.system;
      this.updateMode();
    }
    if (msg.type === 'get' && msg.hasOwnProperty('params')) {
      this.params = msg.params;
      this.updateMode();
    }
    if (msg.type === 'get' && msg.hasOwnProperty('config')) {
      this.channels = msg.config;
      this.updateMode();
    }

    if (msg.type === 'act') {
      this.emit('device_action', msg.data[0]);
    }
    if (msg.type === 'command') {
      function resolve(payload) {
        msg.response = true;
        msg.payload = payload;
        process.send(msg);
      }

      function reject(txt) {
        msg.response = false;
        msg.message = txt;
        process.send(msg);
      }

      const temp = Object.assign({}, msg);

      temp.resolve = resolve.bind(this);
      temp.reject = reject.bind(this);
      temp.type = msg.command;
      delete temp.command;
      this.emit('command', temp);
    }
    if (msg.type === 'debug') {
      this.emit('debug', msg.mode);
    }
    if (msg.type === 'sub' && msg.hasOwnProperty('data')) {
      this.emit('info', msg.data);
    }
    if (msg.type === 'transferdata' && msg.hasOwnProperty('payload')) {
      this.emit('transferdata', { id: msg.id, data: msg.payload });
    }
  }

  toolbar_command_done(data) {
    data.response = true;
    process.send(data);
  }

  updateMode() {
    this.mode++;
    if (this.mode === 3) {
      this.mode = 4;
      this.emit('start');
    }
  }

  logo() {
    this.debug('start');
    this.debug('version: 2.4.0');
  }

  getChannels() {
    return this.channels;
  }

  getSettings() {
    return Object.assign({}, this.params, this.system);
  }

  send(tablename) {
    process.send({ type: 'get', tablename: `${tablename}/${this.unitid}` });
  }

  info() {
    process.send({ type: 'sub', id: this.unitid, event: 'sendinfo', filter: { type: this.unitid } });
  }

  setChannels(data) {
    process.send({ type: 'channels', data });
  }

  setDeviceValue(id, value, ext = {}) {
    process.send({ type: 'data', data: [{ id, value, ext }] });
  }

  setDeviceError(id, message) {
    process.send({ type: 'data', data: [{ id, err: message }] });
  }

  transferdata(id, payload) {
    process.send({ type: 'transferdata', id, payload });
  }

  start() {
    this.logo();
    this.send('system');
    this.send('params');
    this.send('config');
  }

}

module.exports = Plugin;
