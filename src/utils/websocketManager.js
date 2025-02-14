// websocketManager.js
const websocketManager = {
    userWsMap: new Map(), // 存储用户和对应的 WebSocket 连接
  
    // 将用户和 WebSocket 连接绑定
    addUserConnection(userId, ws) {
      this.userWsMap.set(userId, ws);
    },
  
    // 获取用户的 WebSocket 连接
    getUserConnection(userId) {
      return this.userWsMap.get(userId);
    },
  
    // 删除用户的 WebSocket 连接
    removeUserConnection(userId) {
      this.userWsMap.delete(userId);
    },
  
    // 向指定用户的 WebSocket 推送日志
    pushLogToUser(userId, message) {
      const ws = this.getUserConnection(userId);
      if (ws && ws.readyState === ws.OPEN) {
        ws.send(message);
      }
    }
  };
  
  export default websocketManager;
  