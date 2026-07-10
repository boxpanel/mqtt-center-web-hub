/**
 * MQTT Center 节点 UDP 发现应答器
 * 部署到每个节点机器上运行，监听 UDP 14141 端口
 * 收到 Hub 的广播后自动回复本机信息
 *
 * 使用: node responder.js
 * 可通过环境变量配置:
 *   NODE_NAME  - 节点名称（默认取主机名）
 *   NODE_HOST  - 本机 IP（默认自动获取）
 *   NODE_PORT  - HTTP 服务端口（默认 80）
 */
import dgram from 'dgram';
import os from 'os';

const DISCOVERY_PORT = 14141;

// ── 配置 ──
const NAME = process.env.NODE_NAME || os.hostname();
const PORT = Number(process.env.NODE_PORT) || 80;

function getLocalIP() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

const HOST = process.env.NODE_HOST || getLocalIP();

// ── 启动 UDP 监听 ──
const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

socket.on('error', (err) => {
  console.error('[responder] socket error:', err.message);
});

socket.on('message', (msg, rinfo) => {
  try {
    const data = JSON.parse(msg.toString());
    if (data.type === 'mqtt-hub-discovery') {
      const response = JSON.stringify({
        type: 'mqtt-hub-discovery-resp',
        name: NAME,
        host: HOST,
        port: PORT,
      });
      socket.send(response, 0, response.length, rinfo.port, rinfo.address);
      console.log(`[responder] 已响应 Hub 发现请求 from ${rinfo.address}:${rinfo.port}`);
    }
  } catch { /* 忽略无法解析的包 */ }
});

socket.bind(DISCOVERY_PORT, () => {
  console.log(`[responder] MQTT Center 发现应答器已启动`);
  console.log(`[responder]   名称: ${NAME}`);
  console.log(`[responder]   地址: ${HOST}:${PORT}`);
  console.log(`[responder]   监听端口: ${DISCOVERY_PORT}`);
});
