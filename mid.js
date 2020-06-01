// 转发中间层

const http = require('http');
const fs = require('fs');
const { Duplex } = require('stream');
const {Sender} = require('ws');
const server = http.createServer((req, res) => {
    if (req.url === '/') {
        res.end(fs.readFileSync('./index.html'));
    }
    res.end('hello world');
}).listen(5000);
let masked = true;
function send (msg, string, socket) {
    let opcode, payload;
    if (!string && Buffer.isBuffer(msg)) {
        opcode = 2;
        payload = msg;
    } else {
        msg = '' + msg;
        opcode = 1;
        payload = Buffer.from(msg);
    }

    _send(opcode, payload, socket);
}

function _send (opcode, payload, socket) {
    let payloadLen = payload.length, prefixLen = masked ? 6 : 2; // head + mask
    if (payloadLen > 65535) {
        prefixLen += 8;
    } else if (payloadLen > 125) {
        prefixLen += 2;
    }
    const prefix = Buffer.allocUnsafe(prefixLen);
    prefix[0] = opcode | 0x80;
    if (payloadLen > 65535) {
        prefix[1] = 127;
        prefix.writeUInt32BE(payloadLen / 0x10000000 | 0, 2, true);
        prefix.writeUInt32BE(payloadLen, 6, true);
    } else if (payloadLen > 125) {
        prefix[1] = 126;
        prefix.writeUInt16BE(payloadLen, 2, true);
    } else {
        prefix[1] = payloadLen;
    }
    if (masked) {
        prefix[1] |= 0x80;
        const mask = prefix.slice(-4);
        mask.writeInt32BE(Math.random() * 0xffffffff | 0, 0, true); // random mask
        for (let i = 0; i < payloadLen; i++) {
            payload[i] ^= mask[(i & 3)];
        }
    }
    socket.write(prefix);
    socket.write(payload);
}

server.on('data', (chunk) => {
    console.log(chunk.toString(), 'chunktostring');
})
server.on('upgrade', (req, client, head) => {
    const headers = _getProxyHeader(req.headers) //将客户端的websocket头和一些信息转发到真正的处理服务器上
    headers.hostname = 'localhost'//目标服务器
    headers.path = '/channel' // 目标路径 
    headers.port = 4000
    const proxy = http.request(headers) // https可用https，headers中加入rejectUnauthorized=false忽略证书验证
    console.log('接收前端请求并转发至localhost:4000/channel');
    proxy.on('upgrade', (res, socket, head) => {
        socket.on('data', (chunk) => {
            console.log(chunk.toString());
        })
        send('322', undefined, socket);
        client.write(_formatProxyResponse(res))//使用目标服务器头信息响应客户端
        client.pipe(socket);
        socket.pipe(client);
    })
    proxy.on('error', (error) => {
        client.write("Sorry, cant't connect to this container ")
        return
    })
    proxy.end();
    function _getProxyHeader(headers) {
        const keys = Object.getOwnPropertyNames(headers)
        const proxyHeader = { headers: {} }
        keys.forEach(key => {
            if (key.indexOf('sec') >= 0 || key === 'upgrade' || key === 'connection') {
                proxyHeader.headers[key] = headers[key]
                return
            }
            proxyHeader[key] = headers[key]
        })
        return proxyHeader
    }
    function _formatProxyResponse(res) {
        const headers = res.headers
        const keys = Object.getOwnPropertyNames(headers)
        let switchLine = '\r\n';
        let response = [`HTTP/${res.httpVersion} ${res.statusCode} ${res.statusMessage}${switchLine}`]
        keys.forEach(key => {
            response.push(`${key}: ${headers[key]}${switchLine}`)
        })
        response.push(switchLine)
        return response.join('')
    }
})