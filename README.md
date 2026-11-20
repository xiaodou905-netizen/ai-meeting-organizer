# 墨记 · AI 会议纪要整理器

把会议原文整理成可逐条核对的摘要、决定、待办和待确认问题。在原稿里改一个人名、一处日期或一句最终结论，再点「AI 整理」，就能用同一界面对照两次抽取。

## 本地运行

在包含本 README 的目录打开终端，使用 Node.js 22.12+（22.x）或 24.x。

```sh
npm install
test -f .env || cp .env.example .env
```

在本地编辑器中打开 `.env`，填写供应商提供的密钥，然后启动：

```sh
npm run dev
```

打开终端打印的 Local 地址（默认 http://127.0.0.1:5173）。目标机器配置好环境变量后，可用 `npm install && npm run dev` 启动。没有 Key 也能打开页面、填入示例和编辑原稿，提交时会提示配置 Key。修改环境变量后重启服务。

| 变量 | 用途 |
| --- | --- |
| `LLM_API_KEY` | 必填。与所选服务端点配套的 API Key |
| `LLM_BASE_URL` | Chat Completions API 的基础路径，默认 `https://api.openai.com/v1`。填写到 API 版本或兼容接口根路径即可 |
| `LLM_MODEL` | 必须是该服务端点可调用的模型 ID，默认 `gpt-6.2-sol` |

替换为 DeepSeek、通义千问等兼容服务时，同时填写该供应商的基础路径、模型名及 Key。模型需要支持 Chat Completions 和文本回复。默认模型使用供应商要求的默认温度，其他模型按项目原定配置使用 0.1。

## Render 免费 Web Service

仓库根目录中的 `render.yaml` 会创建一个免费的 Node Web Service。构建和启动命令分别为 `npm install && npm run build`、`npm start`。生产入口 `server/index.js` 在 `0.0.0.0` 监听 Render 注入的 `PORT`，用同一端口提供静态页面、SPA 页面刷新和 `POST /api/organize`。

1. 将本项目推送到独立 GitHub 仓库，确保仓库首页可以看到 `render.yaml` 和 `package.json`。
2. 在 Render 控制台选择 **New → Blueprint**，连接仓库。首次创建时填写 `LLM_API_KEY`、`LLM_BASE_URL`（`https://api.openai.com/v1`）和 `LLM_MODEL`（`gpt-6.2-sol`）。
3. 部署完成后，打开服务页面上分配的 HTTPS 地址，填入示例并提交一次，核对页面和后端调用。国内访问情况以目标网络对这个地址的实测为准。

后端默认直接请求模型服务。Render 只需配置上述三个变量。本机 `.env` 中的代理设置仅用于本机网络。免费服务空闲 15 分钟后会休眠，首次重新访问约需一分钟唤醒，可在面试前提前打开。[Render Blueprint](https://render.com/docs/blueprint-spec) · [免费实例说明](https://render.com/docs/free)

本地模拟同一生产服务，在项目目录运行：

```sh
npm run build
npm start
```

打开 http://127.0.0.1:3000/ 。也可以用 `PORT=8080 npm start` 更改监听端口。

## 部署到 Vercel

1. 将本目录作为独立 Git 仓库推送，或推送包含它的仓库。在 Vercel 的 **Add New → Project** 导入仓库。
2. 如果仓库还包含其他项目，将 **Root Directory** 设为 `meeting-organizer`。如果仓库根目录就是本工具，保留根目录。Framework Preset 为 **Vite**，Node.js 版本可选 **24.x**。
3. 在 **Environment Variables** 设置上表变量。密钥使用服务端变量名 `LLM_API_KEY`。为需要演示的 Production 或 Preview 环境勾选对应作用域。
4. 点击 **Deploy**，打开部署生成的域名。点击「填入示例纪要」再整理，打开「显示原文依据」核对原话。更改 Vercel 环境变量后重新部署。

Vercel 从 `dist/` 提供页面，从 `api/organize.js` 提供同域的 Node Function。单独上传 `dist/` 只能运行静态界面。公开访问者提交时会消耗部署者的模型额度，面试用 Key 可单独设置供应商预算。[Vercel 的 Vite 部署文档](https://vercel.com/docs/frameworks/frontend/vite)

## 数据流与审计入口

浏览器将 `{"text":"会议原文"}` 提交到同源 `POST /api/organize`。后端使用服务器环境变量向配置的模型服务发送原文，完成结构校验后才把四个板块返回给页面。输入和结果仅保存在当前页面的内存中。单次输入上限为 20,000 个 Unicode 码点。本项目的 Web 服务不记录会议正文或模型回复，供应商的数据保留策略由所选服务决定。

- `lib/prompt.js` 集中维护通用提示词、输出字段和验证逻辑。提示词要求沿讨论顺序追踪最终结论，区分提议、审批、否决与已拍板的范围。会议原文作为数据传入。
- 每项决定、待办和待确认问题都要引用原文。后端核对引文能否在本次输入中找到。负责人和截止日期跟随各自的任务，缺失时显示「待确认」。摘要在服务端限制为 150 个 Unicode 码点。超长时优先保留完整句子，缺少句末标点时在限制内截断并添加省略号。
- `api/organize.js` 管理真实模型调用与错误处理。每次有效提交都重新请求模型，`gpt-6.2-sol` 只接受默认温度（1），服务端调用该模型时省略 `temperature`，其他模型发送 0.1。优先请求 JSON 模式，供应商明确提示不支持该参数时，改用提示词约束 JSON。遇到格式或引文错误，带校验反馈重试一次；仍不合格则返回可重试的错误。模型请求共用 100 秒时限。页面打开依据开关后，可人工判断原话是否足以支撑提炼出的结论。
- `fixtures/meeting.txt` 是随附的虚构面试输入，只包含原文。页面按钮和验收脚本使用同一份输入。

## 验收

配置好 `.env`，在项目根目录运行：

```sh
npm run verify
```

脚本向本项目的接口提交原始样例，再修改负责人、日期和上线结论并重复提交，通过退出码报告验收结果。原始样例中，王敏应在 4 月 15 日前联系门店，陈浩仅负责说明草稿，交稿时间待确认。第二轮将对接人替换为林妍、对接期限替换为 5 月 9 日，并正式确定 5 月 12 日上线。两轮都会消耗模型额度。语义检查针对随附样例，运行时的整理接口不使用样例断言。遇到模型内容差异时，可结合返回条目和附带的原文依据核对失败原因。

检查生产构建及本地预览：

```sh
npm run build
npm run preview
```

本地预览与开发服务共用 Vercel 的 API 实现。
