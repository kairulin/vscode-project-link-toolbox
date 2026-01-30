# Project Link Toolbox

在 VS Code 側邊欄提供「專案連結工具箱」，集中管理常用連結並快速開啟。

## 功能特色

- 側邊欄樹狀清單顯示連結，一鍵開啟
- 連結管理視窗（Webview）新增、編輯、刪除
- 支援排序：上移、下移、置頂、置底

## 使用方式

1. 開啟側邊欄的「Project Link Toolbox」視圖
2. 點擊工具列「新增」或「管理」按鈕
3. 在管理視窗中建立/整理連結

## 指令

- `project-link-toolbox.addLink`: 新增連結
- `project-link-toolbox.openLink`: 開啟連結
- `project-link-toolbox.openManager`: 開啟管理視窗
- `project-link-toolbox.editLink`: 編輯連結
- `project-link-toolbox.deleteLink`: 刪除連結
- `project-link-toolbox.moveLinkUp`: 上移連結
- `project-link-toolbox.moveLinkDown`: 下移連結
- `project-link-toolbox.moveLinkToTop`: 置頂連結
- `project-link-toolbox.moveLinkToBottom`: 置底連結

## 資料儲存

連結清單儲存在 VS Code 的 workspaceState（每個工作區獨立）。

## Release Notes

### 0.0.1

初始版本：提供側邊欄工具箱與連結管理功能。
