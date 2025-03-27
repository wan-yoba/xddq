### **注意本库只能作为学习用途, 造成的任何问题与本库开发者无关, 如侵犯到你的权益，请联系删除。**
### **注意本库只能作为学习用途, 造成的任何问题与本库开发者无关, 如侵犯到你的权益，请联系删除。**
### **注意本库只能作为学习用途, 造成的任何问题与本库开发者无关, 如侵犯到你的权益，请联系删除。**

# 注意事项！！！
> 本文来自于[https://github.com/gyn7561/xddq-assistant](https://github.com/gyn7561/xddq-assistant) <br/>
> 本想实现新功能，但不会抓包，遂放弃 <br/>
> 本文仅用于学习，针对此脚本获取到了收益， `你妈死了` <br/>
> 最新更新于  `2025年3月27日` <br/>
> 作者：`wan-yoba` <br/>


## 免责声明
	
本仓库仅供技术学习交流使用，如有下载相关文件，请在学习后24小时内删除相关内容。

切勿在 tb/pdd 等商城的非法渠道付费此软件。

如将本仓库教程/文件用于获利，那么：你妈死了。

请勿将本项目内容用于非法用途，使用者在使用时即视为对行为可能产生的任何不良后果负责。
	
由于传播、利用此工具所提供的信息而造成的任何直接或者间接的后果及损失，均由使用者本人负责，作者不为此承担任何责任。

## 网页使用方法

* 获取仓库[Web](https://github.com/wan-yoba/xddq-web)

### dockerUi 部署
```
docker build -t xddq-ui-image .
docker run --name=xddq-ui -dp 8083:8083 --restart=always -e TZ=Asia/Shanghai xddq-ui-image
```

### docker服务端 部署

* docker 容器，windows 电脑需要安装 `docker-desktop`
* docker 命令，需要切到项目主目录，执行以下命令
```
// 创建镜像
docker build -t xddq-image .

// 运行容器
docker run --name=xddq -dp 8082:8082 --restart=always -e TZ=Asia/Shanghai xddq-image

那么此时访问你的IP 例如 1.1.1.1:8082 就能请求到接口

// 构建 ui 请参考上述

此时访问 你的IP，如 1.1.1.1:8083 将能看到界面

如果是本机，可以不用部署ui界面，直接点击 index.html 即可

```
* 记得更改 `UI` 中的 `baseUrl`，将 localhost 改为对应的ip地址，这是在服务器上面的操作
* 有设置 `token` 在 `account.js` 中，将 `loginToken` 的值设定为自己想要的即可，如果不设置将不验证

### windows 应用
* 请下载 nodejs 的windows组件，切入目录，使用以下命令 `npm run start`

### windows 打包可执行文件
* TODO // 尚未实现

## 效果图例

### 登陆界面
![image](https://github.com/user-attachments/assets/14bfa4b5-abcd-4c63-a26f-f2f9f570f781)

### 主界面
![image](https://github.com/user-attachments/assets/3614f840-5748-4eee-88e3-798c3b768a5c)



