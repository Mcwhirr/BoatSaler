# Three.js 学习用 Go 后端

一个最小可用的 Go 后端，用于给 Three.js 前端提供练习数据。

## 接口

- `GET /health`：健康检查
- `GET /api/time`：当前服务器时间
- `GET /api/scene/basic`：固定场景数据
- `GET /api/scene/random?count=10`：随机场景数据（`count` 范围 1~50）

## 启动

```bash
go run .
```

默认地址：`http://localhost:8080`

## Vite 前端（Three.js）

前端工程目录：`frontend`

```bash
cd frontend
npm install
npm run dev
```

默认前端地址：`http://localhost:5173`

前端会请求后端接口：`http://localhost:8080/api/scene/basic` 与 `http://localhost:8080/api/scene/random`

## 前端调用示例（Three.js）

```js
const res = await fetch('http://localhost:8080/api/scene/basic');
const sceneData = await res.json();
console.log(sceneData);
```
