import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { loadNodes, saveNodes } from '../store.js';
import logger from '../logger.js';

const router = Router();

// ── 获取所有节点 ──
router.get('/', (req, res) => {
  const nodes = loadNodes();
  res.json(nodes);
});

// ── 添加节点 ──
router.post('/', (req, res) => {
  const { name, host, port } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: '节点名称不能为空' });
  if (!host?.trim()) return res.status(400).json({ error: '主机地址不能为空' });
  const p = Number(port) || 8088;
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
  res.status(201).json(node);
});

// ── 删除节点 ──
router.delete('/:id', (req, res) => {
  const nodes = loadNodes();
  const index = nodes.findIndex((n) => n.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '节点不存在' });
  nodes.splice(index, 1);
  saveNodes(nodes);
  res.json({ success: true });
});

export default router;
