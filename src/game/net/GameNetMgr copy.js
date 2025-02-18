import async from "async";

import Protocol from "#game/net/Protocol.js";
import { Stream } from "#game/net/Stream.js";
import { ProtobufMgr } from "#game/net/ProtobufMgr.js";
import { NetSocket, NetState } from "#game/net/NetSocket.js";

import logger from "#utils/logger.js";
import MsgRecvMgr from "#game/common/MsgRecvMgr.js";
import LoopMgr from "#game/common/LoopMgr.js";

class GameNetMgr {
  constructor() {
    this.connections = new Map();  // To track multiple user connections
    this.maxReconnectNum = 2;
  }

  static get inst() {
    if (this._instance == null) {
      this._instance = new GameNetMgr();
    }
    return this._instance;
  }

  connectGameServer(url, playerId, token) {
    // Ensure that the playerId has a separate connection
    if (this.connections.has(playerId)) {
      logger.info(`[WebSocket] Player ${playerId} already connected.`);
      return;
    }

    const connection = new NetSocket();
    this.connections.set(playerId, {
      net: connection,
      token: token,
      playerId: playerId,
      isLogined: false,
      _closed: false,
      reConnectTimes: 0,
      isReconnectNum: 0,
      handlers: {},
    });

    connection.initWithUrl(url);
    connection.addHandler(
      this.ping.bind(this),
      this.parseArrayBuffMsg.bind(this)
    );

    connection.connect(this.netStateChangeHandler.bind(this, playerId));
    
    // Start heartbeats and loops for this specific player
    connection.heartbeatStart(playerId);
    LoopMgr.inst.start();
  }

  netStateChangeHandler(playerId, state) {
    const connection = this.connections.get(playerId);
    if (!connection) return;

    switch (state) {
      case NetState.NET_CONNECT:
        this.netConnectHandler(playerId);
        break;
      case NetState.NET_CLOSE:
        this.netCloseHandler(playerId);
        break;
      case NetState.NET_ERROR:
        this.netErrorHandler(playerId);
        break;
    }
  }

  netConnectHandler(playerId) {
    const connection = this.connections.get(playerId);
    if (!connection) return;

    connection._closed = false;
    connection.reConnectTimes = 0;
    connection.isReconnectNum = 0;
    this.login(playerId);
    logger.info(`[WebSocket] Player ${playerId} connected successfully`);
  }

  netCloseHandler(playerId) {
    const connection = this.connections.get(playerId);
    if (!connection) return;

    logger.error(`[WebSocket] Player ${playerId} disconnected`);
    if (!connection._closed) {
      connection.reConnectTimes += 1;
      if (connection.reConnectTimes <= 100) this.reConnect(playerId);
    }
  }

  netErrorHandler(playerId) {
    const connection = this.connections.get(playerId);
    if (!connection) return;

    logger.error(`[WebSocket] Player ${playerId} connection error`);
    this.reConnect(playerId);
  }

  reConnect(playerId) {
    const connection = this.connections.get(playerId);
    if (!connection || connection._closed) return;

    async.waterfall(
      [
        (callback) => {
          if (connection.isReconnectNum < this.maxReconnectNum) {
            const delay = 1000 * connection.isReconnectNum;
            connection.isReconnectNum++;
            setTimeout(() => {
              logger.warn(`[WebSocket] Player ${playerId} reconnecting`);
              connection.net.reConnect();
              connection.handlers = {};
              callback(null, true);
            }, delay);
          } else {
            callback(null, false);
          }
        },
        (isReconnected, callback) => {
          if (isReconnected) {
            callback(null, isReconnected, false);
          } else {
            logger.error(`[WebSocket] Player ${playerId} exceeded reconnect limit`);
          }
        },
        (isReconnected, callback) => {
          if (!isReconnected) {
            connection.isReconnectNum = 0;
            this.close(playerId);
          }
          callback();
        },
      ],
      (err) => {
        if (err) console.error(err);
      }
    );
  }

  login(playerId) {
    const connection = this.connections.get(playerId);
    if (!connection) return;

    const loginData = {
      token: connection.token,
      language: "zh_cn",
    };
    this.sendPbMsg(playerId, Protocol.S_PLAYER_LOGIN, loginData, null);
  }

  ping(playerId) {
    this.sendPbMsg(playerId, Protocol.S_PLAYER_PING, null, null);
  }

  addHandler(playerId, msgId, handler) {
    const connection = this.connections.get(playerId);
    if (connection) {
      connection.handlers[msgId] = (data) => {
        if (msgId !== "disconnect" && typeof data === "string") {
          data = JSON.parse(data);
        }
        handler(data);
      };
    }
  }

  sendPbMsg(playerId, msgId, msgData, callback, extraCmd) {
    const connection = this.connections.get(playerId);
    if (!connection || !connection.net.isConnected()) return;

    const stream = new Stream();
    stream.init(
      msgId,
      +playerId,
      NetSocket.BYTES_OF_MSG_HEADER + NetSocket.MSG_DATA_LENGTH,
      true
    );
    stream.writeShort(NetSocket.HEADER);
    stream.writeInt(50);
    stream.writeInt(msgId);
    stream.writeLong(playerId);

    if (stream.pbMsg) {
      const body = stream.pbMsg.encode(msgData).finish();
      stream.writeBytes(body, 18);
    }

    stream.writeInt(stream.offset, 2);
    const t = new Uint8Array(stream.offset);
    t.set(stream.buff.subarray(0, stream.offset));
    stream.buff = t;
    stream.streamsize = stream.offset;

    const protoCmd = ProtobufMgr.inst.cmdList[msgId];
    if (callback && connection.net.isConnected()) {
      this.addHandler(playerId, protoCmd.smMsgId, callback);
    }

    if (extraCmd && ProtobufMgr.inst.cmdList[extraCmd]) {
      this.addHandler(playerId, extraCmd, callback);
    }

    connection.net.sendMsg(stream);
  }

  parseArrayBuffMsg(arrayBuffer) {
    try {
      const stream = new Stream();
      stream.initByBuff(arrayBuffer, NetSocket.BYTES_OF_MSG_HEADER);
      stream.readShort();
      const length = stream.readInt();
      const msgId = stream.readInt();

      const protoMsg = ProtobufMgr.inst.getMsg(msgId, false, true);
      const msgBody = new Uint8Array(
        arrayBuffer.subarray(NetSocket.BYTES_OF_MSG_HEADER, length)
      );

      if (protoMsg) {
        const parsedMsg = protoMsg.decode(msgBody);
        this.resvHandler(msgId, parsedMsg);
      }
    } catch (error) {
      const hexString = Buffer.from(arrayBuffer).toString("hex").toUpperCase();
    }
  }

  resvHandler(msgId, msgData) {
    if (msgData) {
      this.connections.forEach((connection) => {
        if (msgId && connection.handlers[msgId]) {
          const handler = connection.handlers[msgId];
          delete connection.handlers[msgId];
          handler.call(this, msgData);
        } else {
          const protoCmd =
            ProtobufMgr.inst.resvCmdList[msgId].smMethod.split(".");
          const method = protoCmd[protoCmd.length - 1];

          if (MsgRecvMgr[method]) {
            logger.debug(
              `[Handler] Found handler: ${method} msgId: ${msgId} ${JSON.stringify(
                msgData
              )}`
            );
            MsgRecvMgr[method](msgData, msgId);
          } else {
            logger.debug(
              `[Handler] No handler found: ${method} ${JSON.stringify(msgData)}`
            );
          }
        }
      });
    }
  }

  close(playerId) {
    const connection = this.connections.get(playerId);
    if (connection) {
      connection._closed = true;
      connection.net.close(true);
      connection.isReconnectNum = 0;
      this.connections.delete(playerId);
    }
  }
}

export default GameNetMgr;
