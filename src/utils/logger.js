import winston from 'winston';
import Transport from 'winston-transport';
import fs from 'fs';
import path from 'path';
import createPath from '#utils/path.js';
import WebSocket from 'ws';

const resolvePath = createPath(import.meta.url);
const logDir = resolvePath('../../logs');
const loglevel = 'info';

if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

const customLevels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const customColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  debug: 'cyan',
};

winston.addColors(customColors);

function createLogFormat(colorize = false) {
  const colorizer = winston.format.colorize();
  const timestamp = winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' });
  const logFormat = winston.format.printf((info) => {
    const levelWithoutColor = info.level.replace(/\x1B[[(?);]{0,2}(;?\d)*./g, '');
    const space = ' '.repeat(6 - levelWithoutColor.length);
    return `${info.timestamp} ${info.level}${space} ${info.message}`;
  });

  return colorize
    ? winston.format.combine(colorizer, timestamp, logFormat)
    : winston.format.combine(timestamp, logFormat);
}

// 自定义 WebSocket 传输，用于将日志通过 WebSocket 推送出去
class WebSocketTransport extends Transport {
  constructor(opts) {
    super(opts);
    // 传入一个函数，用于获取最新的 WebSocket 客户端实例
    this.getWsClient = opts.getWsClient;
  }

  log(info, callback) {
    setImmediate(() => {
      this.emit('logged', info);
    });
    const wsClient = this.getWsClient();
    if (wsClient && wsClient.readyState === WebSocket.OPEN) {
      // 将整个 info 对象发送出去（你也可以根据需求调整发送内容）
      wsClient.send(`${JSON.stringify(info)}`);
    }
    callback();
  }
}

// 保存当前的 WebSocket 客户端
let currentWsClient = null;

/**
 * 设置 WebSocket 客户端。调用此函数更新当前的 wsClient。
 * @param {WebSocket} wsClient
 */
export function setWebSocket(wsClient) {
  currentWsClient = wsClient;
}

// 构造日志文件名
const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '_');
const logFileName = path.join(logDir, `${datePart}.log`);

// 创建 Winston logger，同时添加控制台、文件、和 WebSocket 传输
const logger = winston.createLogger({
  level: loglevel,
  levels: customLevels,
  format: createLogFormat(),
  transports: [
    new winston.transports.Console({
      format: createLogFormat(true),
    }),
    new winston.transports.Stream({
      stream: fs.createWriteStream(logFileName, { flags: 'a' }),
    }),
    new WebSocketTransport({
      // 每次发送日志时都会调用这个函数，获取最新的 wsClient
      getWsClient: () => currentWsClient,
    }),
  ],
  exitOnError: false,
});

export default logger;
