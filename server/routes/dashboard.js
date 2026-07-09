import { Router } from 'express';
import { loadNodes } from '../store.js';
import { poller } from '../poller.js';

const router = Router();

// ── 聚合数据 ──
router.get('/summary', (req, res) => {
  const nodes = loadNodes();
  const aggregated = poller.getAggregated();
  res.json({ nodes: nodes.length, ...aggregated });
});

// ── 所有节点的详细状态 ──
router.get('/nodes', (req, res) => {
  const states = poller.getAllStates();
  res.json(states);
});

// ── SSE 实时推送 ──
router.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // 推送初始聚合数据
  res.write(`data: ${JSON.stringify({ type: 'summary', data: poller.getAggregated() })}\n\n`);
  res.write(`data: ${JSON.stringify({ type: 'nodes', data: poller.getAllStates() })}\n\n`);

  const unsub = poller.onEvent((event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
    // 每条节点更新后附带最新聚合
    res.write(`data: ${JSON.stringify({ type: 'summary', data: poller.getAggregated() })}\n\n`);
  });

  req.on('close', unsub);
});

export default router;
