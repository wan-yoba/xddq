import fs from 'fs';
import util from 'util';
import logger from "#utils/logger.js";

const readFileAsync = util.promisify(fs.readFile);
const writeFileAsync = util.promisify(fs.writeFile);

/**
 * 获取配置文件内容
 * @param {string} filePath 配置文件路径
 * @returns {Promise<Object>} 配置对象
 */
export async function getConfig(filePath) {
  try {
    const data = await readFileAsync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    logger.error(`读取配置文件失败: ${error.message}`);
    throw error;
  }
}

/**
 * 保存配置文件内容
 * @param {string} filePath 配置文件路径
 * @param {Object} config 配置对象
 * @returns {Promise<void>}
 */
export async function saveConfig(filePath, config) {
  try {
    // 保留注释字段
    const data = await readFileAsync(filePath, 'utf8');
    const currentConfig = JSON.parse(data);
    
    // 找出所有注释字段
    const commentKeys = Object.keys(currentConfig).filter(key => key.startsWith('_comment'));
    
    // 将注释字段添加到新配置中
    commentKeys.forEach(key => {
      if (!config[key]) {
        config[key] = currentConfig[key];
      }
    });
    
    // 格式化并保存配置
    const newContent = JSON.stringify(config, null, 4);
    await writeFileAsync(filePath, newContent, 'utf8');
    logger.info('配置文件已成功保存');
    return { success: true };
  } catch (error) {
    logger.error(`保存配置文件失败: ${error.message}`);
    throw error;
  }
}