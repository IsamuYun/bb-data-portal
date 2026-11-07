document.getElementById('open').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const msg = document.getElementById('msg');
  if (!tab || !/fairfaxcryobank\.com\/search\/searchresults\.aspx/i.test(tab.url || '')) {
    msg.textContent = '当前标签页不是搜索结果页，请先打开 searchresults.aspx。';
    return;
  }
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'FDE_SHOW_PANEL' });
    window.close();
  } catch (e) {
    msg.textContent = '无法连接到页面脚本，请刷新搜索结果页后重试。';
  }
});
