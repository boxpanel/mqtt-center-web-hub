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

// 合并带标签的IP列表，去重
function mergeLabeledIps(existing, incoming) {
  const map = new Map();
  for (const item of [...existing, ...incoming]) {
    if (!map.has(item.ip)) {
      map.set(item.ip, item);
    }
  }
  return [...map.values()];
}

export function searchNodes(hubPort) {
  return new Promise((resolve) => {
    // 按 groupKey分组，VIP优先，无VIP时用hostname
    const groups = new Map();
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
          // 格式1: 自定义客户端 - 不做分组
          const key = data.name || data.host;
          if (!groups.has(key)) {
            groups.set(key, {
              name: key,
              label: null,
              items: [{ ip: data.host, port: data.port || 8088, label: null }],
            });
          }
        } else if (data.type === 'mqtt-hub-info' && data.ip) {
          // 格式2: MQTT-Center-web 客户端
          // 有VIP时按VIP分组，否则按hostname
          const groupKey = data.vip || data.hostname || data.ip;
          const port = data.port || 8088;
          const ips = data.ips || [data.ip];

          // 给每个IP加上label和port
          const items = ips.map((ip) => {
            let label = null;
            if (data.vip && ip === data.vip) label = '虚';
            else if (data.role === 'master' || (ip === data.ip && data.role !== 'standby')) label = '主';
            else if (data.role === 'standby' || (ip !== data.ip && data.role !== 'master')) label = '备';
            else label = '备';
            return { ip, port, label };
          });

          if (!groups.has(groupKey)) {
            groups.set(groupKey, {
              name: data.hostname || data.ip,
              label: groupKey === data.vip ? '虚' : null,
              items,
            });
          } else {
            const g = groups.get(groupKey);
            g.items = mergeLabeledIps(g.items, items);
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
