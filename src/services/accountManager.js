import fs from "fs";
import path from "path";
import util from "util";
import logger from "#utils/logger.js";
import createPath from "#utils/path.js";

const readFileAsync = util.promisify(fs.readFile);
const writeFileAsync = util.promisify(fs.writeFile);
const resolvePath = createPath(import.meta.url);
const dataDir = resolvePath("../../data");

class AccountManager {
  constructor() {
    // 确保data目录存在
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    // 初始化内存中的用户配置
    this.initUserConfigs();
  }

  /**
   * 初始化内存中的用户配置
   */
  async initUserConfigs() {
    try {
      const files = fs.readdirSync(dataDir);
      for (const file of files) {
        if (file.startsWith("account_") && file.endsWith(".json")) {
          const userId = file.replace("account_", "").replace(".json", "");
          const account = await this.getAccount(userId);
          if (account && global.userConfigs.size < global.maxUserConfigs) {
            global.userConfigs.set(userId, account);
          }
        }
      }
    } catch (error) {
      logger.error(`初始化用户配置失败: ${error.message}`);
    }
  }

  /**
   * 获取账户配置文件路径
   * @param {string} userId 用户ID
   * @returns {string} 配置文件路径
   */
  getAccountFilePath(userId) {
    if (!userId) {
      return path.join(dataDir, global.configFile);
    }
    return path.join(dataDir, `account_${userId}.json`);
  }

  /**
   * 获取账户配置
   * @param {string} userId 用户ID
   * @returns {Promise<Object>} 账户配置对象
   */
  async getAccount(userId) {
    // 先从内存中获取
    if (global.userConfigs.has(userId)) {
      return global.userConfigs.get(userId);
    }

    const filePath = this.getAccountFilePath(userId);
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`账户配置不存在 [${userId}]`);
      }
      const data = await readFileAsync(filePath, "utf8");
      const config = JSON.parse(data);
      // 如果内存中的配置数量未达到上限，则添加到内存中
      if (global.userConfigs.size < global.maxUserConfigs) {
        global.userConfigs.set(userId, config);
      } else {
        throw new Error(
          `内存中的用户配置数量已达到上限 [${global.maxUserConfigs}]！`
        );
      }
      return config;
    } catch (error) {
      logger.error(`读取账户配置失败 [${userId}]: ${error.message}`);
      throw error;
    }
  }

  /**
   * 保存账户配置
   * @param {string} userId 用户ID
   * @param {Object} config 配置对象
   */
  async saveAccount(userId, config) {
    const filePath = this.getAccountFilePath(userId);
    try {
      // 如果配置不存在，读取默认配置模板并合并
      if (!fs.existsSync(filePath)) {
        const defaultConfig = JSON.parse(
          await readFileAsync(path.join(dataDir, "../account.json"), "utf8")
        );
        // 清空个人信息
        defaultConfig.nickName = "";
        defaultConfig.loginToken = "";
        defaultConfig.serverId = "";
        defaultConfig.username = "";
        defaultConfig.password = "";
        defaultConfig.uid = "";
        defaultConfig.token = "";
        // 合并配置
        Object.assign(defaultConfig, config);
        config = defaultConfig;
      } else {
        // 读取配置
        const data = await readFileAsync(filePath, "utf8");
        const defaultConfig = JSON.parse(data);

        // 合并配置
        Object.assign(defaultConfig, config);
        config = defaultConfig;
      }

      const newContent = JSON.stringify(config, null, 4);
      await writeFileAsync(filePath, newContent, "utf8");
      // 更新内存中的配置
      if (global.userConfigs.has(userId)) {
        global.userConfigs.set(userId, config);
      } else if (global.userConfigs.size < global.maxUserConfigs) {
        global.userConfigs.set(userId, config);
      } else {
        throw new Error(
          `用户配置数量已达到上限 [${global.maxUserConfigs}]，当前用户禁止登陆！`
        );
      }
      logger.info(`账户配置已保存 [${userId}]`);
    } catch (error) {
      throw error;
    }
  }

  /**
   * 更新账户配置
   * @param {string} userId 用户ID
   * @param {Object} newConfig 新的配置对象
   * @returns {Promise<boolean>} 是否更新成功
   */
  async updateAccount(userId, newConfig) {
    try {
      let config = await this.getAccount(userId);
      if (!config) {
        config = {
          nickName: "",
          loginToken: "",
          maxRetries: "0",
          reconnectInterval: 1800000,
          serverId: "",
          username: "",
          password: "",
          uid: userId,
          token: "",
        };
      }
      Object.assign(config, newConfig);
      return await this.saveAccount(userId, config);
    } catch (error) {
      logger.error(`更新账户配置失败 [${userId}]: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取所有账户配置
   * @returns {Promise<Array<Object>>} 账户配置数组
   */
  async getAllAccounts() {
    try {
      const files = fs.readdirSync(dataDir);
      const accounts = [];
      for (const file of files) {
        if (file.startsWith("account_") && file.endsWith(".json")) {
          const userId = file.replace("account_", "").replace(".json", "");
          const account = await this.getAccount(userId);
          if (account) {
            accounts.push(account);
          }
        }
      }
      return accounts;
    } catch (error) {
      logger.error(`获取所有账户配置失败: ${error.message}`);
      throw error;
    }
  }
}

export default new AccountManager();
