# ADB / Fastboot 工具箱

基于 Vite、TypeScript、Lit 和 Material Web 的现代 WebUSB ADB / Fastboot 工具箱。

## 运行要求

- Chrome 或 Edge 等支持 WebUSB 的 Chromium 浏览器。
- 使用 `localhost` 或 HTTPS 打开页面；WebUSB 不支持普通不安全上下文。
- ADB 模式需要在 Android 设备上开启 USB 调试并确认授权。
- Fastboot 功能需要设备已进入 Bootloader/Fastboot 模式。

windows系统需要USB驱动：https://github.com/pbatard/libwdi

## 开发

```bash
npm install
npm run dev
```

打开 Vite 输出的本地地址，通常是 `http://127.0.0.1:5173`。

## 验证

```bash
npm run test
npm run build
npm run check
```

常用检查命令：

- `npm run typecheck`：只运行 TypeScript 类型检查。
- `npm run lint`：运行 ESLint。
- `npm run format:check`：检查 Prettier 格式。
- `npm run check`：依次运行类型检查、lint、测试和生产构建。

## 文件说明

- `src/app-shell.ts`：应用壳、响应式导航、页面入口和用户反馈。
- `src/core/adb/*`：ADB 连接、shell、应用、文件、截图、logcat。
- `src/core/fastboot/*`：Fastboot WebUSB 连接、协议解析、刷入。
- `src/core/state/app-store.ts`：连接状态、任务状态、设置和日志。

## 安全提示

刷机、解锁、擦除和删除文件都可能造成数据丢失。工具对高风险命令增加了确认和路径保护，但执行前仍需确认设备、分区和文件来源。
