FROM node:bullseye-slim

# 设置工作目录
WORKDIR /

RUN ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime \
    && echo "Asia/Shanghai" > /etc/timezone

WORKDIR /app

# 将当前目录的所有文件复制到容器中
COPY . .

# 安装依赖
RUN npm install

# 监听端口 8082
EXPOSE 8082

CMD ["node", "app.js"]
