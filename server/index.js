import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from './logger.js';
import { loadNodes } from './store.js';
import { poller } from './poller.js';
import { searchNodes } from './discovery.js';
import { getSystemMetrics } from './system.js';
import nodesRouter from './routes/nodes.js';
import dashboardRouter from './routes/dashboard.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 80;
const app = express();

app.use(cors());
app.use(express.json());

// ── API ──
app.use('/api/nodes', nodesRouter);
app.use('/api/dashboard', dashboardRouter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// ── LAN 节点发现 ──
app.post('/api/discovery/search', async (req, res) => {
  try {
    const nodes = await searchNodes(PORT);
    res.json(nodes);
  } catch (err) {
    res.status(500).json({ error: '发现失败' });
  }
});

// ── 客户端心跳上报 ──
app.post('/api/heartbeat', (req, res) => {
  const { host, port, stats, system, clients, version } = req.body;
  if (!host || !port) return res.status(400).json({ error: '缺少 host 或 port' });
  const updated = poller.handleHeartbeat({ host, port, stats, system, clients, version });
  res.json({ success: true, matched: updated });
});

// ── Hub 自身系统资源 ──
app.get('/api/system', (req, res) => {
  try {
    res.json(getSystemMetrics());
  } catch (err) {
    res.status(500).json({ error: '获取系统资源失败' });
  }
});

// ── 静态文件 ──
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) res.status(404).send('前端未构建，请运行 npm run build');
  });
});

// ── 启动轮询 ──
const nodes = loadNodes();
if (nodes.length > 0) {
  poller.start(nodes);
  logger.info({ nodes: nodes.length }, '已加载节点，开始轮询');
} else {
  logger.info('暂无节点，请在管理后台添加');
}

// ── 启动 HTTP ──
const server = app.listen(PORT, '0.0.0.0', () => {
  logger.info({ port: PORT }, 'MQTT Center Hub 已启动');
});

server.on('error', (err) => {
  logger.fatal({ err }, '服务启动失败');
  process.exit(1);
});

// ── 优雅关闭 ──
const shutdown = () => {
  logger.info('正在关闭...');
  poller.stop();
  server.close(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason instanceof Error ? reason : new Error(String(reason)) }, '未处理的 Promise 拒绝');
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, '未捕获的异常');
});
