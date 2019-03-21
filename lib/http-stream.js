const EventEmitter = require('events');
const http = require('http');
const url = require('url');

function parseUrl(string) {
  const parse = url.parse(string)
  const host = parse.hostname;
  const port = Number(parse.port) || 80;

  let login = '';
  let pass = '';

  if (parse.auth) {
    const temp = parse.auth.split(':');
    if (temp.length === 2) {
      login = temp[0];
      pass = temp[1];
    } else {
      login = temp[0];
      pass = '';
    }
  }

  return {
    host,
    port,
    url: `${parse.protocol}//${host}:${port}${parse.path}`,
    login,
    pass,
   }
}


class HttpStream extends EventEmitter {

  constructor(options) {
    super();

    this.id = options.id;
    this.type = options.protocol;
    this.transport = options.transport;

    this.parse = parseUrl(options.url);

    this.url = this.parse.url;
    this.login = this.parse.login;
    this.pass = this.parse.pass;

    this.url_original = options.url;

    this.err = 0;

    this._res = this.res.bind(this);
    this.i = 1;
    this.start()
  }

  req() {
    http.get(this.url_original, function(res) {
      console.log(res.headers)
    });
    // const r = request(this.settings, this._res);
    // r.on('data', this.stream)
  }

  stream(data) {
    console.log(data.slice(0, 20).toString(), data.length)
    this.i = this.i + 1;
    if (this.i === 2) {
      process.exit();
    }

  }

  res(error, response, body) {
    if (error === null && response.statusCode === 200) {
    } else {
      if (this.err === 0) {
        this.err = 1;
        this.settings = {
          uri: this.url,
          encoding: null,
          forever: true,
          auth: {
            user: this.login,
            pass: this.pass,
            sendImmediately: false
          }
        };
        this.req();
      } else {
        console.log('error', error);
      }
    }
  }

  destroy() {

  }

  start() {
    this.emit('play', { id: this.id, rawdata: [] });
    this.req();
  }
}

module.exports = HttpStream;
