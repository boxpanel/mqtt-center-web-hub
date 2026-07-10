const API = '/api';

export async function fetchNodes() {
  const res = await fetch(`${API}/nodes`);
  if (!res.ok) throw new Error('获取节点列表失败');
  return res.json();
}

export async function addNode(data) {
  const res = await fetch(`${API}/nodes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || '添加失败');
  return json;
}

export async function deleteNode(id) {
  const res = await fetch(`${API}/nodes/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('删除失败');
  return res.json();
}

export async function updateNode(id, data) {
  const res = await fetch(`${API}/nodes/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || '修改失败');
  return json;
}

export async function fetchSummary() {
  const res = await fetch(`${API}/dashboard/summary`);
  if (!res.ok) throw new Error('获取汇总数据失败');
  return res.json();
}

export async function fetchNodeStates() {
  const res = await fetch(`${API}/dashboard/nodes`);
  if (!res.ok) throw new Error('获取节点状态失败');
  return res.json();
}

export function subscribeEvents(onEvent) {
  const es = new EventSource(`${API}/dashboard/events`);
  es.onmessage = (e) => {
    try { onEvent(JSON.parse(e.data)); } catch {}
  };
  return () => es.close();
}

export async function searchNodes() {
  const res = await fetch(`${API}/discovery/search`, { method: 'POST' });
  if (!res.ok) throw new Error('搜索失败');
  return res.json();
}
