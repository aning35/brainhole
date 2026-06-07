#!/usr/bin/env node

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 启动智能数据分析画布开发环境...\n');

// 检查 Node.js 版本
function checkNodeVersion() {
  const version = process.version;
  const majorVersion = parseInt(version.slice(1).split('.')[0]);
  
  if (majorVersion < 18) {
    console.error('❌ Node.js 版本需要 >= 18，当前版本:', version);
    process.exit(1);
  }
  
  console.log('✅ Node.js 版本检查通过:', version);
}

// 检查依赖是否已安装
function checkDependencies() {
  if (!fs.existsSync(path.join(process.cwd(), 'node_modules'))) {
    console.log('📦 正在安装依赖...');
    try {
      execSync('npm install', { stdio: 'inherit' });
      console.log('✅ 依赖安装完成');
    } catch (error) {
      console.error('❌ 依赖安装失败:', error.message);
      process.exit(1);
    }
  } else {
    console.log('✅ 依赖检查通过');
  }
}

// 启动开发服务器
function startDevServer() {
  console.log('🔧 启动开发服务器...\n');
  
  const child = spawn('npm', ['run', 'dev'], {
    stdio: 'inherit',
    shell: true
  });
  
  child.on('exit', (code) => {
    if (code !== 0) {
      console.error(`❌ 开发服务器退出，代码: ${code}`);
    }
  });
  
  // 处理进程信号
  process.on('SIGINT', () => {
    console.log('\n🛑 正在关闭开发服务器...');
    child.kill('SIGINT');
  });
  
  process.on('SIGTERM', () => {
    child.kill('SIGTERM');
  });
}

// 主执行流程
async function main() {
  try {
    checkNodeVersion();
    checkDependencies();
    startDevServer();
  } catch (error) {
    console.error('❌ 启动失败:', error.message);
    process.exit(1);
  }
}

main(); 