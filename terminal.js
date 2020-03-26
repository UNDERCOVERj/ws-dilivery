const http = require('http');
const WebSocket = require('ws');

const server = http.createServer();
const wss = new WebSocket.Server({ server, path: '/channel' });

wss.on('connection', function connection(ws) {
    console.log('terminal connect');
    ws.on('message', function incoming(message) {
        console.log('terminal receive: ' + message);
        console.log('terminal return: ' + (+message + 1))
        ws.send(+message + 1);
    });
});

server.listen(4000);