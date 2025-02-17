import express from 'express';
import cors from 'cors';
import WebSocket, { WebSocketServer } from 'ws';
import { AsyncLocalStorage } from 'async_hooks';
import AuthService from "#services/authService.js";
import dependencyInjectorLoader from "#loaders/dependencyInjector.js";
import GameNetMgr from "#game/net/GameNetMgr.js";
import logger, { setWebSocket } from '#utils/logger.js';

// 创建异步上下文存储
const asyncLocalStorage = new AsyncLocalStorage();

const app = express();
app.use(cors());
app.use(express.json());

// 添加中间件初始化异步上下文
app.use((req, res, next) => {
  // 初始化空的上下文
  asyncLocalStorage.run(new Map(), () => next());
});

// GET /api/servers - 获取服务器列表
app.get('/api/servers', async (req, res) => {
  const { username, password } = req.query;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }
  try {
    const authServiceInstance = new AuthService();
    const serverList = await authServiceInstance.List(username, password);
    return res.json(serverList);
  } catch (error) {
    logger.error(error.message || error);
    return res.status(500).json({ error: 'Failed to fetch server list' });
  }
});

// 登录接口
app.post('/api/login', async (req, res) => {
  const { username, password, serverId } = req.body;

  try {
    const authServiceInstance = new AuthService();
    const response = await authServiceInstance.Login(username, password, serverId);
    const { wsAddress, playerId, token } = response;

    // 连接游戏服务器
    GameNetMgr.inst.connectGameServer(wsAddress, playerId, token);

    // 返回登录成功信息
    res.json({
      playerId,
      token,
      message: 'Login successful. WebSocket connection will be established.'
    });
  } catch (error) {
    logger.error('Login failed', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// 启动服务器
const startServer = async () => {
  await dependencyInjectorLoader();

  const server = app.listen(8012, () => {
    console.log("Server running on port 8012");
  });

  // 在启动服务器后创建 WebSocketServer 实例
  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (ws, request) => {

    // 发送测试消息
    ws.send("New WebSocket connection established.");

    // 链接成功，保持心跳
    setWebSocket(ws);

    // 可在这里添加 ws 的事件监听器，例如 message, close 等
    ws.on('message', (message) => {
      console.log(`Received message from client: ${Buffer.from(message).toString("hex").toUpperCase()}`);
    });

    ws.on('close',()=>{
      ws.send('server exited .')
      GameNetMgr.inst.close();
    });
  });

  // 处理 HTTP 升级请求
  server.on('upgrade', (request, socket, head) => {
    // 从请求中提取用户信息（假设用户信息已经附加到请求对象中）

    const { pathname, searchParams } = new URL(request.url, `http://${request.headers.host}`);
    const userId = searchParams.get("userId");

    if (pathname == "/ws" && userId) {

      // 在异步上下文中存储用户信息
      // const store = asyncLocalStorage.getStore();
      // store.set('userId', userId);

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy(); // 如果没有用户信息，拒绝升级
    }
  });
};

startServer();