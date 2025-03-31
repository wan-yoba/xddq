import jwt from "jsonwebtoken";
import logger from "./logger.js";

const SECRET_KEY = "your-secret-key"; // 在生产环境中应该使用环境变量
const TOKEN_EXPIRY = "24h"; // token有效期为24小时

export default class TokenManager {
  /**
   * 生成JWT token
   * @param {Object} payload - token的载荷数据
   * @returns {string} - 生成的token
   */
  static generateToken(payload) {
    try {
      return jwt.sign(payload, SECRET_KEY, { expiresIn: TOKEN_EXPIRY });
    } catch (error) {
      logger.error(`生成token失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 验证JWT token
   * @param {string} token - 要验证的token
   * @returns {Object|null} - 验证成功返回解码后的payload，失败返回null
   */
  static verifyToken(token) {
    try {
      // 处理可能存在的Bearer前缀
      const actualToken = token.startsWith("Bearer ") ? token.slice(7) : token;
      return jwt.verify(actualToken, SECRET_KEY);
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        logger.error("Token已过期");
      } else {
        logger.error(`Token验证失败: ${error.message}`);
      }
      return null;
    }
  }

  /**
   * 检查token是否过期
   * @param {string} token - 要检查的token
   * @returns {boolean} - token是否有效
   */
  static isTokenValid(token) {
    const decoded = this.verifyToken(token);
    return decoded !== null;
  }
}
