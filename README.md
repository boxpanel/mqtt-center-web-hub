<p align="center">
  <img src="https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=MQTT%20Center%20Hub%20logo%20with%20network%20nodes%20connected%20to%20a%20central%20hub%2C%20modern%20and%20clean%20tech%20style&image_size=square_hd" width="120" />
</p>

<h1 align="center">MQTT Center Web Hub</h1>

<p align="center">
  <strong>集中管理所有 MQTT Center 节点的总监控平台</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react" />
  <img src="https://img.shields.io/badge/Vite-6-646CFF?logo=vite" />
  <img src="https://img.shields.io/badge/license-MIT-blue" />
</p>

---

## 概述

MQTT Center Web Hub 是一个集中式监控平台，用于统一管理和监控所有 MQTT Center 节点。它提供直观的 Web 仪表盘，实时展示各节点的运行状态、客户端连接数、系统资源等信息。

### 功能特性

- **📊 全局仪表盘** — CPU、内存、存储、客户端统计，一页概览
- **📋 节点列表** — 表格展示所有节点，支持排序和实时状态更新
- **🔍 局域网发现** — UDP 广播自动扫描局域网内的节点
- **💓 心跳上报** — 已注册节点每 60 秒主动上报状态
- **🔄 实时更新** — SSE 推送，页面自动刷新节点状态
- **✏️ 节点管理** — 添加、修改名称、删除节点
- **🔗 快捷跳转** — 双击在线节点 IP 直接进入节点管理页

## 快速开始

### 一键安装（Linux）

```bash
curl -sSL https://raw.githubusercontent.com/boxpanel/mqtt-center-web-hub/master/install.sh | bash
```

安装过程自动完成：环境检测 → 安装 Node.js → 安装 PM2 → 下载项目 → 安装依赖 → 构建前端 → 启动服务。

### 手动部署

```bash
# 1. 克隆仓库
git clone https://github.com/boxpanel/mqtt-center-web-hub.git
cd mqtt-center-web-hub

# 2. 安装依赖
npm install
cd client && npm install && cd ..

# 3. 构建前端
npm run build

# 4. 启动服务
npm start
```

访问 `http://localhost:8080` 即可打开管理界面。

### 开发模式

```bash
npm run dev
```

同时启动后端 API（8080）和 Vite 开发服务器（5173），支持热更新。

## 架构

```
┌─────────────────────────────────────────────────┐
│                 MQTT Center Hub                  │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │  Express  │  │  Poller  │  │  UDP Discovery │  │
│  │  API 服务  │  │  轮询器   │  │   发现服务     │  │
│  └────┬─────┘  └────┬─────┘  └───────┬───────┘  │
│       │              │               │           │
│  ┌────┴──────────────┴───────────────┴───────┐   │
│  │           React + Vite 前端                │   │
│  └────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
           │                    ▲
           │ HTTP poll          │ UDP heartbeat
           ▼                    │
┌──────────────────┐   ┌──────────────────┐
│  MQTT Center      │   │  MQTT Center      │
│  Node 1           │   │  Node 2           │
│  :8088            │   │  :8088            │
└──────────────────┘   └──────────────────┘
```

### 组件说明

| 组件 | 技术 | 说明 |
|------|------|------|
| API 服务 | Express | RESTful API，节点 CRUD、仪表盘数据 |
| 轮询器 | Node.js | 定时拉取各节点的客户端和系统数据 |
| 发现服务 | UDP | 局域网广播发现节点 |
| 心跳接收 | HTTP | 接收已注册节点的心跳上报 |
| 前端 | React 18 + Vite 6 | 响应式仪表盘，SSE 实时更新 |

## API 文档

### 节点管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/nodes` | 获取所有节点 |
| POST | `/api/nodes` | 添加节点（自动发送 UDP 注册通知） |
| PUT | `/api/nodes/:id` | 修改节点名称 |
| DELETE | `/api/nodes/:id` | 删除节点 |

### 仪表盘

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/dashboard/summary` | 获取聚合统计数据 |
| GET | `/api/dashboard/nodes` | 获取所有节点详细状态 |
| GET | `/api/dashboard/events` | SSE 实时事件推送 |

### 发现与心跳

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/discovery/search` | 触发 UDP 局域网扫描 |
| POST | `/api/heartbeat` | 节点心跳上报接口 |

## 客户端心跳

被 Hub 添加的节点会自动收到 UDP 注册通知，随后每 **60 秒**向 Hub 上报：

```json
{
  "host": "192.168.1.100",
  "port": 8088,
  "stats": {
    "total": 10,
    "connected": 5,
    "disabled": 2
  },
  "system": { ... },
  "clients": [ ... ]
}
```

未注册的节点只响应发现广播，不会发送心跳。

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `8080` | Hub 服务端口 |

## 许可证

[MIT](LICENSE)
