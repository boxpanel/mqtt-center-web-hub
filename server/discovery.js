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
    const groups = new Map(); // hostname → { name, hostname, port, ips, stats }
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const hubIp = getLocalIp();
    const DISCOVERY_MSG = Buffer.from(JSON.stringify({ type: 'mqtt-hub-discovery', version: 1, hubIp, hubPort: hubPort || 80 }));

    socket.on('error', (err) => {
      logger.warn({ err }, 'UDP 发现 socket 错误');
      socket.close();
      resolve([...groups.values()]);
    });

    socket.on('message', (msg) => {
      try {
        const data = JSON.parse(msg.toString());
        if (data.type === 'mqtt-hub-discovery-resp' && data.host) {
          // 格式1: 自定义客户端
          const key = data.name || data.host;
          if (!groups.has(key)) {
            groups.set(key, {
              name: key,
              port: data.port || 8088,
              ips: [data.host],
            });
          } else {
            const g = groups.get(key);
            if (!g.ips.includes(data.host)) g.ips.push(data.host);
          }
        } else if (data.type === 'mqtt-hub-info' && data.ip) {
          // 格式2: MQTT-Center-web 客户端
          const key = data.hostname || data.ip;
          if (!groups.has(key)) {
            const entry = {
              name: key,
              port: data.port || 8088,
              ips: [data.ip],
              stats: data.stats || { total: 0, connected: 0, disabled: 0 },
            };
            // 标记VIP
            if (data.vip) {
              entry.vip = data.vip;
              entry.ips.push(data.vip);
            }
            groups.set(key, entry);
          } else {
            const g = groups.get(key);
            if (!g.ips.includes(data.ip)) g.ips.push(data.ip);
            if (data.stats) g.stats = data.stats;
            // 虚拟IP(VIP)也加入同一组并标记
            if (data.vip && !g.ips.includes(data.vip)) {
              g.vip = data.vip;
              g.ips.push(data.vip);
            }
          }
        }
      } catch { /* 忽略无法解析的包 */ }
    });

    socket.bind(DISCOVERY_PORT, () => {
      socket.setBroadcast(true);
      socket.send(DISCOVERY_MSG, 0, DISCOVERY_MSG.length, DISCOVERY_PORT, '255.255.255.255');
      logger.info('已发送 UDP 发现广播');
    });

    setTimeout(() => {
      socket.close();
      resolve([...groups.values()]);
    }, TIMEOUT);
  });
}
