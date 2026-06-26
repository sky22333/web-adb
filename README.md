## ADB / Fastboot 网页工具箱

在浏览器中通过 WebUSB 直接控制 Android 设备，无需安装本地 adb / fastboot。

在线地址：https://blog.52013120.xyz/web-adb/

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
npm i
npm run dev
```

## 安全提示

刷机、解锁、擦除、删除文件均可能导致数据丢失。执行前请务必仔细确认设备、命令、分区与文件来源。
