/**
 * 节点轮询器：定时拉取所有节点的状态数据
 */
import logger from './logger.js';

const POLL_INTERVAL = 10000; // 10 秒轮询一次

class NodePoller {
  constructor() {
    this.timer = null;
    this.nodeStates = new Map(); // nodeId → { status, clients, system, lastSeen }
    this.listeners = new Set();
  }

  onEvent(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _emit(data) {
    this.listeners.forEach((fn) => { try { fn(data); } catch {} });
  }

  async pollNode(node) {
    const start = Date.now();
    try {
      const [clientsRes, systemRes] = await Promise.all([
        fetch(`http://${node.host}:${node.port}/api/clients`),
        fetch(`http://${node.host}:${node.port}/api/system`),
      ]);

      if (!clientsRes.ok) throw new Error(`HTTP ${clientsRes.status}`);
      if (!systemRes.ok) throw new Error(`HTTP ${systemRes.status}`);

      const clients = await clientsRes.json();
      const system = await systemRes.json();

      const stats = {
        total: clients.length,
        connected: clients.filter((c) => c.runtime?.status === 'connected').length,
        disabled: clients.filter((c) => !c.enabled).length,
        errors: clients.filter((c) => (c.runtime?.stats?.errors || 0) > 0).length,
      };

      this.nodeStates.set(node.id, {
        nodeId: node.id,
        nodeName: node.name,
        status: 'online',
        clients,
        system,
        stats,
        lastSeen: new Date().toISOString(),
        latency: Date.now() - start,
      });
    } catch (err) {
      this.nodeStates.set(node.id, {
        nodeId: node.id,
        nodeName: node.name,
        status: 'offline',
        clients: [],
        system: null,
        stats: { total: 0, connected: 0, disabled: 0, errors: 0 },
        lastError: err.message,
        lastSeen: this.nodeStates.get(node.id)?.lastSeen || null,
        latency: 0,
      });
    }

    this._emit({
      type: 'node:update',
      data: this.nodeStates.get(node.id),
    });
  }

  async pollAll(nodes) {
    await Promise.allSettled(nodes.map((n) => this.pollNode(n)));
  }

  getNodeState(nodeId) {
    return this.nodeStates.get(nodeId) || null;
  }

  getAllStates() {
    return [...this.nodeStates.values()];
  }

  getAggregated() {
    const all = this.getAllStates();
    const online = all.filter((s) => s.status === 'online');
    return {
      totalNodes: all.length,
      onlineNodes: online.length,
      offlineNodes: all.length - online.length,
      totalClients: online.reduce((s, n) => s + n.stats.total, 0),
      totalConnected: online.reduce((s, n) => s + n.stats.connected, 0),
      totalDisabled: online.reduce((s, n) => s + n.stats.disabled, 0),
      totalErrors: online.reduce((s, n) => s + n.stats.errors, 0),
    };
  }

  start(nodes) {
    if (this.timer) return;
    logger.info({ interval: POLL_INTERVAL }, '轮询器已启动');
    this.pollAll(nodes);
    this.timer = setInterval(() => this.pollAll(nodes), POLL_INTERVAL);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export const poller = new NodePoller();
