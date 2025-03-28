import Protocol from "#game/net/Protocol.js";
import Stream from "#game/net/Stream.js";
import ProtobufMgr from "#game/net/ProtobufMgr.js";
import { NetSocket, NetState } from "#game/net/NetSocket.js";
import logger from "#utils/logger.js";
import AuthService from "#services/authService.js";
import MsgRecvMgr from "#game/common/MsgRecvMgr.js";
import LoopMgr from "#game/common/LoopMgr.js";
import RegistMgr from "#game/common/RegistMgr.js";

class GameNetMgr {
  constructor() {
    this.connections = new Map(); // 存储多个连接实例
    this.handlers = {}; // 全局事件处理器
  }

  // 创建新的连接实例
  createConnection(userId) {
    const connection = {
      token: null,
      playerId: null,
      net: new NetSocket(),
      isLogined: false,
      isReConnectting: false,
      sendMsgLength: 0,
      maxRetries:
        typeof global.account?.maxRetries === "string" &&
        global.account.maxRetries.toLowerCase() === "infinity"
          ? Infinity
          : global.account?.maxRetries || 10,
      retryCount: 0,
      messageQueue: [],
      isSending: false,
    };
    this.connections.set(userId, connection);
    return connection;
  }

  // 获取连接实例
  getConnection(userId) {
    let connection = this.connections.get(userId);
    if (!connection) {
      connection = this.createConnection(userId);
    }
    return connection;
  }

  static get inst() {
    if (this._instance == null) {
      this._instance = new GameNetMgr();
    }
    return this._instance;
  }

  connectGameServer(url, playerId, token, userId) {
    const connection = this.getConnection(userId);
    connection.playerId = playerId;
    connection.token = token;

    connection.net.initWithUrl(url);
    connection.net.addHandler(
      () => this.ping(userId),
      (data) => this.parseArrayBuffMsg(data, userId)
    );

    connection.net.connect((state) =>
      this.netStateChangeHandler(state, userId)
    );
    connection.isLogined = true;

    logger.debug(`[WebSocket] [${userId}] 开始心跳`);
    connection.net.heartbeatStart();
    logger.debug(`[LoopMgr] [${userId}] 开始循环任务`);
    setTimeout(() => {
      LoopMgr.inst.start();
    }, 2000);
  }

  netStateChangeHandler(state, userId) {
    const connection = this.getConnection(userId);
    connection.netConnState = state;

    switch (connection.netConnState) {
      case NetState.NET_CONNECT:
        this.netConnectHandler(userId);
        break;
      case NetState.NET_CLOSE:
        this.netCloseHandler(userId);
        break;
      case NetState.NET_ERROR:
        this.netErrorHandler(userId);
        break;
    }
  }

  netConnectHandler(userId) {
    this.login(userId);
    logger.info(`[WebSocket] [${userId}] 连接成功`);
  }

  netCloseHandler(userId) {
    const connection = this.getConnection(userId);
    logger.error(`[WebSocket] [${userId}] 已断开连接`);
    this.close(userId);

    if (connection.retryCount < connection.maxRetries) {
      connection.retryCount++;
      logger.warn(
        `[GameNetMgr] [${userId}] 第 ${connection.retryCount} 次重连中...`
      );

      if (!connection.isLogined && !connection.isReConnectting) {
        this.reconnect(userId);
      }
    } else {
      logger.error(
        `[GameNetMgr] [${userId}] 已达到最大重连次数 ${connection.maxRetries}，停止重连。`
      );
      this.connections.delete(userId);
    }
  }

  netErrorHandler(userId) {
    logger.error(`[WebSocket] [${userId}] 连接错误`);
    this.close(userId);
  }

  login(userId) {
    const connection = this.getConnection(userId);
    const loginData = {
      token: connection.token,
      language: "zh_cn",
      liveShowType: 0,
    };
    this.sendPbMsg(Protocol.S_PLAYER_LOGIN, loginData, false, userId);
  }

  ping(userId) {
    this.sendPbMsg(Protocol.S_PLAYER_PING, true, false, userId);
  }

  addHandler(msgId, handler) {
    this.handlers[msgId] = (data, userId) => {
      if (msgId !== "disconnect" && typeof data === "string") {
        data = JSON.parse(data);
      }
      handler(data, userId);
    };
  }

  sendPbMsg(msgId, msgData, directSend = false, userId) {
    const connection = this.getConnection(userId);
    if (!connection.net.isConnected()) {
      return;
    }

    // Create a new message stream
    const stream = new Stream();
    stream.init(
      msgId,
      +connection.playerId,
      NetSocket.BYTES_OF_MSG_HEADER + NetSocket.MSG_DATA_LENGTH,
      true
    );
    stream.writeShort(NetSocket.HEADER);
    stream.writeInt(50);
    stream.writeInt(msgId);
    stream.writeLong(connection.playerId);

    try {
      const body = stream.pbMsg.encode(msgData).finish();
      stream.writeBytes(body, 18);
    } catch (err) {
      if (msgData && Object.keys(msgData).length > 0) {
        logger.debug(
          `[websocket] [${userId}] 发送消息：msgId: ${msgId}, msgData: ${JSON.stringify(
            msgData
          )}`
        );
      }
    }

    stream.writeInt(stream.offset, 2);
    // parseSendData
    const t = new Uint8Array(stream.offset);
    t.set(stream.buff.subarray(0, stream.offset));
    stream.buff = t;
    stream.streamsize = stream.offset;

    if (directSend) {
      connection.net.send(stream.buff);
    } else {
      connection.messageQueue.push({ msgId, msgData });
      this.startSending(userId);
    }
  }

  startSending(userId) {
    const connection = this.getConnection(userId);
    if (connection.isSending || connection.messageQueue.length === 0) {
      return;
    }

    connection.isSending = true;

    const sendNextMessage = () => {
      if (connection.messageQueue.length > 0) {
        const { msgId, msgData } = connection.messageQueue.shift();
        this.sendPbMsg(msgId, msgData, true, userId);
        setTimeout(sendNextMessage, global.messageDelay);
      } else {
        connection.isSending = false;
      }
    };

    sendNextMessage();
  }

  close(userId) {
    const connection = this.getConnection(userId);
    if (connection) {
      connection.net.close();
      connection.isLogined = false;
      connection.isReConnectting = false;
      connection.messageQueue = [];
      connection.isSending = false;
    }
  }

  reconnect(userId) {
    const connection = this.getConnection(userId);
    if (!connection.isReConnectting) {
      connection.isReConnectting = true;
      logger.info(`[GameNetMgr] [${userId}] 重连中...`);
      setTimeout(() => {
        connection.isReConnectting = false;
        this.login(userId);
      }, 5000);
    }
  }

  parseArrayBuffMsg(arrayBuffer) {
    try {
      const stream = new Stream();
      stream.initByBuff(arrayBuffer, NetSocket.BYTES_OF_MSG_HEADER);
      stream.readShort();
      const length = stream.readInt();
      const msgId = stream.readInt();

      const protoMsg = ProtobufMgr.inst.getMsg(msgId, false);
      const msgBody = new Uint8Array(
        arrayBuffer.subarray(NetSocket.BYTES_OF_MSG_HEADER, length)
      );

      if (protoMsg) {
        const parsedMsg = protoMsg.decode(msgBody);
        // logger.info(`msgId: ${msgId} ${JSON.stringify(parsedMsg)}`);
        this.resvHandler(msgId, parsedMsg);
      }
    } catch (error) {
      logger.debug(
        `[未知协议] ${this.toHexString(new Uint8Array(arrayBuffer))}`
      );
    }
  }

  toHexString = (bytes) => {
    let hex = [];
    for (let i = 0; i < bytes.length; i++) {
      let current = bytes[i] < 0 ? bytes[i] + 256 : bytes[i];
      hex.push((current >>> 4).toString(16));
      hex.push((current & 0xf).toString(16));
    }
    return hex.join("");
  };

  resvHandler(msgId, msgData) {
    if (msgData) {
      const protoCmd = ProtobufMgr.inst.resvCmdList[msgId].smMethod.split(".");
      const method = protoCmd[protoCmd.length - 1];

      if (MsgRecvMgr[method]) {
        logger.debug(`[Handler] 找到处理函数: ${method} msgId: ${msgId}`);
        MsgRecvMgr[method](msgData, msgId);
      } else {
        logger.debug(`[Handler] 未找到处理函数: ${method} msgId: ${msgId}`);
      }
    }
  }

  async countdown(reconnectInterval) {
    let remainingTime = reconnectInterval / 1000;

    const printCountdown = () => {
      if (remainingTime <= 10) {
        logger.info(`剩余时间: ${remainingTime} 秒`);
        remainingTime--;
        return 1000; // 每秒更新
      } else if (remainingTime <= 60) {
        logger.info(`剩余时间: ${remainingTime} 秒`);
        remainingTime -= 10;
        return 10000; // 每10秒更新
      } else {
        logger.info(`剩余时间: ${remainingTime} 秒`);
        remainingTime -= 30;
        return 30000; // 每30秒更新
      }
    };

    // 开始倒计时
    while (remainingTime > 0) {
      const interval = printCountdown();
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
    logger.info("倒计时结束");
  }

  async reconnect(resetInterval = null) {
    logger.info("[GameNetMgr] 重连中...");
    this.isReConnectting = true;
    this.close();
    LoopMgr.inst.end();
    RegistMgr.inst.reset();

    const reconnectInterval =
      resetInterval || global.account.reconnectInterval || 5000;
    await this.countdown(reconnectInterval);

    const { wsAddress, playerId, token } = await this.doLogin();
    this.connectGameServer(wsAddress, playerId, token);

    this.isReConnectting = false;
  }

  close() {
    if (this.net) {
      this.net.close(true);
    }

    this.isLogined = false;
    this.handlers = {};
  }

  async doLogin({ serverId, username, password } = {}) {
    const authServiceInstance = new AuthService();

    // 从参数或全局配置获取凭证，参数优先级高于全局配置
    const effectiveServerId = serverId ?? global.account.serverId;
    const effectiveUsername = username ?? global.account.username;
    const effectivePassword = password ?? global.account.password;

    const { token, uid } = global.account;

    // 参数校验（可选，根据需求添加）
    if (!effectiveServerId || !effectiveUsername || !effectivePassword) {
      const missing = [];
      if (!effectiveServerId) missing.push("serverId");
      if (!effectiveUsername) missing.push("username");
      if (!effectivePassword) missing.push("password");
      throw new Error(`缺少必要参数: ${missing.join(", ")}`);
    }

    try {
      // Login first, and then fetch the wsAddress and token
      let response;
      const loginParams = {
        serverId: effectiveServerId,
        username: effectiveUsername,
        password: effectivePassword,
      };

      try {
        if (token && uid) {
          logger.info("[Login] 尝试使用token登录...");
          response = await authServiceInstance.LoginWithToken(
            effectiveServerId,
            token,
            uid,
            effectiveUsername,
            effectivePassword
          );
        } else {
          throw new Error("[Login] token登录失败，降级到密码登录");
        }
      } catch (error) {
        logger.warn(
          "[Login] token登录失败, 尝试使用用户名密码登录...",
          loginParams
        );
        response = await authServiceInstance.Login(
          effectiveUsername,
          effectivePassword,
          effectiveServerId
        );
      }
      logger.info("[Login] 登录成功", {
        response: JSON.stringify(response),
        ...loginParams,
      });

      return response;
    } catch (error) {
      logger.error("[Login] 登录流程失败", {
        error: error.message,
        serverId: effectiveServerId,
        username: effectiveUsername,
      });
      throw error; // 抛出错误由调用方处理
    }
  }
}

export default GameNetMgr;
