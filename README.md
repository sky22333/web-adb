## ADB / Fastboot 网页工具箱

在浏览器中通过 WebUSB 直接控制 Android 设备，无需安装本地 adb / fastboot。基于 Vite + TypeScript + Lit + Material Web。

## 功能

- **设备概览**：型号、系统版本、电量等属性，一键重启 / 进 Bootloader。
- **ADB Shell**：执行命令并查看完整输出。
- **应用管理**：安装 APK（流式上传）、启停、清数据、卸载、提取 APK。
- **文件管理**：浏览、上传（拖拽）、下载、删除、新建目录。
- **截图与按键**：设备截图、常用 keyevent。
- **实时日志**：流式 logcat，支持级别与关键字过滤。
- **Fastboot**：批量 / 单镜像刷入、原始命令终端、常用与危险操作。

## 运行要求

- Chrome / Edge 等支持 WebUSB 的 Chromium 浏览器。
- 通过 `localhost` 或 HTTPS 打开（WebUSB 不支持非安全上下文）。
- ADB：设备开启 USB 调试并授权。
- Fastboot：设备进入 Bootloader / Fastboot 模式。
- Windows 需安装 USB 驱动：[libwdi / Zadig](https://github.com/pbatard/libwdi)。

## 快速开始

```bash
npm install
npm run dev
```

## 脚本

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 生产构建 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run lint` | ESLint 检查 |
| `npm run test` | 运行单元测试 |
| `npm run check` | 依次执行：类型检查 + lint + 测试 + 构建 |

## 项目结构

```
src/
├─ app-shell.ts      布局、导航、路由、连接入口
├─ pages/            各功能页面组件
├─ components/       可复用组件（拖拽上传、Material 注册）
├─ core/
│  ├─ adb/           ADB 连接、shell、应用、文件、截图、logcat
│  ├─ fastboot/      Fastboot 连接、协议、刷入
│  ├─ state/         全局状态（连接、任务、设置、日志）
│  ├─ ui/            Toast 与确认框
│  └─ utils/         工具函数
└─ styles/           全局样式与组件共享样式
```

## 安全提示

刷机、解锁、擦除、删除文件均可能导致数据丢失。工具对高风险命令做了二次确认与路径保护，但执行前请务必确认设备、分区与文件来源。
