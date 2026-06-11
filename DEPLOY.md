# WordBase 部署说明

## 本地数据库版

```bash
python server.py
```

打开：

```text
http://127.0.0.1:4175/
```

本地默认使用 `wordbase.sqlite3`。

## Render + PostgreSQL 公网版

本目录已经包含：

- `server.py`
- `requirements.txt`
- `Procfile`
- `render.yaml`

推荐用 Render Blueprint 部署：

1. 把 `outputs/vocab-app` 作为一个 GitHub 仓库或仓库子目录提交。
2. 打开 Render，选择 **New +** → **Blueprint**。
3. 选择包含 `render.yaml` 的仓库。
4. Render 会自动创建：
   - Web 服务：`wordbase-vocab`
   - PostgreSQL 数据库：`wordbase-postgres`
5. 部署完成后，打开 Render 给出的公网网址。

Render 会自动提供 `DATABASE_URL`，服务检测到该变量后会使用 PostgreSQL。

## 手动部署参数

启动命令：

```bash
HOST=0.0.0.0 python server.py
```

环境变量：

```text
DATABASE_URL=你的 PostgreSQL 连接字符串
```

如果没有 `DATABASE_URL`，应用会退回本地 SQLite。

## 已开放班级

- `2541`：25届41班
- `2538`：25届38班
