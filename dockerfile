# 使用 Node.js 官方镜像作为基础镜像
FROM node

# 设置工作目录
WORKDIR /

# 将当前目录的所有文件复制到容器中
COPY . .

# 安装依赖
RUN npm install

# 监听端口 8082
EXPOSE 8082

# 启动应用
CMD ["node", "src/loaders/index.js"]
