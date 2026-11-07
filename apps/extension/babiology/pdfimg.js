/* Fairfax Donor Exporter - PDF → 图片（pdf.js，主线程 fake worker：vendor/pdf.worker.min.js 先于 pdf.min.js 加载）
   优先提取 PDF 中嵌入的照片对象（人物肖像原图，不含页眉/文字），提取不到时回退为整页渲染。 */
(() => {
  const DEF = { maxWidth: 600, maxHeight: 800, quality: 0.8, maxImages: 2, minSide: 120, minAspect: 0.4, maxAspect: 2.5, maxPagesScan: 6, maxPagesFallback: 3 };

  const getObj = (page, name) => new Promise((res) => { try { page.objs.get(name, (o) => res(o)); } catch (e) { res(null); } });

  async function bitmapToJpeg(src, w0, h0, o) {
    const scale = Math.min(1, o.maxWidth / w0, o.maxHeight / h0);
    const w = Math.max(1, Math.round(w0 * scale)), h = Math.max(1, Math.round(h0 * scale));
    const c = new OffscreenCanvas(w, h); const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(src, 0, 0, w, h);
    const blob = await c.convertToBlob({ type: 'image/jpeg', quality: o.quality });
    return { blob, width: w, height: h };
  }

  // pdf.js 图像对象 → 可绘制源（ImageBitmap 或由像素数据构造的 canvas）
  function drawableOf(img) {
    if (img.bitmap) return img.bitmap;
    if (!img.data) return null;
    const n = img.width * img.height, d = img.data;
    const rgba = new Uint8ClampedArray(n * 4);
    if (d.length === n * 4) rgba.set(d);
    else if (d.length === n * 3) for (let i = 0, j = 0; i < n; i++, j += 3) { rgba[i * 4] = d[j]; rgba[i * 4 + 1] = d[j + 1]; rgba[i * 4 + 2] = d[j + 2]; rgba[i * 4 + 3] = 255; }
    else if (d.length === n) for (let i = 0; i < n; i++) { rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = d[i]; rgba[i * 4 + 3] = 255; }
    else return null;
    const c = new OffscreenCanvas(img.width, img.height);
    c.getContext('2d').putImageData(new ImageData(rgba, img.width, img.height), 0, 0);
    return c;
  }

  /** 返回 [{blob, width, height, source:'embedded'|'page'}] */
  async function pdfToImages(pdfBlob, opts) {
    const o = { ...DEF, ...(opts || {}) };
    const lib = window.pdfjsLib;
    if (!lib) throw new Error('pdf.js 未加载');
    const pdf = await lib.getDocument({ data: await pdfBlob.arrayBuffer() }).promise;
    const out = [];
    try {
      // 1) 提取嵌入图片（按页序），过滤掉 logo / 横幅等小图或极端比例图
      for (let p = 1; p <= Math.min(pdf.numPages, o.maxPagesScan) && out.length < o.maxImages; p++) {
        const page = await pdf.getPage(p);
        const ops = await page.getOperatorList();
        const names = [];
        for (let i = 0; i < ops.fnArray.length; i++) {
          const f = ops.fnArray[i];
          if (f === lib.OPS.paintImageXObject || f === lib.OPS.paintImageXObjectRepeat) { const n = ops.argsArray[i][0]; if (!names.includes(n)) names.push(n); }
        }
        for (const n of names) {
          if (out.length >= o.maxImages) break;
          const img = await getObj(page, n);
          if (!img || !img.width || !img.height) continue;
          const aspect = img.width / img.height;
          if (Math.min(img.width, img.height) < o.minSide || aspect < o.minAspect || aspect > o.maxAspect) continue;
          const src = drawableOf(img);
          if (!src) continue;
          out.push({ ...(await bitmapToJpeg(src, img.width, img.height, o)), source: 'embedded', page: p });
        }
      }
      // 2) 回退：整页渲染
      if (!out.length) {
        for (let p = 1; p <= Math.min(pdf.numPages, o.maxPagesFallback); p++) {
          const page = await pdf.getPage(p);
          const v1 = page.getViewport({ scale: 1 });
          const vp = page.getViewport({ scale: Math.min(o.maxWidth / v1.width, o.maxHeight / v1.height) });
          const c = new OffscreenCanvas(Math.round(vp.width), Math.round(vp.height));
          await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
          out.push({ blob: await c.convertToBlob({ type: 'image/jpeg', quality: o.quality }), width: c.width, height: c.height, source: 'page', page: p });
        }
      }
    } finally { try { await pdf.destroy(); } catch (e) { /* ignore */ } }
    return out;
  }

  window.FdePdf = { pdfToImages };
})();
