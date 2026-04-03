# 健身房 AI 客服小工具 - 部署指南

## 📁 项目结构

```
Claw/
├── server/                    # 后端服务
│   ├── package.json           # 依赖配置
│   └── server.js              # Express + SQLite 服务
├── public/                    # 前端页面
│   └── customer-service-ai.html
├── customer-service-ai.html   # 纯前端版本（旧版，可删除）
└── DEPLOY.md                  # 本文档
```

## 🏗️ 架构说明

```
用户浏览器 ──→ 前端 HTML ──→ 后端 API ──→ SQLite 数据库
                               ↕
                          在线/离线双模式
                          (离线时用 localStorage 缓存)
```

- **前端**：纯静态 HTML，自动检测服务器连接状态
- **后端**：Node.js + Express + better-sqlite3
- **数据库**：SQLite 文件，无需额外安装数据库
- **API**：RESTful，支持知识库 CRUD + 智能问答匹配

---

## 🚀 阿里云部署步骤

### 前提条件

- 一台阿里云 ECS 服务器（推荐 Ubuntu 22.04，2 核 2G 即可）
- 已备案域名（可选，不绑域名也能用 IP 访问）

### 第一步：登录 ECS 服务器

```bash
ssh root@你的服务器IP
```

### 第二步：安装 Node.js

```bash
# 安装 Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 验证安装
node -v    # 应显示 v18.x.x
npm -v     # 应显示 9.x.x
```

### 第三步：上传项目文件

```bash
# 在服务器上创建项目目录
mkdir -p /opt/gym-cs/public
mkdir -p /opt/gym-cs/server/data

# 从本地上传文件（在本地电脑执行）
scp server/server.js root@你的服务器IP:/opt/gym-cs/server/
scp server/package.json root@你的服务器IP:/opt/gym-cs/server/
scp public/customer-service-ai.html root@你的服务器IP:/opt/gym-cs/public/
```

### 第四步：安装依赖并启动

```bash
cd /opt/gym-cs/server
npm install
node server.js
```

看到以下输出说明启动成功：
```
🚀 健身房客服知识库服务已启动
📍 地址: http://localhost:3000
📚 API: http://localhost:3000/api/qa
💾 数据库: /opt/gym-cs/server/data/knowledge.db
```

### 第五步：浏览器访问

```
http://你的服务器IP:3000
```

---

## 🔧 进阶配置

### 1. 使用 PM2 保持后台运行（推荐）

```bash
# 安装 PM2
npm install -g pm2

# 启动服务
cd /opt/gym-cs/server
pm2 start server.js --name gym-cs

# 设置开机自启
pm2 startup
pm2 save

# 常用命令
pm2 logs gym-cs     # 查看日志
pm2 restart gym-cs  # 重启
pm2 stop gym-cs     # 停止
```

### 2. 使用 Nginx 反向代理 + HTTPS

```bash
# 安装 Nginx
sudo apt install nginx -y

# 编辑配置
sudo nano /etc/nginx/sites-available/gym-cs
```

写入以下内容（替换 `your-domain.com` 为你的域名）：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# 启用配置
sudo ln -s /etc/nginx/sites-available/gym-cs /etc/nginx/sites-enabled/
sudo nginx -t          # 检查配置
sudo systemctl reload nginx
```

### 3. 配置 HTTPS（免费证书）

```bash
# 安装 certbot
sudo apt install certbot python3-certbot-nginx -y

# 申请证书（自动配置 Nginx）
sudo certbot --nginx -d your-domain.com

# 自动续期
sudo certbot renew --dry-run
```

### 4. 配置防火墙

```bash
# 只开放必要端口
sudo ufw allow 22     # SSH
sudo ufw allow 80     # HTTP
sudo ufw allow 443    # HTTPS
sudo ufw enable

# 不需要开放 3000 端口（Nginx 代理了）
```

---

## 📊 API 接口文档

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/qa` | 获取所有问答（支持 ?category=&search= 筛选） |
| GET | `/api/qa/:id` | 获取单条问答 |
| POST | `/api/qa` | 新增问答 |
| PUT | `/api/qa/:id` | 更新问答 |
| DELETE | `/api/qa/:id` | 删除问答 |
| POST | `/api/qa/import` | 批量导入（JSON 数组） |
| POST | `/api/match` | 智能问答匹配 |
| GET | `/api/stats` | 统计信息 |
| GET | `/api/qa/export` | 导出全部数据 |

### 智能问答匹配示例

**请求**：
```bash
curl -X POST http://localhost:3000/api/match \
  -H "Content-Type: application/json" \
  -d '{"query": "怎么办卡"}'
```

**响应**：
```json
{
  "success": true,
  "answer": "办理会员卡非常简单：...",
  "question": "如何办理健身会员卡？",
  "related": [...],
  "score": 126
}
```

---

## 💰 费用估算

| 项目 | 费用 |
|------|------|
| 阿里云 ECS（2核2G） | ¥50-100/月 |
| 域名 .com | ¥50-100/年 |
| SSL 证书 | 免费（Let's Encrypt） |
| Node.js | 免费 |
| SQLite | 免费 |
| **总计** | **约 ¥60-110/月** |

---

## 📝 日常维护

### 备份数据库
```bash
# 手动备份
cp /opt/gym-cs/server/data/knowledge.db /opt/gym-cs/backup/knowledge_$(date +%Y%m%d).db

# 设置定时备份（每天凌晨3点）
crontab -e
# 添加：0 3 * * * cp /opt/gym-cs/server/data/knowledge.db /opt/gym-cs/backup/knowledge_$(date +\%Y\%m\%d).db
```

### 更新知识库
1. 通过前端页面的知识库面板在线管理
2. 或通过 API 批量导入 JSON 文件

### 查看日志
```bash
pm2 logs gym-cs --lines 100
```

---

## ⚠️ 注意事项

1. **SQLite 不适合高并发写入**：如果同时有大量管理员编辑知识库，建议升级为 MySQL/PostgreSQL
2. **首次启动会自动建表和导入 38 条默认数据**
3. **数据文件位置**：`/opt/gym-cs/server/data/knowledge.db`，重要数据请定期备份
4. **前端支持离线降级**：服务器不可用时，自动使用浏览器缓存数据（localStorage）
