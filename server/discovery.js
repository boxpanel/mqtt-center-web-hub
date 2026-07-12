/**
 * LAN 节点发现模块
 * 发送 UDP 广播，收集存活的节点响应
 */
import dgram from 'dgram';
import os from 'os';
import logger from './logger.js';

const DISCOVERY_PORT = 14141;
const TIMEOUT = 5000;

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    const iface = interfaces[name];
    if (!iface) continue;
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) {
        return addr.address;
      }
    }
  }
  return '127.0.0.1';
}

export function searchNodes(hubPort) {
  return new Promise((resolve) => {
    const results = [];
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const hubIp = getLocalIp();
    const DISCOVERY_MSG = Buffer.from(JSON.stringify({ type: 'mqtt-hub-discovery', version: 1, hubIp, hubPort: hubPort || 80 }));

    socket.on('error', (err) => {
      logger.warn({ err }, 'UDP 发现 socket 错误');
      socket.close();
      resolve(results);
    });

    socket.on('message', (msg) => {
      try {
        const data = JSON.parse(msg.toString());
        if (data.type === 'mqtt-hub-discovery-resp' && data.host) {
          // 格式1: mqtt-hub-discovery-resp（自定义客户端）
          if (!results.some((r) => r.host === data.host && r.port === data.port)) {
            results.push({
              name: data.name || data.host,
              host: data.host,
              port: data.port || 8088,
            });
          }
        } else if (data.type === 'mqtt-hub-info' && data.ip) {
          // 格式2: mqtt-hub-info（MQTT-Center-web 客户端）
          if (!results.some((r) => r.host === data.ip && r.port === data.port)) {
            results.push({
              name: data.hostname || data.ip,
              host: data.ip,
              port: data.port || 8088,
              stats: data.stats || { total: 0, connected: 0, disabled: 0 },
            });
          }
          // 如果有虚拟IP(VIP)，也加入搜索结果
          if (data.vip && !results.some((r) => r.host === data.vip && r.port === data.port)) {
            results.push({
              name: `${data.hostname || data.ip} (VIP)`,
              host: data.vip,
              port: data.port || 8088,
              stats: data.stats || { total: 0, connected: 0, disabled: 0 },
            });
          }
        }
      } catch { /* 忽略无法解析的包 */ }
    });

    socket.bind(DISCOVERY_PORT, () => {
      socket.setBroadcast(true);
      // 发送广播
      socket.send(DISCOVERY_MSG, 0, DISCOVERY_MSG.length, DISCOVERY_PORT, '255.255.255.255');
      logger.info('已发送 UDP 发现广播');
    });

    // 超时后返回结果
    setTimeout(() => {
      socket.close();
      resolve(results);
    }, TIMEOUT);
  });
}
