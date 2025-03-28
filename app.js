import logger from "#utils/logger.js";
import initialize from "#loaders/index.js";

async function start() {
  try {
    // 设置全局变量
    global.userConfigs = new Map(); // 用于存储最多10个用户的配置
    global.maxUserConfigs = 1; // 最大用户配置数量
    global.account = {};
    global.configFile = "./account.json";
    global.colors = {
      reset: "\x1b[0m", // 重置颜色
      black: "\x1b[30m", // 黑色
      red: "\x1b[31m", // 红色
      green: "\x1b[32m", // 绿色
      yellow: "\x1b[33m", // 黄色
      blue: "\x1b[34m", // 蓝色
      magenta: "\x1b[35m", // 品红（洋红）
      cyan: "\x1b[36m", // 青色
      white: "\x1b[37m", // 白色
    };
    global.messageDelay = 20; // 默认延迟

    await initialize();
  } catch (err) {
    logger.error("启动服务失败:", err);
    process.exit(1);
  }
}

start();
