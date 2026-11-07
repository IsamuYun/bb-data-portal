# Fairfax Donor Exporter（Chrome 插件）

在 `https://fairfaxcryobank.com/search/searchresults.aspx` 搜索结果页上，自动依次打开每位 donor 的
`donorprofile.aspx?number=XXXX` 详情页，抓取详细资料和 Adult Child Photo Set 照片集，打包成**一个 ZIP**（内含 index.html 总表 + 每位 donor 的照片），
也可导出为单个内嵌照片的 HTML 文件。

## 安装

1. 打开 Chrome，访问 `chrome://extensions/`
2. 右上角打开「开发者模式」
3. 点击「加载已解压的扩展程序」，选择本目录（含 `manifest.json`）

## 使用

1. 登录 fairfaxcryobank.com，在 Donor Search 中设置筛选条件，进入 **Search Results** 页面
2. 页面右下角会出现「Donor 采集导出」面板（若没有，点浏览器工具栏插件图标 →「打开采集面板」）
3. 选项：
   - **遍历所有分页**：自动从第 1 页翻到最后一页，收集全部 donor；取消则只采集当前页
   - **包含介绍文本**：导出 "Get to know the donor" 段落
   - **附件下载**：仅 Adult Child Photo Set（默认开启）和 Lifetime Photos（可选）。
     Childhood Photo、Silhouette、Genetic Testing、Summary Profile、Staff Impressions、Donor Essay、
     Medical Profile、Personal Profile、Personality Type 一律不抓取
   - **Photo Consent**：Adult Child Photo Set 与 Lifetime Photos 在站点上需先提交 "Photo Consent" 同意表单。
     面板中会显示站点原文，只有你勾选「我已阅读并同意」后，插件才会在抓取每位 donor 的照片集时代为提交该表单；
     未勾选时这两项会被跳过并在结果中标注。
   - **中文翻译**：勾选后，index.html 的字段名与枚举值（祖源、发色、眼色、肤色、星座、兴趣、目标、宗教等）
     用内置词典离线翻译，表格显示中文、原文灰色小字在下方。再勾选「自由文本在线翻译」并填写 Claude API Key，
     介绍段落、职业、学位、词典未覆盖的值会调用 Claude API（模型 `claude-opus-5-5`）翻译，按量计费；
     翻译结果缓存在本地，重复导出不重复计费。Key 仅保存在浏览器 chrome.storage 中，不写入导出文件。
     只翻译 profile 本身（字段、介绍段落）；附件名称与内容保持英文原样。
   - **请求间隔**：每个 donor 之间的等待时间（默认 800 ms，避免请求过快）
4. 点击「开始采集」。完成后自动下载 `donors_YYYY-MM-DD-HH-MM-SS.zip`；也可随时点「停止」，
   再点「导出 ZIP」或「导出 Excel」导出已抓到的部分

## Excel 导出

点「导出 Excel」下载 `donors_<时间>.xlsx`（独立于 ZIP）。工作表「Donors」每行一位 donor：

- 列：Donor #、童年照、成年/童年照片集 1..N、成长照片集 1..M、各字段（中文）、扩展基因检测
- 三类照片作为嵌入图片锚定在对应单元格。文件中保存的图片为等比缩放到宽 ≤ 600 px、高 ≤ 800 px、JPEG 质量 0.8，
  单元格内按 300 × 400 框显示（行高 306 磅、列宽 44），在 Excel 中拖大图片可看到 600 × 800 分辨率；
  每个照片集最多取 2 张；ZIP 中仍保留原文件
- 照片集若为 PDF，会用 pdf.js（`vendor/pdf.min.js`，本地打包）自动转换：优先提取 PDF 内嵌的照片对象
  （人物肖像原图，不含页眉文字；过滤掉小于 120 px 或比例极端的 logo / 横幅，每个 PDF 取前 2 张），提取不到时回退为整页渲染（最多 2 页）
- 首行冻结并开启自动筛选。注意：嵌入图片是锚定到单元格的浮动对象，对表格排序 / 筛选时图片不会随行移动
- 字段只保留中文译文（未开启翻译或词典未覆盖的值显示原文）

## ZIP 内容结构

```
donors_<时间>.zip
├── index.html                       总表：童年照缩略图（Base64 内嵌，不单独存文件）、全部字段、照片集链接（不含品牌/来源信息）
├── donors.json                      结构化数据（字段、介绍文本、文件清单、错误信息）
└── donors/<编号>/
    ├── Adult_Child_Photo_Set/01.jpg, 02.jpg ...   照片集（需同意 Photo Consent）
    └── Lifetime_Photos/...          （可选）
```

## 导出字段

照片、Donor #、Availability、Height、Weight、Eye Color、
Skin Tone、Hair、Blood Type、Ancestry、Ethnic Background、Degree、Occupation、Interests、Pregnancy Reported、
Photo Matching、CMV Status、Age Range at Donation、Astrological Sign、Favorite Subject、Religion、Favorite Pet、
Personal Goals、Talents/Hobbies、Get to know the donor（介绍文本）、是否 Expanded Genetic Testing。
字段列表按页面实际内容动态生成，新增字段会自动出现为新列。

## 实现说明

- `content.js`：注入搜索结果页。翻页通过点击页面自带的「下一页」按钮（站点用 AJAX 加载）；
  详情页通过同源 `fetch`（携带登录 Cookie）获取并用 `DOMParser` 解析；侧栏附件链接按名称分类下载。
  照片集：先 GET 链接，若返回同意页且用户已勾选同意，则提交表单后解析返回内容中的图片 / PDF 链接逐一下载。
- `zip.js`：无依赖的 ZIP 写入器（STORE 不压缩，UTF-8 文件名）。
- `pdfimg.js`：pdf.js 提取 / 渲染 PDF 为 JPEG（主线程 fake worker，无需 Web Worker）。
- `excel.js`：用 ExcelJS（`vendor/exceljs.min.js`，本地打包）生成 xlsx 并嵌入图片。
- `translate.js`：中英词典（字段名 + 枚举值）与翻译调度；`background.js`：Service Worker，代理 Claude API 请求
  （`POST /v1/messages`，结构化 JSON 输出，每批 40 条）。
- `popup.html/js`：工具栏弹窗，用于唤出面板。
- 仅在 `fairfaxcryobank.com` 域生效，不收集任何其他数据。

## 文件

```
manifest.json   MV3 清单
content.js      采集 / 解析 / 导出逻辑
zip.js          ZIP 打包
translate.js    中文翻译（词典 + 在线）
pdfimg.js       PDF → 图片
excel.js        Excel 导出（嵌入图片）
vendor/         exceljs.min.js, pdf.min.js, pdf.worker.min.js
background.js   Claude API 代理
panel.css       页面内面板样式
popup.html/js   工具栏弹窗
icons/          图标
```
