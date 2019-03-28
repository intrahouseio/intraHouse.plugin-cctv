const child = require('child_process');
const net = require('net');
const dgram = require('dgram');

const modulepath = './index.js';

const unitid = 'cctv'

const params = {
  wsport: 8099
}

const system = {

}

const config = [];

const ps = child.fork(modulepath, [unitid]);


const udpserver = dgram.createSocket('udp4');

udpserver.on('message', udpserver_message);
udpserver.on('error', udpserver_error);
udpserver.on('listening', udpserver_listening);

function udpserver_message(text) {
  const data = JSON.parse(text.toString())
//  console.log('-------------SERVER-------------', new Date().toLocaleString());
//  console.log(data);
//  console.log('');
  ps.send(data);
}

function udpserver_error() {

}

function udpserver_listening() {

}

udpserver.bind(10001);

ps.on('message', data => {
  // console.log('-------------PLUGIN-------------', new Date().toLocaleString());
  // console.log(data);
  // console.log('');

  udpserver.send(JSON.stringify(data), 10000, '127.0.0.1');
});

ps.on('close', code => {
  console.log('close');
});

ps.send({type: 'debug', mode: true });
