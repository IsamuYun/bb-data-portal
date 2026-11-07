/* Fairfax Donor Exporter - Excel 导出（ExcelJS）
   每行一位 donor；童年照 / Adult Child Photo Set / Lifetime Photos 作为嵌入图片放在多列；字段只保留中文译文。 */
(() => {
  const MAX_W = 600, MAX_H = 800;   // 保存到 xlsx 的图片分辨率：宽 ≤ 600px、高 ≤ 800px（等比）
  const BOX_W = 300, BOX_H = 400;   // 单元格内显示框：宽 ≤ 300px、高 ≤ 400px（Excel 中可拖大查看原分辨率）
  const JPEG_Q = 0.8;
  const PER_SET = 2;                // 每个照片集最多取 2 张
  const IMG_COL_WIDTH = 44;         // 图片列宽（字符，约 310px）
  const IMG_ROW_HEIGHT = 306;       // 含图片的行高（磅，约 408px）

  // 缩放图片：返回 {buffer, width, height, extension}；浏览器外或失败时回退原图
  async function shrink(blob) {
    try {
      if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas === 'undefined') throw new Error('no canvas');
      const bmp = await createImageBitmap(blob);
      const scale = Math.min(1, MAX_W / bmp.width, MAX_H / bmp.height);
      const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
      const canvas = new OffscreenCanvas(w, h);
      canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
      bmp.close?.();
      const out = await canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_Q });
      return { buffer: await out.arrayBuffer(), width: w, height: h, extension: 'jpeg' };
    } catch (e) {
      const ext = /png/.test(blob.type) ? 'png' : /gif/.test(blob.type) ? 'gif' : 'jpeg';
      return { buffer: await blob.arrayBuffer(), width: 0, height: 0, extension: ext };
    }
  }

  // 显示尺寸：按 300x400 框等比缩小（文件里保存的仍是 600x800 分辨率）
  function fitBox(w, h) {
    if (!w || !h) return { width: BOX_W, height: BOX_H };
    const s = Math.min(1, BOX_W / w, BOX_H / h);
    return { width: Math.round(w * s), height: Math.round(h * s) };
  }

  /**
   * donors: content.js 的 state.donors（d.number, d.fields, d.zh, d.essay, d.thumb(Blob), d.files[{kind:'photoset', label, path, blob}], d.expandedGenetic, d.errors）
   * opts: { fixed: string[], translateField: fn, onProgress: fn }
   */
  async function buildWorkbookBlob(donors, opts) {
    const ExcelJS = window.ExcelJS;
    if (!ExcelJS) throw new Error('ExcelJS 未加载');
    const tf = opts.translateField || (x => x);
    const fixed = opts.fixed || [];
    const dyn = [];
    donors.forEach(d => Object.keys(d.fields || {}).forEach(k => { if (!fixed.includes(k) && !dyn.includes(k)) dyn.push(k); }));
    const fieldCols = [...fixed, ...dyn];

    // 照片集文件 → 图片列表：JPG/PNG 直接用；PDF 先用 pdf.js 提取嵌入照片（提取不到则整页渲染），结果缓存在 f.images
    async function imagesOf(d, label) {
      const files = (d.files || []).filter(f => f.kind === 'photoset' && f.label === label && f.blob);
      const imgs = [];
      for (const f of files) {
        if (imgs.length >= PER_SET) break;
        if (/^image\//.test(f.blob.type)) { imgs.push(f.blob); continue; }
        if (/pdf/.test(f.blob.type) || /\.pdf$/i.test(f.path)) {
          if (!f.images) {
            try { f.images = window.FdePdf ? await FdePdf.pdfToImages(f.blob, { maxWidth: MAX_W, maxHeight: MAX_H, quality: JPEG_Q, maxImages: PER_SET }) : []; }
            catch (e) { f.images = []; (d.errors = d.errors || []).push(`${label} PDF 转图失败: ${e.message}`); }
          }
          f.images.forEach(im => imgs.push(im.blob));
        }
      }
      return imgs.slice(0, PER_SET);
    }
    for (let i = 0; i < donors.length; i++) {
      opts.onProgress?.(`正在转换照片 ${i + 1}/${donors.length}…`);
      donors[i]._adultImgs = await imagesOf(donors[i], 'Adult Child Photo Set');
      donors[i]._lifeImgs = await imagesOf(donors[i], 'Lifetime Photos');
    }
    const nAdult = Math.max(0, ...donors.map(d => d._adultImgs.length));
    const nLife = Math.max(0, ...donors.map(d => d._lifeImgs.length));

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Donor Exporter';
    const ws = wb.addWorksheet('Donors', { views: [{ state: 'frozen', ySplit: 1 }] });

    // 表头
    const headers = ['Donor #', '童年照'];
    for (let i = 1; i <= nAdult; i++) headers.push(`成年/童年照片集 ${i}`);
    for (let i = 1; i <= nLife; i++) headers.push(`成长照片集 ${i}`);
    fieldCols.forEach(k => headers.push(tf(k)));
    headers.push(tf('Expanded Genetic Testing'));
    ws.addRow(headers);
    const head = ws.getRow(1);
    head.font = { bold: true }; head.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }; head.height = 30;
    head.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F5F9' } }; c.border = { bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } } }; });

    const imgColStart = 2;                       // B 列起为图片列（1-based）
    const imgColCount = 1 + nAdult + nLife;
    const fieldColStart = imgColStart + imgColCount;

    // 列宽
    ws.getColumn(1).width = 10;
    for (let c = imgColStart; c < fieldColStart; c++) ws.getColumn(c).width = IMG_COL_WIDTH;
    fieldCols.forEach((k, i) => { ws.getColumn(fieldColStart + i).width = /Interests|Goals|Hobbies|Subject|Ethnic/i.test(k) ? 32 : 16; });
    ws.getColumn(headers.length).width = 12;

    // 数据行
    for (let i = 0; i < donors.length; i++) {
      const d = donors[i];
      opts.onProgress?.(`正在生成 Excel ${i + 1}/${donors.length}…`);
      const vals = [d.number, ''];
      for (let k = 0; k < nAdult + nLife; k++) vals.push('');
      fieldCols.forEach(k => vals.push((d.zh?.fields?.[k]) || d.fields?.[k] || ''));
      vals.push(d.expandedGenetic ? '是' : '否');
      const row = ws.addRow(vals);
      const rowIdx = row.number;
      row.alignment = { vertical: 'top', wrapText: true };
      row.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell(1).font = { bold: true };

      // 图片：童年照 + 两类照片集
      const images = [{ col: imgColStart, blob: d.thumb }];
      d._adultImgs.slice(0, nAdult).forEach((b, j) => images.push({ col: imgColStart + 1 + j, blob: b }));
      d._lifeImgs.slice(0, nLife).forEach((b, j) => images.push({ col: imgColStart + 1 + nAdult + j, blob: b }));
      let hasImg = false;
      for (const im of images) {
        if (!im.blob) continue;
        const { buffer, width, height, extension } = await shrink(im.blob);
        const id = wb.addImage({ buffer, extension });
        const ext = fitBox(width, height);
        // tl 为 0-based 坐标；略微内缩避免压住边框
        ws.addImage(id, { tl: { col: im.col - 1 + 0.05, row: rowIdx - 1 + 0.05 }, ext, editAs: 'oneCell' });
        hasImg = true;
      }
      row.height = hasImg ? IMG_ROW_HEIGHT : 18;
    }
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };

    const buf = await wb.xlsx.writeBuffer();
    return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  window.FdeExcel = { buildWorkbookBlob, shrink };
})();
