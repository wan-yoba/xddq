import winston from "winston";
import WebSocket from "ws";
import Transport from "winston-transport";

const loglevel = process.env.LOGLEVEL || "info";

const customLevels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const customColors = {
  error: "red",
  warn: "yellow",
  info: "green",
  debug: "cyan",
};

// 自定义 WebSocket 传输，用于将日志通过 WebSocket 推送出去
class WebSocketTransport extends Transport {
  constructor(opts) {
    super(opts);
    // 传入一个函数，用于获取最新的 WebSocket 客户端实例
    this.getWsClient = opts.getWsClient;
  }

  log(info, callback) {
    setImmediate(() => {
      this.emit("logged", info);
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

winston.addColors(customColors);

function createLogFormat() {
  const colorizer = winston.format.colorize();
  const timestamp = winston.format.timestamp({
    format: "YYYY-MM-DD HH:mm:ss.SSS",
  });
  const logFormat = winston.format.printf((info) => {
    const levelWithoutColor = info.level.replace(
      /\x1B[[(?);]{0,2}(;?\d)*./g,
      ""
    );
    const space = " ".repeat(6 - levelWithoutColor.length);
    return `${info.timestamp} ${info.level}${space} ${info.message}`;
  });

  return winston.format.combine(colorizer, timestamp, logFormat);
}

// Create a single logger instance
const logger = winston.createLogger({
  level: loglevel,
  levels: customLevels,
  format: createLogFormat(),
  transports: [
    new winston.transports.Console({}),
    new WebSocketTransport({
      // 每次发送日志时都会调用这个函数，获取最新的 wsClient
      getWsClient: () => currentWsClient,
    }),
  ],
  exitOnError: false,
});

export default logger;
