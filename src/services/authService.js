import axios from "axios";
import CryptoJS from "crypto-js";
import qs from "qs";
import { v4 as uuidv4 } from "uuid";
import logger from "#utils/logger.js";
import fs from "fs";
import util from "util";

/**
 * 更新账户配置文件
 * @param {string} filePath 配置文件路径
 * @param {Object} newObject 新的配置对象
 * @returns {Promise<void>}
 */
export async function updateAccount(filePath, newObject) {
  const readFileAsync = util.promisify(fs.readFile);
  const writeFileAsync = util.promisify(fs.writeFile);
  try {
    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      throw new Error(`配置文件不存在: ${filePath}`);
    }

    const data = await readFileAsync(filePath, "utf8");
    let account;

    try {
      account = JSON.parse(data);
    } catch (parseErr) {
      logger.error(`配置文件JSON解析错误: ${parseErr.message}`);
      return;
    }

    Object.assign(account, newObject);

    const newContent = JSON.stringify(account, null, 4);

    try {
      await writeFileAsync(filePath, newContent, "utf8");
      logger.info(`配置文件已成功修改并保存: ${filePath}`);
    } catch (writeErr) {
      logger.error(`写入配置文件时出错: ${writeErr.message}`);
    }
  } catch (err) {
    logger.error(`读取配置文件时出错: ${err.message}`);
  }
}

export default class AuthService {
  getRandomNum(count) {
    const chars =
      "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let result = "";
    for (let i = 0; i < count; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  encryptPwd(pwd) {
    if (!pwd) {
      return null;
    }
    const str =
      this.getRandomNum(8) +
      pwd.substring(0, 3) +
      this.getRandomNum(5) +
      pwd.substring(3) +
      this.getRandomNum(2);
    return CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(str)).trim();
  }

  createRequestBody(token, uid, uname) {
    const dataObj = {
      clientId: uuidv4(),
      token: token,
      uid: uid,
      uname: uname,
    };

    return encodeURIComponent(JSON.stringify(dataObj));
  }

  async firstRequest(username, password) {
    const data = qs.stringify({
      login_account: username,
      password: this.encryptPwd(password),
    });

    const config = {
      method: "post",
      url: "https://mysdk.37.com/index.php?c=api-login&a=act_login",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      data: data,
    };

    try {
      const response = await axios(config);
      return response.data;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async secondRequest(username, ptoken) {
    const data = qs.stringify({
      is_self: "1",
      pid: "37h5",
      ptoken: ptoken,
      puid: username,
    });

    const config = {
      method: "post",
      url: "https://apimyh5.37.com/index.php?c=sdk-login&a=act_login",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      data: data,
    };

    try {
      const response = await axios(config);
      return response.data;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async thirdRequest(serverId, token, uid, username) {
    const requestBody = this.createRequestBody(token, uid, username);

    const data = JSON.stringify({
      data: requestBody,
      loginType: 0,
      channelId: 31,
      appid: "37h5",
      gameId: 223,
    });

    const config = {
      method: "post",
      url: `https://proxy-xddq.hdnd01.com/s${serverId}_http/player/login`,
      headers: {
        "Content-Type": "application/json",
      },
      data: data,
    };

    try {
      const response = await axios(config);
      return response.data;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async Bind(username, password) {
    try {
      const response = await this.firstRequest(username, password);
      const firstResponse = response.data;
      if (response.code === 1) {
        return firstResponse;
      } else {
        throw new Error("登陆失败");
      }
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async List(username, password) {
    try {
      const firstResponse = await this.Bind(username, password);
      const uid = firstResponse.userinfo.uid;
      const url = "https://login-xddq.hdnd01.com/server/list";
      const headers = {
        "content-type": "application/json",
      };

      const body = {
        openId: uid,
        channelId: 31,
      };

      const response = await axios.post(url, body, { headers });
      const { serverList, playerServerList } = response.data;

      if (!playerServerList || playerServerList.length === 0) {
        throw new Error("无活跃服务器");
      }

      const servers = serverList
        .filter((server) => playerServerList.includes(server.serverId))
        .sort((a, b) => a.serverId - b.serverId)
        .map((server, index) => ({
          id: index,
          serverId: server.serverId,
          serverName: server.serverName,
        }));

      return { servers };
    } catch (e) {
      logger.error("无法获取服务器列表");
      throw e;
    }
  }

  async Login(username, password, serverId) {
    try {
      logger.info(`正在连接服务器...`);
      const firstResponse = await this.Bind(username, password);
      const ptoken = firstResponse.app_pst;
      const uid = firstResponse.userinfo.uid;

      const secondResponse = await this.secondRequest(username, ptoken);
      if (secondResponse.code === 1) {
        const app_pst = secondResponse.data.app_pst;

        const thirdResponse = await this.LoginWithToken(
          serverId,
          app_pst,
          uid,
          username,
          password
        );
        return thirdResponse;
      } else {
        throw new Error("登陆失败");
      }
    } catch (error) {
      throw new Error(error.message || "登陆失败");
    }
  }

  async LoginWithToken(serverId, app_pst, uid, username, password) {
    try {
      const thirdResponse = await this.thirdRequest(
        serverId,
        app_pst,
        uid,
        username
      );

      if (thirdResponse.ret !== 0) {
        throw new Error("登陆失败");
      }
      logger.info(`登录成功, ${JSON.stringify(thirdResponse, null, "\t")}`);
      // 更新账户信息 保存token uid
      const filePath = global.configFile;

      const newObject = {
        token: app_pst,
        uid: uid,
        nickName: thirdResponse.nickName,
      };
      await updateAccount(filePath, newObject);

      return thirdResponse;
    } catch (error) {
      throw new Error(error.message || "登陆失败");
    }
  }
}
