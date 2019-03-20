const EventEmitter = require('events');
const request = require('request');


class Snapshot extends EventEmitter {

  constructor(options) {
    super();

    this.id = options.id;
    this.type = options.protocol;
    this.transport = options.transport;
    this.url = options.url;

    this.start();
  }

  req() {
    request('', function (error, response, body) {
      if (error === null) {
        console.log(body);
      } else {
        console.log('error');
      }
    });
  }

  destroy() {

  }

  start() {
    console.log(this.url)
  }
}

module.exports = Snapshot;
