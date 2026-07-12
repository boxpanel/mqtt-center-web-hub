import { useState, useEffect, useCallback } from 'react';
import {
  fetchNodes, deleteNode, updateNode, addNode, searchNodes, fetchHubSystem,
  fetchSummary, fetchNodeStates, subscribeEvents,
} from './api';
import './App.css';

function getBarColor(percent) {
  if (percent >= 90) return 'var(--danger)';
  if (percent >= 70) return 'var(--warning)';
  return 'var(--primary)';
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / 1024 ** i;
  return `${val >= 100 ? Math.round(val) : val.toFixed(1)} ${units[i]}`;
}

function MetricCard({ label, percent, detail }) {
  return (
    <div className="metric-card">
      <div className="metric-header">
        <span className="metric-label">{label}</span>
        <span className="metric-percent" style={{ color: getBarColor(percent) }}>{percent}%</span>
      </div>
      <div className="metric-bar">
        <div className="metric-bar-fill" style={{ width: `${Math.min(percent, 100)}%`, background: getBarColor(percent) }} />
      </div>
      <div className="metric-detail">{detail}</div>
    </div>
  );
}

function ClientStatCard({ total, connected, errors }) {
  return (
    <div className="metric-card client-stat-card">
      <div className="stat-rows">
        <div className="stat-row">
          <span className="stat-label total">客户端总数</span>
          <span className="stat-value blue">{total}</span>
        </div>
        <div className="stat-row">
          <span className="stat-label connected">已连接</span>
          <span className="stat-value green">{connected}</span>
        </div>
        <div className="stat-row">
          <span className="stat-label errors">异常</span>
          <span className="stat-value red">{errors}</span>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [nodes, setNodes] = useState([]);
  const [nodeStates, setNodeStates] = useState([]);
  const [summary, setSummary] = useState({ totalClients: 0, totalConnected: 0, totalErrors: 0 });
  const [toast, setToast] = useState(null);
  const [editingNode, setEditingNode] = useState(null);
  const [editName, setEditName] = useState('');
  const [showingAdd, setShowingAdd] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', host: '', port: '80' });
  const [discoveredNodes, setDiscoveredNodes] = useState([]);
  const [selectedDiscovered, setSelectedDiscovered] = useState(new Set());
  const [searching, setSearching] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [hubSystem, setHubSystem] = useState(null);

  const showToast = (msg, isError = false) => {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), 3000);
  };

  const loadNodes = useCallback(async () => {
    try { const data = await fetchNodes(); setNodes(data); }
    catch (err) { showToast(err.message, true); }
  }, []);

  useEffect(() => {
    loadNodes();
    fetchSummary().then(setSummary).catch(() => {});
    fetchNodeStates().then(setNodeStates).catch(() => {});
    fetchHubSystem().then(setHubSystem).catch(() => {});
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

  // ── 定时刷新 Hub 自身系统资源 ──
  useEffect(() => {
    const t = setInterval(() => fetchHubSystem().then(setHubSystem).catch(() => {}), 10000);
    return () => clearInterval(t);
  }, []);

  // ── Hub 自身系统指标 ──
  const sys = hubSystem || { cpu: { percent: 0, cores: 0 }, memory: { total: 0, used: 0, percent: 0 }, disk: { total: 0, used: 0, percent: 0 } };

  const handleDeleteNode = async (id) => {
    setDeleteConfirm(id);
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await deleteNode(deleteConfirm);
      showToast('节点已删除');
      setDeleteConfirm(null);
      loadNodes();
    } catch (err) { showToast(err.message, true); }
  };

  const handleEditNode = (node) => {
    setEditingNode(node);
    setEditName(node.name);
  };

  const saveEditNode = async () => {
    if (!editName.trim() || editName.trim() === editingNode.name) {
      setEditingNode(null);
      return;
    }
    try {
      await updateNode(editingNode.id, { name: editName.trim() });
      showToast('节点名称已修改');
      setEditingNode(null);
      loadNodes();
    } catch (err) { showToast(err.message, true); }
  };

  const handleAddNode = async () => {
    const checked = [...selectedDiscovered].map((i) => discoveredNodes[i]).filter(Boolean);
    if (checked.length > 0) {
      // 添加勾选的搜索结果
      let added = 0;
      for (const group of checked) {
        try {
          if (group.items.length > 1) {
            // 多IP分组：一次添加所有IP
            await addNode({
              name: group.name,
              hosts: group.items.map((item) => ({ host: item.ip, port: String(item.port), label: item.label })),
            });
          } else {
            // 单IP：保持原有格式
            await addNode({
              name: group.name,
              host: group.items[0].ip,
              port: String(group.items[0].port),
            });
          }
          added++;
        } catch { /* 跳过失败 */ }
      }
      showToast(`成功添加 ${added} 个节点`);
      setShowingAdd(false);
      setDiscoveredNodes([]);
      setSelectedDiscovered(new Set());
      loadNodes();
    } else if (addForm.name.trim() && addForm.host.trim()) {
      // 手动添加
      try {
        await addNode(addForm);
        showToast('节点已添加');
        setAddForm({ name: '', host: '', port: '80' });
        loadNodes();
      } catch (err) { showToast(err.message, true); }
    }
  };

  const handleSearchNodes = async () => {
    setSearching(true);
    setDiscoveredNodes([]);
    setSelectedDiscovered(new Set());
    try {
      const nodes = await searchNodes();
      setDiscoveredNodes(nodes);
      // 不默认勾选
    } catch (err) {
      showToast(err.message, true);
    } finally {
      setSearching(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedDiscovered.size === discoveredNodes.length) {
      setSelectedDiscovered(new Set());
    } else {
      setSelectedDiscovered(new Set(discoveredNodes.map((_, i) => i)));
    }
  };

  const toggleDiscovered = (idx) => {
    setSelectedDiscovered((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <div className="app">
      <header className="header">
        <div className="page-container">
          <h1>MQTT Center Hub</h1>
          <p className="subtitle">总监控平台 · 集中管理所有 MQTT Center 节点</p>

          <div className="stats-grid">
              <MetricCard label="CPU" percent={sys.cpu.percent} detail={`${sys.cpu.cores} 核 · ${sys.cpu.percent}%`} />
              <MetricCard label="内存" percent={sys.memory.percent} detail={`${formatBytes(sys.memory.used)} / ${formatBytes(sys.memory.total)}`} />
              <MetricCard label="存储" percent={sys.disk.percent} detail={`${formatBytes(sys.disk.used)} / ${formatBytes(sys.disk.total)}`} />
            <ClientStatCard total={summary.totalClients} connected={summary.totalConnected} errors={summary.totalErrors} />
          </div>
        </div>
      </header>

      <div className="page-container" style={{ marginTop: 16, marginBottom: 4 }}>
        <button className="btn btn-primary" onClick={() => setShowingAdd(true)}>+ 节点</button>
      </div>

      <main className="main">
        <div className="page-container">
          <div className="main-row">
            {/* 左侧：节点列表 */}
            <div className="main-sidebar" style={{ width: '100%' }}>
              <div className="panel">
                <div className="panel-header">节点列表</div>
                <div className="panel-body" style={{ padding: 0 }}>
                  {nodes.length === 0 ? (
                    <div className="empty-state"><div className="empty-state-icon">📡</div><p>暂无节点</p></div>
                  ) : (
                    <div className="client-table-wrap">
                      <table className="client-table">
                        <thead>
                          <tr>
                            <th style={{ width: 50, textAlign: 'center' }}>数量</th>
                            <th style={{ textAlign: 'center' }}>节点名称</th>
                            <th style={{ textAlign: 'center' }}>IP 地址</th>
                            <th style={{ textAlign: 'center' }}>连接状态</th>
                            <th style={{ textAlign: 'center' }}>节点在线数</th>
                            <th style={{ textAlign: 'center' }}>禁用数量</th>
                            <th style={{ textAlign: 'center' }}>节点总数</th>
                            <th style={{ textAlign: 'center' }}>未转发</th>
                            <th style={{ textAlign: 'center' }}>版本</th>
                            <th style={{ width: 50, textAlign: 'center' }}>操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {nodes.map((node, i) => {
                            const state = nodeStates.find((s) => s.nodeId === node.id);
                            const isOnline = state?.status === 'online';
                            // 多IP节点：每个host独立一行，按虚→主→备排序
                            const hostRows = (state?.hostStates || (node.hosts ? node.hosts.map((h) => ({ ...h, status: isOnline ? 'online' : 'offline', stats: { total: 0, connected: 0, disabled: 0, notForwarded: 0 } })) : null))
                              ?.slice().sort((a, b) => {
                                const order = { '虚': 0, '主': 1, '备': 2 };
                                return (order[a.label] ?? 99) - (order[b.label] ?? 99);
                              });
                            if (hostRows && hostRows.length > 1) {
                              const span = hostRows.length;
                              // 分组显示
                              return hostRows.map((hs, j) => (
                                <tr key={`${node.id}-${j}`} style={{ background: j % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)' }}>
                                  {j === 0 ? <td rowSpan={span} style={{ textAlign: 'center', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--primary)' }}>{i + 1}</td> : null}
                                  {j === 0 ? <td rowSpan={span} style={{ fontWeight: 600, textAlign: 'center', verticalAlign: 'middle' }}>{node.name}</td> : null}
                                  <td style={{ textAlign: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                                      {hs.label ? <span style={{ fontSize: 10, color: '#fff', background: hs.label === '虚' ? 'var(--warning)' : 'var(--primary)', borderRadius: 4, padding: '0 5px', lineHeight: '16px', fontWeight: 600 }}>{hs.label}</span> : null}
                                      <code style={{ cursor: 'pointer' }} onDoubleClick={() => {
                                        if (hs.isVirtual && state?.hostStates) {
                                           // VIP双击：优先跳转主服务器，否则跳转备用服务器
                                           const master = state.hostStates.find((h) => !h.isVirtual && h.status === 'online' && (h.role === 'master' || h.label === '主'));
                                           const active = master || state.hostStates.find((h) => !h.isVirtual && h.status === 'online');
                                           if (active) window.open(`http://${active.host}:${active.port}`, '_blank');
                                        } else {
                                          window.open(`http://${hs.host}:${hs.port}`, '_blank');
                                        }
                                      }}>{hs.host}</code>
                                      {hs.isVirtual ? null : <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>:{hs.port}</span>}
                                    </div>
                                  </td>
                                  <td style={{ textAlign: 'center' }}>{hs.isVirtual ? '' : <><span className={`node-dot ${hs.status === 'online' ? 'online' : 'offline'}`} style={{ display: 'inline-block', marginRight: 6, verticalAlign: 'middle' }} />{hs.status === 'online' ? '在线' : '离线'}</>}</td>
                                  <td style={{ textAlign: 'center', fontFamily: 'var(--mono)', color: 'var(--success)' }}>{hs.isVirtual ? '' : (hs.stats?.connected || 0)}</td>
                                  <td style={{ textAlign: 'center', fontFamily: 'var(--mono)', color: 'var(--danger)' }}>{hs.isVirtual ? '' : (hs.stats?.disabled || 0)}</td>
                                  <td style={{ textAlign: 'center', fontFamily: 'var(--mono)' }}>{hs.isVirtual ? '' : (hs.stats?.total || 0)}</td>
                                  <td style={{ textAlign: 'center', fontFamily: 'var(--mono)', color: 'var(--warning)' }}>{hs.isVirtual ? '' : (hs.stats?.notForwarded || 0)}</td>
                                  <td style={{ textAlign: 'center', fontFamily: 'var(--mono)', color: 'var(--text-muted)' }}>{hs.isVirtual ? '' : (j === 0 ? (state?.version || '-') : '')}</td>
                                  {j === 0 ? <td rowSpan={span} style={{ whiteSpace: 'nowrap', textAlign: 'center', verticalAlign: 'middle' }}>
                                    <button className="btn btn-sm btn-primary" style={{ marginRight: 4 }} onClick={() => handleEditNode(node)}>修改</button>
                                    <button className="btn btn-sm btn-danger" onClick={() => handleDeleteNode(node.id)}>删除</button>
                                  </td> : null}
                                </tr>
                              ));
                            }
                            // 单IP显示
                            return (
                              <tr key={node.id}>
                                <td style={{ textAlign: 'center', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--primary)' }}>{i + 1}</td>
                                <td style={{ fontWeight: 600, textAlign: 'center' }}>{node.name}</td>
                                <td style={{ textAlign: 'center' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                                    <code style={{ cursor: isOnline ? 'pointer' : 'default' }} onDoubleClick={() => { if (isOnline) window.open(`http://${node.host}:${node.port}`, '_blank'); }}>{node.host}</code>
                                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>:{node.port}</span>
                                  </div>
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  <span className={`node-dot ${isOnline ? 'online' : 'offline'}`} style={{ display: 'inline-block', marginRight: 6, verticalAlign: 'middle' }} />
                                  {isOnline ? '在线' : '离线'}
                                </td>
                                <td style={{ textAlign: 'center', fontFamily: 'var(--mono)', color: 'var(--success)' }}>{state?.stats?.connected || 0}</td>
                                <td style={{ textAlign: 'center', fontFamily: 'var(--mono)', color: 'var(--danger)' }}>{state?.stats?.disabled || 0}</td>
                                <td style={{ textAlign: 'center', fontFamily: 'var(--mono)' }}>{state?.stats?.total || 0}</td>
                                <td style={{ textAlign: 'center', fontFamily: 'var(--mono)', color: 'var(--warning)' }}>{state?.stats?.notForwarded || 0}</td>
                                <td style={{ textAlign: 'center', fontFamily: 'var(--mono)', color: 'var(--text-muted)' }}>{state?.version || '-'}</td>
                                <td style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>
                                  <button className="btn btn-sm btn-primary" style={{ marginRight: 4 }} onClick={() => handleEditNode(node)}>修改</button>
                                  <button className="btn btn-sm btn-danger" onClick={() => handleDeleteNode(node.id)}>删除</button>
                                </td>
                              </tr>
                            );
                          })}
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

      {showingAdd && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 2000,
        }} onClick={() => setShowingAdd(false)}>
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 10, padding: 24, width: 520, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>添加节点</div>

            {/* 手动添加区域 */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              <input className="form-input" placeholder="名称" value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} style={{ flex: 1 }} />
              <input className="form-input" placeholder="IP 地址" value={addForm.host} onChange={(e) => setAddForm({ ...addForm, host: e.target.value })} style={{ flex: 1 }} />
              <input className="form-input" placeholder="端口" value={addForm.port} onChange={(e) => setAddForm({ ...addForm, port: e.target.value })} style={{ width: 80 }} />
            </div>

            {/* 操作按钮 */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <button className="btn btn-sm" style={{ background: 'var(--primary)', color: '#fff' }} onClick={handleSearchNodes} disabled={searching}>
                {searching ? '搜索中...' : '搜索'}
              </button>
              <button className="btn btn-sm btn-primary" onClick={handleAddNode}>添加</button>
              {discoveredNodes.length > 0 && (
                <button className="btn btn-sm" style={{ background: 'var(--bg)', color: 'var(--text)' }} onClick={toggleSelectAll}>
                {selectedDiscovered.size === discoveredNodes.length && discoveredNodes.length > 0 ? '取消全选' : '全选'}
              </button>
              )}
              <button className="btn btn-sm" style={{ background: 'var(--bg)', color: 'var(--text)' }} onClick={() => { setShowingAdd(false); setDiscoveredNodes([]); setSelectedDiscovered(new Set()); }}>关闭</button>
            </div>

            {/* 搜索结果 */}
            {discoveredNodes.length > 0 && (
              <div style={{ flex: 1, overflowY: 'auto', marginBottom: 10 }}>
                <table className="client-table" style={{ fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 30, textAlign: 'center' }}>
                        <input type="checkbox" checked={selectedDiscovered.size === discoveredNodes.length} onChange={() => {
                          if (selectedDiscovered.size === discoveredNodes.length) setSelectedDiscovered(new Set());
                          else setSelectedDiscovered(new Set(discoveredNodes.map((_, i) => i)));
                        }} />
                      </th>
                      <th style={{ textAlign: 'center' }}>名称</th>
                      <th style={{ textAlign: 'center' }}>IP 地址</th>
                      <th style={{ textAlign: 'center' }}>在线</th>
                      <th style={{ textAlign: 'center' }}>禁用</th>
                      <th style={{ textAlign: 'center' }}>总数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {discoveredNodes.map((node, i) => (
                      <tr key={i} style={{ cursor: 'pointer' }} onClick={() => toggleDiscovered(i)}>
                        <td style={{ textAlign: 'center' }}><input type="checkbox" checked={selectedDiscovered.has(i)} readOnly /></td>
                        <td style={{ textAlign: 'center' }}>{node.name}</td>
                        <td style={{ textAlign: 'center' }}>{node.items.map((item, j) => (
                                      <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                                        {item.label ? <span style={{ fontSize: 10, color: '#fff', background: item.label === '虚' ? 'var(--warning)' : 'var(--primary)', borderRadius: 4, padding: '0 5px', lineHeight: '16px', fontWeight: 600 }}>{item.label}</span> : null}
                                        <code>{item.ip}</code>
                                        {item.label === '虚' ? null : <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>:{item.port}</span>}
                                      </div>
                                    ))}</td>
                          <td style={{ textAlign: 'center', fontFamily: 'var(--mono)', color: 'var(--success)' }}>{node.stats?.connected ?? 0}</td>
                        <td style={{ textAlign: 'center', fontFamily: 'var(--mono)', color: 'var(--danger)' }}>{node.stats?.disabled ?? 0}</td>
                        <td style={{ textAlign: 'center', fontFamily: 'var(--mono)' }}>{node.stats?.total ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!searching && discoveredNodes.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: '10px 0' }}>
                点击「搜索」按钮扫描局域网内的节点
              </div>
            )}
          </div>
        </div>
      )}

      {editingNode && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 2000,
        }} onClick={() => setEditingNode(null)}>
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 10, padding: 24, width: 360,
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>修改节点名称</div>
            <input
              className="form-input"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              autoFocus
              style={{ width: '100%', marginBottom: 14 }}
              onKeyDown={(e) => { if (e.key === 'Enter') saveEditNode(); }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-sm" style={{ background: 'var(--bg)', color: 'var(--text)' }} onClick={() => setEditingNode(null)}>取消</button>
              <button className="btn btn-sm btn-primary" onClick={saveEditNode}>保存</button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 2000,
        }} onClick={() => setDeleteConfirm(null)}>
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 10, padding: 24, width: 360,
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>确定删除该节点？</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-sm btn-danger" onClick={confirmDelete}>删除</button>
              <button className="btn btn-sm" style={{ background: 'var(--bg)', color: 'var(--text)' }} onClick={() => setDeleteConfirm(null)}>取消</button>
            </div>
          </div>
        </div>
      )}

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
