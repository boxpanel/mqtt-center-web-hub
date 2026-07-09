import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const NODES_FILE = path.join(DATA_DIR, 'nodes.json');

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(NODES_FILE)) {
    fs.writeFileSync(NODES_FILE, JSON.stringify({ nodes: [] }, null, 2));
  }
}

export function loadNodes() {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(NODES_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.nodes) ? parsed.nodes : [];
  } catch (err) {
    logger.error({ err }, '读取节点数据失败');
    return [];
  }
}

export function saveNodes(nodes) {
  ensureDataFile();
  const tmp = NODES_FILE + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify({ nodes }, null, 2));
    fs.renameSync(tmp, NODES_FILE);
  } catch (err) {
    logger.error({ err }, '保存节点数据失败');
    throw err;
  }
}
