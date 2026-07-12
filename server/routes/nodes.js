import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import dgram from 'dgram';
import os from 'os';
import { loadNodes, saveNodes } from '../store.js';
import { poller } from '../poller.js';
import logger from '../logger.js';

const router = Router();

const DISCOVERY_PORT = 14141;

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    const iface = interfaces[name];
    if (!iface) continue;
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) return addr.address;
    }
  }
  return '127.0.0.1';
}

// ── 获取所有节点 ──
router.get('/', (req, res) => {
  const nodes = loadNodes();
  res.json(nodes);
});

// ── 添加节点 ──
router.post('/', (req, res) => {
  const { name, host, port, hosts } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: '节点名称不能为空' });

  // hosts 数组模式（多IP分组）
  if (Array.isArray(hosts) && hosts.length > 0) {
    for (const h of hosts) {
      if (!h.host?.trim()) return res.status(400).json({ error: '主机地址不能为空' });
      const p = Number(h.port) || 80;
      if (p < 1 || p > 65535) return res.status(400).json({ error: '端口无效' });
    }
    const nodes = loadNodes();
    const node = {
      id: uuidv4(),
      name: name.trim(),
      hosts: hosts.map((h) => ({ host: h.host.trim(), port: Number(h.port) || 80 })),
      host: hosts[0].host.trim(),
      port: Number(hosts[0].port) || 80,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    nodes.push(node);
    saveNodes(nodes);
    logger.info({ node: node.name }, '分组节点已添加');
    // 轮询第一个IP
    poller.addNode(node);
    res.status(201).json(node);
    return;
  }

  // 单IP模式（原有逻辑）
  if (!host?.trim()) return res.status(400).json({ error: '主机地址不能为空' });
  const p = Number(port) || 80;
  if (p < 1 || p > 65535) return res.status(400).json({ error: '端口无效' });

  const nodes = loadNodes();
  const node = {
    id: uuidv4(),
    name: name.trim(),
    host: host.trim(),
    port: p,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  nodes.push(node);
  saveNodes(nodes);
  logger.info({ node: node.name }, '节点已添加');

  // 立即轮询新节点
  poller.addNode(node);

  // 发送 UDP 注册通知给新节点，告知其开始心跳上报
  const hubPort = Number(process.env.PORT) || 80;
  const registerMsg = JSON.stringify({
    type: 'mqtt-hub-register',
    hubIp: getLocalIp(),
    hubPort,
  });
  const msgBuf = Buffer.from(registerMsg);
  const udpSocket = dgram.createSocket('udp4');
  udpSocket.send(msgBuf, 0, msgBuf.length, DISCOVERY_PORT, node.host, () => {
    udpSocket.close();
  });

  res.status(201).json(node);
});

// ── 修改节点 ──
router.put('/:id', (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: '节点名称不能为空' });

  const nodes = loadNodes();
  const node = nodes.find((n) => n.id === req.params.id);
  if (!node) return res.status(404).json({ error: '节点不存在' });

  node.name = name.trim();
  node.updatedAt = new Date().toISOString();
  saveNodes(nodes);
  logger.info({ node: node.name }, '节点已修改');
  res.json(node);
});

// ── 删除节点 ──
router.delete('/:id', (req, res) => {
  const nodes = loadNodes();
  const index = nodes.findIndex((n) => n.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '节点不存在' });
  nodes.splice(index, 1);
  saveNodes(nodes);
  poller.removeNode(req.params.id);
  res.json({ success: true });
});

export default router;
