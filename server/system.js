/**
 * Hub 自身系统资源监控
 */
import os from 'os';
import fs from 'fs';

let cpuTimesPrev = null;

function getCpuTimes() {
  const cpus = os.cpus();
  let total = 0, idle = 0;
  for (const cpu of cpus) {
    total += Object.values(cpu.times).reduce((s, v) => s + v, 0);
    idle += cpu.times.idle;
  }
  return { total, idle };
}

function getCpuUsage() {
  const prev = cpuTimesPrev || getCpuTimes();
  const curr = getCpuTimes();
  cpuTimesPrev = curr;
  const totalDiff = curr.total - prev.total;
  const idleDiff = curr.idle - prev.idle;
  return totalDiff > 0 ? Math.round((1 - idleDiff / totalDiff) * 1000) / 10 : 0;
}

export function getSystemMetrics() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();

  let diskTotal = 0, diskFree = 0;
  try {
    // Linux: 尝试读取根分区信息
    if (process.platform === 'linux') {
      const stat = fs.statfsSync('/');
      diskTotal = (stat.blocks || stat.bsize * stat.blocks) * (stat.bsize || 4096);
      diskFree = (stat.bfree || stat.bsize * stat.bfree) * (stat.bsize || 4096);
    }
  } catch {}

  // Windows fallback
  if (!diskTotal && process.platform === 'win32') {
    try {
      const drives = fs.readdirSync('/');
      // 使用第一个可用驱动器
      for (const d of ['C:', 'D:', 'E:']) {
        try {
          const stat = fs.statfsSync(`${d}\\`);
          diskTotal = stat.blocks * stat.bsize;
          diskFree = stat.bfree * stat.bsize;
          break;
        } catch {}
      }
    } catch {}
  }

  // 兜底
  if (!diskTotal) {
    diskTotal = totalMem * 10;
    diskFree = totalMem * 5;
  }

  return {
    cpu: {
      percent: getCpuUsage(),
      cores: os.cpus().length,
    },
    memory: {
      total: totalMem,
      used: totalMem - freeMem,
      percent: Math.round((1 - freeMem / totalMem) * 1000) / 10,
    },
    disk: {
      total: diskTotal,
      used: diskTotal - diskFree,
      percent: Math.round((1 - diskFree / diskTotal) * 1000) / 10,
    },
  };
}
