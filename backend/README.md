# PetWorld Backend (Isolated)

这个目录是和前端隔离的后端服务，先按模块逐步实现并单独测试，再接入小程序前端。

## 运行方式

在仓库根目录执行：

```bash
npm run backend:dev
```

默认监听 `3100` 端口，可通过 `BACKEND_PORT` 覆盖。

## 测试

```bash
npm run backend:test
```

## 当前已完成模块

### 1) 用户与认证模块（v1）

已实现接口：

- `POST /api/v1/auth/wechat-login`
- `POST /api/v1/auth/refresh`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/logout`
- `GET /api/health`

当前存储层是内存版（`InMemory`），用于先把接口契约和流程跑通。下一步会替换成真实数据库实现。

### 2) 纪念业务数据模块（v1）

已实现接口（需要 `Bearer accessToken`）：

- `GET /api/v1/memorial/pets`
- `POST /api/v1/memorial/pets`
- `GET /api/v1/memorial/pets/:petId`
- `PATCH /api/v1/memorial/pets/:petId`
- `PUT /api/v1/memorial/pets/:petId/stories`
- `GET /api/v1/memorial/pets/:petId/stories`
- `POST /api/v1/memorial/pets/:petId/interactions`
- `GET /api/v1/memorial/pets/:petId/interactions`
- `GET /api/v1/memorial/pets/:petId/timeline?limit=20`

覆盖能力：

- 宠物档案的创建、读取、更新
- 回忆故事的整体替换和查询
- 互动轨迹写入（支持分值变更）和轨迹查询
- 故事与互动的时间线聚合输出

### 3) 社交内容模块（v1）

已实现接口（需要 `Bearer accessToken`）：

- `GET /api/v1/social/whispers`
- `POST /api/v1/social/whispers`
- `POST /api/v1/social/whispers/:whisperId/likes/toggle`
- `GET /api/v1/social/whispers/:whisperId/comments`
- `POST /api/v1/social/whispers/:whisperId/comments`
- `POST /api/v1/social/friends/requests`
- `GET /api/v1/social/friends/requests`
- `POST /api/v1/social/friends/requests/:requestId/respond`
- `GET /api/v1/social/friends`

覆盖能力：

- 耳语内容发布与公共流读取
- 耳语点赞切换
- 耳语评论写入与读取
- 好友申请发起、处理、列表查询
- 好友关系查询

### 4) 资产交易模块（v1）

已实现接口（需要 `Bearer accessToken`）：

- `GET /api/v1/assets/catalog`
- `GET /api/v1/assets/wallet`
- `GET /api/v1/assets/wallet/transactions`
- `GET /api/v1/assets/inventory`
- `GET /api/v1/assets/orders`
- `POST /api/v1/assets/orders/recharge`
- `POST /api/v1/assets/orders/:orderId/pay`
- `POST /api/v1/assets/purchases`

覆盖能力：

- 商品目录读取
- 金币钱包与账本查询
- 充值订单创建与模拟支付到账
- 金币消费购买道具
- 库存与订单流水查询

### 5) AI 代理与策略模块（v1）

已实现接口（需要 `Bearer accessToken`）：

- `GET /api/v1/ai/providers`
- `GET /api/v1/ai/routes`
- `GET /api/v1/ai/logs`
- `GET /api/v1/ai/rate-limit`
- `POST /api/v1/ai/chat`
- `POST /api/v1/ai/images`

覆盖能力：

- 统一 AI provider 元数据管理
- 文本/图片模型路由解析
- 每用户基础限流
- AI 调用日志与成本估算
- 密钥治理元数据暴露（只返回 env 名称和是否配置，不返回真实密钥）
- 文本与通用图片能力已切到真实上游代理

运行要求：

- `OPENAI_API_KEY`
- 可选 `AI_BASE_URL`
- 可选 `AI_CHAT_MODEL`
- 可选 `AI_IMAGE_MODEL`

### 6) 图像任务模块（v1）

已实现接口（需要 `Bearer accessToken`）：

- `POST /api/v1/image-tasks/uploads`
- `POST /api/v1/image-tasks/tasks`
- `GET /api/v1/image-tasks/tasks`
- `GET /api/v1/image-tasks/tasks/:taskId`
- `GET /api/v1/image-tasks/tasks/:taskId/result`

覆盖能力：

- 真实图片 `data URL` 上传
- 单任务最多 4 张参考图
- 像素图生成任务创建
- `queued -> processing -> completed` 异步状态流
- 结果轮询与统一尺寸输出元数据
- 已接入真实 `fal-ai/flux-2/edit` 队列调用

运行要求：

- `FAL_KEY`
- 可选 `FAL_QUEUE_BASE_URL`
- 可选 `FAL_MODEL_ID` 或 `FAL_FLUX_2_MODEL`
- 可选 `FAL_POLL_INTERVAL_MS`
- 可选 `FAL_TIMEOUT_MS`

### 7) 调度与消息模块（v1）

已实现接口（需要 `Bearer accessToken`）：

- `POST /api/v1/scheduling/jobs`
- `GET /api/v1/scheduling/jobs`
- `GET /api/v1/scheduling/jobs/:jobId`
- `GET /api/v1/scheduling/jobs/:jobId/executions`
- `POST /api/v1/scheduling/jobs/:jobId/retry`
- `GET /api/v1/scheduling/messages`
- `GET /api/v1/scheduling/dead-letters`
- `GET /api/v1/scheduling/metrics`

覆盖能力：

- 队列任务创建与延迟执行
- 自动轮询调度执行
- 失败重试与退避
- 死信队列
- 手动重试死信任务
- 执行日志与消息投递记录
- 用户维度任务指标统计

运行要求：

- 可选 `SCHEDULING_POLL_INTERVAL_MS`

## 模块拆分路线（按你的需求）

1. 用户与认证模块（当前）
2. 纪念业务数据模块（宠物档案/故事/互动轨迹）
3. 社交内容模块（耳语/评论点赞/好友）
4. 资产交易模块（金币/库存/订单）
5. AI 代理与策略模块（路由/限流/成本/密钥治理）
6. 图像任务模块（原图上传、二维像素画异步生成）
7. 调度与消息模块（队列、定时任务、重试补偿）
8. 运营风控模块（审核、审计、告警）

### 8) 运营与监控模块（v1）

已实现接口（需要 `Bearer accessToken`）：

- `GET /api/v1/operations/settings`
- `PATCH /api/v1/operations/settings/:key`
- `GET /api/v1/operations/audit-logs`
- `GET /api/v1/operations/alerts`
- `POST /api/v1/operations/alerts/:alertId/resolve`
- `GET /api/v1/operations/metrics`

覆盖能力：

- 动态运营配置读取与更新
- 全局 API 审计日志
- 基础请求指标统计
- AI / 图像任务 / 调度死信告警
- 告警状态处理

运行要求：

- 无额外必填环境变量
