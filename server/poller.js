/**
 * 节点轮询器：定时拉取所有节点的状态数据
 */
import logger from './logger.js';

const POLL_INTERVAL = 10000;

class NodePoller {
  constructor() {
    this.timer = null;
    this.nodeStates = new Map();
    this.listeners = new Set();
  }

  onEvent(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _emit(data) {
    this.listeners.forEach((fn) => { try { fn(data); } catch {} });
  }

  async pollHost(host, port) {
    const start = Date.now();
    const [clientsRes, systemRes] = await Promise.all([
      fetch(`http://${host}:${port}/api/clients`),
      fetch(`http://${host}:${port}/api/system`),
    ]);
    if (!clientsRes.ok) throw new Error(`HTTP ${clientsRes.status}`);
    if (!systemRes.ok) throw new Error(`HTTP ${systemRes.status}`);
    const clients = await clientsRes.json();
    const system = await systemRes.json();
    const stats = {
      total: clients.length,
      connected: clients.filter((c) => c.runtime?.status === 'connected').length,
      disabled: clients.filter((c) => !c.enabled).length,
      errors: clients.filter((c) => !c.enabled || (c.runtime?.stats?.errors || 0) > 0).length,
      notForwarded: clients.reduce((s, c) => s + (c.runtime?.stats?.notForwarded || 0), 0),
    };
    return { clients, system, stats, latency: Date.now() - start };
  }

  async pollNode(node) {
    try {
      // 多IP节点：轮询所有真实host（跳过VIP）
      if (node.hosts && node.hosts.length > 0) {
        const realHosts = node.hosts.filter((h) => h.label !== '虚');
        const vipHost = node.hosts.find((h) => h.label === '虚');
        if (realHosts.length > 0) {
          const results = await Promise.allSettled(
            realHosts.map((h) => this.pollHost(h.host, h.port)),
          );
          const hostStates = realHosts.map((h, i) => {
            const r = results[i];
            return r.status === 'fulfilled'
              ? { host: h.host, port: h.port, label: h.label || null, status: 'online', ...r.value, lastSeen: new Date().toISOString() }
              : { host: h.host, port: h.port, label: h.label || null, status: 'offline', clients: [], system: null, stats: { total: 0, connected: 0, disabled: 0, errors: 0, notForwarded: 0 }, lastError: r.reason?.message, lastSeen: null, latency: 0 };
          });
          // 如果VIP存在，将其状态标记为引用主服务器的状态（显示在最上方）
          if (vipHost) {
            const mainHost = hostStates.find((hs) => hs.label === '主') || hostStates[0];
            hostStates.unshift({
              host: vipHost.host,
              port: vipHost.port,
              label: '虚',
              status: mainHost?.status === 'online' ? 'online' : 'offline',
              stats: mainHost?.stats || { total: 0, connected: 0, disabled: 0, errors: 0, notForwarded: 0 },
              lastSeen: mainHost?.lastSeen || null,
              latency: 0,
              isVirtual: true,
            });
          }
          const onlineAny = hostStates.some((hs) => hs.status === 'online');
          const onlineHosts = hostStates.filter((hs) => hs.status === 'online' && !hs.isVirtual);
          const aggStats = {
            total: onlineHosts.reduce((s, h) => s + h.stats.total, 0),
            connected: onlineHosts.reduce((s, h) => s + h.stats.connected, 0),
            disabled: onlineHosts.reduce((s, h) => s + h.stats.disabled, 0),
            errors: onlineHosts.reduce((s, h) => s + h.stats.errors, 0),
            notForwarded: onlineHosts.reduce((s, h) => s + h.stats.notForwarded, 0),
          };
          this.nodeStates.set(node.id, {
            nodeId: node.id,
            nodeName: node.name,
            nodeHost: node.host,
            nodePort: node.port,
            hosts: node.hosts,
            status: onlineAny ? 'online' : 'offline',
            hostStates,
            clients: onlineHosts[0]?.clients || [],
            system: onlineHosts[0]?.system || null,
            stats: aggStats,
            version: this.nodeStates.get(node.id)?.version || null,
            vip: this.nodeStates.get(node.id)?.vip || null,
            lastSeen: new Date().toISOString(),
            latency: onlineHosts[0]?.latency || 0,
          });
        } else {
          // 只有VIP没有真实hosts（不应该发生）
          throw new Error('无真实主机');
        }
      } else {
        // 单IP：原有逻辑
        const result = await this.pollHost(node.host, node.port);
        this.nodeStates.set(node.id, {
          nodeId: node.id,
          nodeName: node.name,
          nodeHost: node.host,
          nodePort: node.port,
          status: 'online',
          ...result,
          version: this.nodeStates.get(node.id)?.version || null,
          vip: this.nodeStates.get(node.id)?.vip || null,
          lastSeen: new Date().toISOString(),
        });
      }
    } catch (err) {
      // 错误时也保留VIP信息
      const vipHost = node.hosts?.find((h) => h.label === '虚');
      this.nodeStates.set(node.id, {
        nodeId: node.id,
        nodeName: node.name,
        nodeHost: node.host,
        nodePort: node.port,
        hosts: node.hosts,
        status: 'offline',
        hostStates: (vipHost ? [{ host: vipHost.host, port: vipHost.port, label: '虚', status: 'offline', stats: { total: 0, connected: 0, disabled: 0, errors: 0, notForwarded: 0 }, lastSeen: null, latency: 0, isVirtual: true }] : []).concat(
           node.hosts ? node.hosts.filter((h) => h.label !== '虚').map((h) => ({ host: h.host, port: h.port, label: h.label || null, status: 'offline', clients: [], system: null, stats: { total: 0, connected: 0, disabled: 0, errors: 0, notForwarded: 0 }, lastError: err.message, lastSeen: null, latency: 0 })) : []
         ),
        clients: [],
        system: null,
        stats: { total: 0, connected: 0, disabled: 0, errors: 0, notForwarded: 0 },
        version: this.nodeStates.get(node.id)?.version || null,
        vip: this.nodeStates.get(node.id)?.vip || null,
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

  handleHeartbeat(data) {
    for (const [nodeId, state] of this.nodeStates) {
      if (state.nodeHost === data.host && state.nodePort === data.port) {
        const now = new Date().toISOString();
        // 更新整个节点状态
        const update = {
          ...state,
          status: 'online',
          stats: data.stats || state.stats,
          system: data.system || state.system,
          clients: data.clients || state.clients,
          version: data.version || state.version,
          vip: data.vip || state.vip,
          lastSeen: now,
          lastHeartbeat: now,
          latency: 0,
        };
        // 如果存在hostStates，更新对应host的心跳
        if (Array.isArray(update.hostStates)) {
          const idx = update.hostStates.findIndex((hs) => hs.host === data.host && hs.port === data.port);
          if (idx >= 0) {
            update.hostStates[idx] = {
              ...update.hostStates[idx],
              status: 'online',
              stats: data.stats || update.hostStates[idx].stats,
              system: data.system || update.hostStates[idx].system,
              clients: data.clients || update.hostStates[idx].clients,
              lastSeen: now,
              lastHeartbeat: now,
              latency: 0,
            };
          }
        }
        this.nodeStates.set(nodeId, update);
        this._emit({ type: 'node:update', data: this.nodeStates.get(nodeId) });
        return true;
      }
    }
    return false;
  }

  async pollAll(nodes) {
    await Promise.allSettled(nodes.map((n) => this.pollNode(n)));
  }

  async addNode(node) {
    await this.pollNode(node);
    if (!this._nodes) this._nodes = [];
    this._nodes.push(node);
  }

  removeNode(nodeId) {
    this.nodeStates.delete(nodeId);
    if (this._nodes) {
      this._nodes = this._nodes.filter((n) => n.id !== nodeId);
    }
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
      totalClients: online.reduce((s, n) => s + (n.stats?.total || 0), 0),
      totalConnected: online.reduce((s, n) => s + (n.stats?.connected || 0), 0),
      totalDisabled: online.reduce((s, n) => s + (n.stats?.disabled || 0), 0),
      totalErrors: online.reduce((s, n) => s + (n.stats?.errors || 0), 0),
    };
  }

  start(nodes) {
    if (this.timer) return;
    this._nodes = nodes;
    logger.info({ interval: POLL_INTERVAL }, '轮询器已启动');
    const validNodes = nodes.filter((n) => n.host || (n.hosts && n.hosts.length > 0));
    for (const node of validNodes) {
      this.addNode(node);
    }
    this.timer = setInterval(() => {
      const currentNodes = this._nodes || [];
      this.pollAll(currentNodes);
    }, POLL_INTERVAL);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export const poller = new NodePoller();
