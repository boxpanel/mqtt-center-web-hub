import { useState, useEffect, useCallback } from 'react';
import {
  fetchNodes, addNode, deleteNode,
  fetchSummary, fetchNodeStates, subscribeEvents,
} from './api';
import './App.css';

function StatusDot({ status }) {
  return <span className={`status-dot`} style={{ background: status === 'connected' ? 'var(--success)' : status === 'disabled' ? 'var(--disabled)' : 'var(--text-muted)' }} />;
}

function StatCard({ label, value, colorClass }) {
  return (
    <div className="stat-card">
      <div className="stat-card-label">{label}</div>
      <div className={`stat-card-value ${colorClass}`}>{value}</div>
    </div>
  );
}

export default function App() {
  const [nodes, setNodes] = useState([]);
  const [nodeStates, setNodeStates] = useState([]);
  const [summary, setSummary] = useState({ totalNodes: 0, onlineNodes: 0, totalClients: 0, totalConnected: 0, totalDisabled: 0, totalErrors: 0 });
  const [selectedNode, setSelectedNode] = useState(null);
  const [toast, setToast] = useState(null);
  const [form, setForm] = useState({ name: '', host: '', port: '8088' });

  const showToast = (msg, isError = false) => {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), 3000);
  };

  const loadNodes = useCallback(async () => {
    try {
      const data = await fetchNodes();
      setNodes(data);
    } catch (err) { showToast(err.message, true); }
  }, []);

  useEffect(() => {
    loadNodes();
    fetchSummary().then(setSummary).catch(() => {});
    fetchNodeStates().then(setNodeStates).catch(() => {});
    const unsub = subscribeEvents((event) => {
      if (event.type === 'summary') setSummary(event.data);
      if (event.type === 'nodes') setNodeStates(event.data);
      if (event.type === 'node:update') {
        setNodeStates((prev) => {
          const next = [...prev];
          const idx = next.findIndex((s) => s.nodeId === event.data.nodeId);
          if (idx >= 0) next[idx] = event.data;
          else next.push(event.data);
          return next;
        });
      }
    });
    return unsub;
  }, [loadNodes]);

  const handleAddNode = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.host.trim()) return;
    try {
      await addNode(form);
      showToast('节点已添加');
      setForm({ name: '', host: '', port: '8088' });
      loadNodes();
    } catch (err) { showToast(err.message, true); }
  };

  const handleDeleteNode = async (id) => {
    if (!confirm('确定删除该节点？')) return;
    try {
      await deleteNode(id);
      showToast('节点已删除');
      if (selectedNode?.id === id) setSelectedNode(null);
      loadNodes();
    } catch (err) { showToast(err.message, true); }
  };

  const selectedState = selectedNode
    ? nodeStates.find((s) => s.nodeId === selectedNode.id)
    : null;

  const selectedClients = selectedState?.clients || [];

  return (
    <div className="app">
      <header className="header">
        <div className="page-container">
          <h1>MQTT Center Hub</h1>
          <p className="subtitle">总监控平台 · 集中管理所有 MQTT Center 节点</p>

          <div className="stats-grid">
            <StatCard label="节点总数" value={summary.totalNodes} colorClass="blue" />
            <StatCard label="在线节点" value={summary.onlineNodes} colorClass="green" />
            <StatCard label="离线节点" value={summary.totalNodes - summary.onlineNodes} colorClass="red" />
            <StatCard label="客户端总数" value={summary.totalClients} colorClass="blue" />
            <StatCard label="已连接" value={summary.totalConnected} colorClass="green" />
            <StatCard label="异常" value={summary.totalErrors} colorClass={summary.totalErrors > 0 ? 'red' : 'muted'} />
          </div>
        </div>
      </header>

      <main className="main">
        <div className="page-container">
          <div className="main-row">
            {/* 左侧：节点列表 */}
            <div className="main-sidebar">
              <div className="panel">
                <div className="panel-header">节点列表</div>
                <div className="panel-body">
                  {nodes.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-state-icon">📡</div>
                      <p>暂无节点</p>
                    </div>
                  ) : (
                    nodes.map((node) => {
                      const state = nodeStates.find((s) => s.nodeId === node.id);
                      const isOnline = state?.status === 'online';
                      return (
                        <div
                          key={node.id}
                          className={`node-item ${selectedNode?.id === node.id ? 'active' : ''}`}
                          onClick={() => setSelectedNode(node)}
                        >
                          <span className={`node-dot ${isOnline ? 'online' : 'offline'}`} />
                          <div className="node-info">
                            <div className="node-name">{node.name}</div>
                            <div className="node-addr">{node.host}:{node.port}</div>
                            {state && (
                              <div className="node-meta">
                                {state.stats.total} 客户端 · 延迟 {state.latency}ms
                              </div>
                            )}
                          </div>
                          <button className="node-del" onClick={(e) => { e.stopPropagation(); handleDeleteNode(node.id); }}>✕</button>
                        </div>
                      );
                    })
                  )}

                  <form className="add-node-form" onSubmit={handleAddNode}>
                    <div className="form-row">
                      <input className="form-input" placeholder="名称" value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                      <input className="form-input" placeholder="地址" value={form.host}
                        onChange={(e) => setForm({ ...form, host: e.target.value })} required />
                    </div>
                    <div className="form-row">
                      <input className="form-input" placeholder="端口" value={form.port}
                        onChange={(e) => setForm({ ...form, port: e.target.value })} style={{ width: 100 }} />
                      <button type="submit" className="btn btn-primary btn-sm" style={{ flex: 1 }}>+ 添加</button>
                    </div>
                  </form>
                </div>
              </div>
            </div>

            {/* 右侧：客户端详情 */}
            <div className="main-content">
              <div className="panel">
                <div className="panel-header">
                  <span>{selectedNode ? `${selectedNode.name} - 客户端列表` : '客户端详情'}</span>
                  {selectedState && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
                      {selectedState.nodeName} · {selectedState.latency}ms
                    </span>
                  )}
                </div>
                <div className="panel-body" style={{ padding: 0 }}>
                  {!selectedNode ? (
                    <div className="empty-state">
                      <div className="empty-state-icon">👈</div>
                      <p>请在左侧选择一个节点查看详情</p>
                    </div>
                  ) : selectedState?.status === 'offline' ? (
                    <div className="empty-state">
                      <div className="empty-state-icon">⚠️</div>
                      <p>节点离线</p>
                      {selectedState?.lastError && <p style={{ fontSize: 12, marginTop: 4 }}>{selectedState.lastError}</p>}
                    </div>
                  ) : selectedClients.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-state-icon">📭</div>
                      <p>该节点暂无客户端</p>
                    </div>
                  ) : (
                    <div className="client-table-wrap">
                      <table className="client-table">
                        <thead>
                          <tr>
                            <th>名称</th>
                            <th>地址</th>
                            <th>Client ID</th>
                            <th>状态</th>
                            <th>订阅</th>
                            <th>转发</th>
                            <th>接收</th>
                            <th>转发</th>
                            <th>错误</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedClients.map((c) => (
                            <tr key={c.id}>
                              <td style={{ fontWeight: 600 }}>{c.name}</td>
                              <td><code>{c.broker.host}:{c.broker.port}</code></td>
                              <td><code>{c.broker.clientId || '自动'}</code></td>
                              <td>
                                <span className="status-badge">
                                  <StatusDot status={c.runtime?.status} />
                                  {c.enabled ? (c.runtime?.status === 'connected' ? '已连接' : c.runtime?.status || '未知') : '已禁用'}
                                </span>
                              </td>
                              <td><code>{c.rules.map((r) => r.subscribeTopic).join(', ')}</code></td>
                              <td><code>{c.rules.map((r) => r.forwardTopic).join(', ')}</code></td>
                              <td style={{ textAlign: 'center', fontFamily: 'var(--mono)' }}>{c.runtime?.stats?.received || 0}</td>
                              <td style={{ textAlign: 'center', fontFamily: 'var(--mono)' }}>{c.runtime?.stats?.forwarded || 0}</td>
                              <td style={{ textAlign: 'center', fontFamily: 'var(--mono)', color: (c.runtime?.stats?.errors || 0) > 0 ? 'var(--danger)' : '' }}>{c.runtime?.stats?.errors || 0}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: toast.isError ? 'var(--danger)' : 'var(--success)',
          color: '#fff', padding: '10px 20px', borderRadius: 8, fontSize: 13,
          zIndex: 1000, boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
