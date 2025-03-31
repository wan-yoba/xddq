import dependencyInjectorLoader from "#loaders/dependencyInjector.js";
import GameNetMgr from "#game/net/GameNetMgr.js";
import logger, { setWebSocket } from "#utils/logger.js";
import AuthService, { updateAccount } from "#services/authService.js";
import { getConfig, saveConfig } from "#loaders/configApi.js";
import express from "express";
import cors from "cors";
import WebSocket, { WebSocketServer } from "ws";
import TokenManager from "#utils/tokenManager.js";

// Token验证中间件
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization || req.query.token;

  if (!token) {
    return res.status(401).json({ error: "Unauthorized: Token is required" });
  }

  if (!TokenManager.isTokenValid(token)) {
    return res
      .status(401)
      .json({ error: "Unauthorized: Token is invalid or expired" });
  }

  next();
};

export default async () => {
  //await dependencyInjectorLoader();

  //   try {
  //     // Initialize WebSocket
  //     const { wsAddress, playerId, token } = await GameNetMgr.inst.doLogin();
  //     GameNetMgr.inst.connectGameServer(wsAddress, playerId, token);
  //   } catch (error) {
  //     logger.error(error.message || error);
  //   }

  const app = express();
  app.use(cors());
  app.use(express.json());

  // GET /api/servers - 获取服务器列表
  app.get("/api/servers", async (req, res) => {
    const { username, password, token } = req.query;
    if (!username || !password) {
      return res
        .status(400)
        .json({ error: "Username and password are required" });
    }

    // token 验证
    let configToken = global.account.loginToken;
    if (configToken && token != configToken) {
      return res.status(400).json({ error: "invalid token !" });
    }

    try {
      const authServiceInstance = new AuthService();
      const serverList = await authServiceInstance.List(username, password);
      return res.json(serverList);
    } catch (error) {
      logger.error(error.message || error);
      return res.status(500).json({ error: "Failed to fetch server list" });
    }
  });

  // 登录接口
  app.post("/api/login", async (req, res) => {
    const { username, password, serverId } = req.body;

    try {
      try {
        // 更新account.js
        const filePath = global.configFile;

        const newObject = {
          serverId: serverId,
          username: username,
          password: password,
        };

        await updateAccount(filePath, newObject);
        logger.info("更新配置文件成功，已写入相应参数.");
      } catch (error) {
        // ignore
        logger.error(`更新配置文件失败，${error.message}.`);
      }

      // 发起登陆
      const { wsAddress, playerId, token } = await GameNetMgr.inst.doLogin({
        serverId: serverId,
        username: username,
        password: password,
      });

      // 生成JWT token
      const jwtToken = TokenManager.generateToken({
        playerId,
        username,
        serverId,
      });

      // 返回登录成功信息
      res.json({
        playerId,
        token: token,
        jwtToken: jwtToken,
        wsAddress,
        message: "Login successful. WebSocket connection will be established.",
      });
    } catch (error) {
      // 登陆失败，清理参数
      await localLogout();

      logger.error("Login failed", error);
      res.status(500).json({ error: error.message });
    }
  });

  // 退出登陆
  app.post("/api/logout", authMiddleware, async (req, res) => {
    const { playerId } = req.body;
    if (playerId) {
      await localLogout();

      GameNetMgr.inst.close();

      const logout = true;
      res.json({ logout });
    } else {
      res.status(500).json({ error: "request failed" });
    }
  });

  // 获取配置
  app.get("/api/config", authMiddleware, async (req, res) => {
    try {
      const filePath = global.configFile;
      const config = await getConfig(filePath);
      res.json(config);
    } catch (error) {
      logger.error(`获取配置失败: ${error.message}`);
      res.status(500).json({ error: "Failed to get configuration" });
    }
  });

  // 保存配置
  app.post("/api/config", authMiddleware, async (req, res) => {
    try {
      const filePath = global.configFile;
      const config = req.body;

      // 保存配置
      const result = await saveConfig(filePath, config);
      res.json(result);
    } catch (error) {
      logger.error(`保存配置失败: ${error.message}`);
      res.status(500).json({ error: "Failed to save configuration" });
    }
  });

  // 启动服务器
  app.post("/api/start", authMiddleware, async (req, res) => {
    try {
      const { token, wsAddress, playerId } = req.body;

      if (!playerId || !token || !wsAddress) {
        return res.status(400).json({ message: "Invalid request" });
      }

      // 连接游戏服务器
      GameNetMgr.inst.connectGameServer(wsAddress, playerId, token);
      logger.info("Server started successfully.");
      res.json({ success: true, message: "Server started successfully" });
    } catch (error) {
      logger.error(`启动服务器失败: ${error.message}`);
      res.status(500).json({ message: `${error.message}` });
    }
  });

  // 清理account
  async function localLogout() {
    const filePath = global.configFile;

    const newObject = {
      serverId: "",
      username: "",
      password: "",
      uid: "",
      token: "",
    };

    await updateAccount(filePath, newObject);
  }

  // 启动服务器
  const startServer = async () => {
    await dependencyInjectorLoader();

    const server = app.listen(8082, () => {
      console.log("Server running on port 8082");
    });

    // 在启动服务器后创建 WebSocketServer 实例
    const wss = new WebSocketServer({ noServer: true });

    wss.on("connection", (ws) => {
      // 发送测试消息
      ws.send("New WebSocket connection established.");

      // 心跳检测
      const heartbeat = setInterval(() => ws.ping(), 30000);

      // 链接成功，保持心跳
      setWebSocket(ws);

      // 可在这里添加 ws 的事件监听器，例如 message, close 等
      ws.on("message", (message) => {
        console.log(`Received message from client: ${message.toString()}`);
      });

      ws.on("close", () => {
        logger.error("ui webSocket disconnected .");
        clearInterval(heartbeat);
        // GameNetMgr.inst.close();
      });
    });

    // 处理 HTTP 升级请求
    server.on("upgrade", (request, socket, head) => {
      // 从请求中提取用户信息（假设用户信息已经附加到请求对象中）

      const { pathname, searchParams } = new URL(
        request.url,
        `http://${request.headers.host}`
      );
      const userId = searchParams.get("userId");
      const token = searchParams.get("token");

      if (
        pathname == "/ws" &&
        userId &&
        token &&
        TokenManager.isTokenValid(token)
      ) {
        // 在异步上下文中存储用户信息
        // const store = asyncLocalStorage.getStore();
        // store.set('userId', userId);

        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit("connection", ws, request);
        });
      } else {
        socket.destroy(); // 如果没有用户信息，拒绝升级
      }
    });
  };

  startServer();
};
