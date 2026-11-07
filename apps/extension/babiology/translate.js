/* Fairfax Donor Exporter - 中文翻译模块
   1) 内置词典：字段名与枚举值离线翻译（祖源、发色、眼色、肤色、星座、兴趣…）
   2) 在线翻译：词典覆盖不到的自由文本（介绍段落、职业、学位、族裔组合…）通过 background.js 调用 Claude API */
(() => {
  const FIELD = {
    'Donor Category': '捐献者类别', 'Availability': '库存状态',
    'Height': '身高', 'Weight': '体重', 'Eye Color': '眼睛颜色', 'Skin Tone': '肤色', 'Hair': '头发', 'Blood Type': '血型',
    'Ancestry': '祖源', 'Ethnic Background': '族裔背景', 'Degree': '学位', 'Occupation': '职业', 'Interests': '兴趣',
    'Pregnancy Reported': '已报告怀孕', 'Photo Matching': '照片匹配', 'CMV Status': 'CMV 状态',
    'Age Range at Donation': '捐献时年龄段', 'Astrological Sign': '星座', 'Favorite Subject': '喜欢的科目',
    'Religion': '宗教', 'Favorite Pet': '喜欢的宠物', 'Personal Goals': '个人目标', 'Talents/Hobbies': '才艺/爱好',
    'Category': '类别', 'Eyes': '眼睛', 'Adult Photos': '成年照片',
    'Childhood Photo': '童年照', 'Silhouette': '剪影', 'Adult Child Photo Set': '成年/童年照片集', 'Lifetime Photos': '成长照片集',
    'Genetic Testing': '基因检测', 'Summary Profile': '概要档案', 'Staff Impressions': '工作人员印象', 'Donor Essay': '捐献者自述',
    'Medical Profile': '医疗档案', 'Personal Profile': '个人档案', 'Personality Type': '性格类型',
    'Get to know the donor': '了解捐献者', 'Expanded Genetic Testing': '扩展基因检测',
  };
  const VALUE = {
    // 类别 / 状态
    'ID': '开放身份 (ID)', 'Non-ID': '匿名 (Non-ID)', 'Anonymous': '匿名', 'ID Option': '可选开放身份', 'Open ID': '开放身份',
    'Active': '有库存', 'Inactive': '无库存', 'Limited': '库存有限', 'Sold Out': '已售罄', 'Available': '可购买', 'Unavailable': '不可购买',
    'Yes': '是', 'No': '否', 'Positive': '阳性', 'Negative': '阴性', 'None': '无', 'Other': '其他', 'N/A': '不适用', 'Unknown': '未知',
    // 祖源 / 族裔
    'Caucasian': '白人', 'Multi': '混血', 'Multi-Racial': '混血', 'Mixed': '混血', 'Latino': '拉丁裔', 'Hispanic': '西班牙裔', 'Asian': '亚裔',
    'African American': '非裔美国人', 'African': '非裔', 'Black': '黑人', 'Middle Eastern': '中东裔', 'East Indian': '印度裔', 'South Asian': '南亚裔',
    'Native American': '美洲原住民', 'Pacific Islander': '太平洋岛民', 'Jewish': '犹太裔', 'Ashkenazi Jewish': '阿什肯纳兹犹太裔', 'Sephardic Jewish': '塞法迪犹太裔',
    'German': '德国', 'Scottish': '苏格兰', 'English': '英格兰', 'Irish': '爱尔兰', 'British': '英国', 'Welsh': '威尔士', 'French': '法国', 'Italian': '意大利',
    'Swedish': '瑞典', 'Norwegian': '挪威', 'Danish': '丹麦', 'Finnish': '芬兰', 'Dutch': '荷兰', 'Belgian': '比利时', 'Swiss': '瑞士', 'Austrian': '奥地利',
    'Polish': '波兰', 'Russian': '俄罗斯', 'Ukrainian': '乌克兰', 'Czech': '捷克', 'Slovak': '斯洛伐克', 'Hungarian': '匈牙利', 'Romanian': '罗马尼亚',
    'Greek': '希腊', 'Spanish': '西班牙', 'Portuguese': '葡萄牙', 'Lithuanian': '立陶宛', 'Croatian': '克罗地亚', 'Serbian': '塞尔维亚', 'Armenian': '亚美尼亚',
    'Chinese': '中国', 'Japanese': '日本', 'Korean': '韩国', 'Vietnamese': '越南', 'Filipino': '菲律宾', 'Thai': '泰国', 'Indian': '印度', 'Pakistani': '巴基斯坦',
    'Taiwanese': '台湾', 'Indonesian': '印度尼西亚', 'Malaysian': '马来西亚', 'Cambodian': '柬埔寨', 'Laotian': '老挝', 'Hmong': '苗族',
    'Mexican': '墨西哥', 'Puerto Rican': '波多黎各', 'Cuban': '古巴', 'Colombian': '哥伦比亚', 'Brazilian': '巴西', 'Peruvian': '秘鲁', 'Salvadoran': '萨尔瓦多',
    'Guatemalan': '危地马拉', 'Dominican': '多米尼加', 'Venezuelan': '委内瑞拉', 'Argentinian': '阿根廷', 'Chilean': '智利', 'Honduran': '洪都拉斯',
    'Nigerian': '尼日利亚', 'Ethiopian': '埃塞俄比亚', 'Ghanaian': '加纳', 'Kenyan': '肯尼亚', 'Egyptian': '埃及', 'Moroccan': '摩洛哥',
    'Lebanese': '黎巴嫩', 'Iranian': '伊朗', 'Persian': '波斯', 'Turkish': '土耳其', 'Israeli': '以色列', 'Syrian': '叙利亚', 'Iraqi': '伊拉克',
    'American': '美国', 'Canadian': '加拿大', 'Australian': '澳大利亚', 'European': '欧洲', 'Scandinavian': '斯堪的纳维亚', 'Cherokee': '切罗基',
    // 头发
    'Brown': '棕色', 'Black': '黑色', 'Blond': '金色', 'Blonde': '金色', 'Red': '红色', 'Auburn': '赤褐色', 'Dark Brown': '深棕色', 'Light Brown': '浅棕色',
    'Dirty Blond': '深金色', 'Strawberry Blond': '草莓金', 'Sandy': '沙色', 'Gray': '灰色', 'Grey': '灰色',
    'Straight': '直发', 'Wavy': '波浪', 'Curly': '卷发', 'Kinky': '细卷', 'Fine': '细软', 'Thick': '浓密', 'Thin': '稀疏', 'Bald': '光头',
    // 眼睛
    'Blue': '蓝色', 'Green': '绿色', 'Hazel': '淡褐色', 'Amber': '琥珀色', 'Blue-Green': '蓝绿色', 'Blue/Green': '蓝绿色', 'Gray-Blue': '灰蓝色', 'Green/Brown': '绿棕色',
    // 肤色
    'Light': '浅色', 'Fair': '白皙', 'Medium': '中等', 'Olive': '橄榄色', 'Tan': '小麦色', 'Dark': '深色', 'Light/Medium': '浅至中等', 'Medium/Dark': '中等至深色',
    // 星座
    'Aries': '白羊座', 'Taurus': '金牛座', 'Gemini': '双子座', 'Cancer': '巨蟹座', 'Leo': '狮子座', 'Virgo': '处女座', 'Libra': '天秤座',
    'Scorpio': '天蝎座', 'Sagittarius': '射手座', 'Capricorn': '摩羯座', 'Aquarius': '水瓶座', 'Pisces': '双鱼座',
    // 宗教
    'Christian': '基督教', 'Catholic': '天主教', 'Protestant': '新教', 'Baptist': '浸信会', 'Lutheran': '路德宗', 'Methodist': '卫理公会', 'Presbyterian': '长老会',
    'Episcopalian': '圣公会', 'Mormon': '摩门教', 'Orthodox': '东正教', 'Muslim': '伊斯兰教', 'Hindu': '印度教', 'Buddhist': '佛教', 'Agnostic': '不可知论',
    'Atheist': '无神论', 'Spiritual': '有灵性信仰', 'Non-denominational': '无宗派', 'Non-Denominational': '无宗派',
    // 宠物
    'Dog': '狗', 'Cat': '猫', 'Bird': '鸟', 'Fish': '鱼', 'Reptile': '爬行动物', 'Horse': '马', 'Rabbit': '兔子', 'Hamster': '仓鼠', 'Turtle': '乌龟', 'Snake': '蛇',
    // 科目
    'Arts': '艺术', 'Art': '艺术', 'History': '历史', 'Languages': '语言', 'Psychology': '心理学', 'Technology': '技术', 'Natural Science': '自然科学',
    'Science': '科学', 'Math': '数学', 'Mathematics': '数学', 'Biology': '生物', 'Chemistry': '化学', 'Physics': '物理', 'Literature': '文学',
    'Social Studies': '社会研究', 'Social Science': '社会科学', 'Business': '商业', 'Economics': '经济学', 'Philosophy': '哲学', 'Engineering': '工程',
    'Computer Science': '计算机科学', 'Physical Education': '体育', 'Music': '音乐', 'Drama': '戏剧', 'Theater': '戏剧', 'Geography': '地理', 'Political Science': '政治学',
    // 兴趣 / 才艺
    'Cooking': '烹饪', 'Film': '电影', 'Movies': '电影', 'Football': '橄榄球', 'Soccer': '足球', 'Golf': '高尔夫', 'Poker': '扑克', 'Running': '跑步',
    'Video Production': '视频制作', 'Writing': '写作', 'Reading': '阅读', 'Travel': '旅行', 'Traveling': '旅行', 'Hiking': '徒步', 'Camping': '露营',
    'Basketball': '篮球', 'Baseball': '棒球', 'Tennis': '网球', 'Swimming': '游泳', 'Cycling': '骑行', 'Biking': '骑行', 'Skiing': '滑雪', 'Snowboarding': '单板滑雪',
    'Surfing': '冲浪', 'Fishing': '钓鱼', 'Hunting': '狩猎', 'Gaming': '电子游戏', 'Video Games': '电子游戏', 'Chess': '国际象棋', 'Photography': '摄影',
    'Painting': '绘画', 'Drawing': '素描', 'Singing': '唱歌', 'Dancing': '舞蹈', 'Guitar': '吉他', 'Piano': '钢琴', 'Drums': '鼓', 'Theatre': '戏剧',
    'Weightlifting': '举重', 'Weight Lifting': '举重', 'Fitness': '健身', 'Yoga': '瑜伽', 'Martial Arts': '武术', 'Boxing': '拳击', 'Wrestling': '摔跤',
    'Volleyball': '排球', 'Hockey': '冰球', 'Lacrosse': '长曲棍球', 'Rugby': '橄榄球(英式)', 'Track': '田径', 'Track and Field': '田径', 'Rock Climbing': '攀岩',
    'Gardening': '园艺', 'Woodworking': '木工', 'Crafts': '手工', 'Sculpture': '雕塑', 'Acting': '表演', 'Comedy': '喜剧', 'Volunteering': '志愿服务',
    'Sports': '运动', 'Outdoors': '户外', 'Animals': '动物', 'Cars': '汽车', 'Motorcycles': '摩托车', 'Boating': '划船', 'Sailing': '帆船', 'Skateboarding': '滑板',
    'Meditation': '冥想', 'Languages': '语言', 'Investing': '投资', 'Collecting': '收藏', 'Board Games': '桌游', 'Puzzles': '解谜', 'Baking': '烘焙',
    // 个人目标
    'Community Service': '社区服务', 'Financial Security': '经济安全', 'Further Education': '继续深造', 'Politics': '政治', 'Success': '成功',
    'To Be Happy': '幸福快乐', 'To Help People': '帮助他人', 'Improve Environment': '改善环境', 'Marriage/Family': '婚姻/家庭', 'Marriage': '婚姻', 'Family': '家庭',
    'Religious Growth': '宗教成长', 'Travel the World': '环游世界', 'Career': '事业', 'Career Advancement': '事业发展', 'Home Ownership': '拥有住房',
    // 常见职业 / 学位（其余交给在线翻译）
    'Student': '学生', 'Graduate Student': '研究生', 'Medical Student': '医学生', 'Law Student': '法学生', 'Engineer': '工程师', 'Software Engineer': '软件工程师',
    'Manager': '经理', 'Teacher': '教师', 'Professor': '教授', 'Physician': '医生', 'Doctor': '医生', 'Nurse': '护士', 'Lawyer': '律师', 'Attorney': '律师',
    'Accountant': '会计', 'Analyst': '分析师', 'Consultant': '顾问', 'Sales': '销售', 'Salesman': '销售员', 'Entrepreneur': '创业者', 'Researcher': '研究员',
    'Scientist': '科学家', 'Musician': '音乐人', 'Artist': '艺术家', 'Writer': '作家', 'Chef': '厨师', 'Pilot': '飞行员', 'Firefighter': '消防员', 'Police Officer': '警察',
    'Real Estate Agent': '房地产经纪人', 'Realtor': '房地产经纪人', 'Realtor License': '房地产经纪执照', 'Personal Trainer': '私人教练', 'Military': '军人',
    'Bachelor': '学士', "Bachelor's": '学士', 'BA': '文学学士 (BA)', 'BS': '理学学士 (BS)', 'BBA': '工商管理学士', 'BFA': '美术学士', 'MA': '文学硕士 (MA)', 'MS': '理学硕士 (MS)',
    'MBA': '工商管理硕士 (MBA)', 'PhD': '博士 (PhD)', 'MD': '医学博士 (MD)', 'JD': '法学博士 (JD)', 'Associate': '副学士', "Associate's": '副学士', 'High School': '高中',
    'High School Diploma': '高中文凭', 'Some College': '大学肄业', "Master's": '硕士', 'Doctorate': '博士', 'Film Studies': '电影研究', 'Business Administration': '工商管理',
    'Finance': '金融', 'Marketing': '市场营销', 'Nursing': '护理', 'Education': '教育', 'Communications': '传播学', 'Kinesiology': '运动学', 'Criminal Justice': '刑事司法',
    'Health': '健康', 'Personal Growth': '个人成长', 'Fame': '名望', 'Wealth': '财富', 'Retirement': '退休', 'Start a Business': '创业', 'Own a Business': '创业',
  };
  const lower = (o) => { const m = new Map(); Object.keys(o).forEach(k => m.set(k.toLowerCase(), o[k])); return m; };
  const FIELD_L = lower(FIELD), VALUE_L = lower(VALUE);
  const NO_TRANSLATE = new Set(['Height', 'Weight', 'Blood Type', 'Age Range at Donation', 'Donor Brand']);

  function translateField(name) { return FIELD_L.get((name || '').trim().toLowerCase()) || name; }

  // 用词典翻译一个枚举型值；返回 {zh, complete}。complete=false 表示有词典没覆盖的词
  function translateValueByDict(field, value) {
    if (!value) return { zh: '', complete: true };
    if (NO_TRANSLATE.has(field)) return { zh: value, complete: true };
    const whole = VALUE_L.get(value.trim().toLowerCase());
    if (whole) return { zh: whole, complete: true };
    let complete = true;
    const zh = value.replace(/[^,\/()]+/g, (seg) => {
      const t = seg.trim(); if (!t) return seg;
      const hit = VALUE_L.get(t.toLowerCase());
      if (hit) return seg.replace(t, hit);
      // "English-German-Swedish" 这类用 - 连接的族裔
      if (t.includes('-')) { let ok = true; const parts = t.split('-').map(p => { const h = VALUE_L.get(p.trim().toLowerCase()); if (!h) ok = false; return h || p; }); if (ok) return seg.replace(t, parts.join('-')); }
      if (/^[\d\s.'"%()+-]+$/.test(t)) return seg;
      complete = false; return seg;
    });
    return { zh, complete };
  }

  // ---- 在线翻译（通过 background service worker 调 Claude API）----
  const cache = new Map(); // src -> zh（本次会话）
  async function loadCache() { try { const o = await chrome.storage.local.get('fdeTrCache'); Object.entries(o.fdeTrCache || {}).forEach(([k, v]) => cache.set(k, v)); } catch (e) { /* ignore */ } }
  async function saveCache() { try { const o = {}; cache.forEach((v, k) => { o[k] = v; }); await chrome.storage.local.set({ fdeTrCache: o }); } catch (e) { /* ignore */ } }

  async function translateOnline(texts, opts) {
    const todo = [...new Set(texts.filter(t => t && !cache.has(t)))];
    for (let i = 0; i < todo.length; i += 40) {
      const batch = todo.slice(i, i + 40);
      opts.onProgress?.(`在线翻译 ${Math.min(i + 40, todo.length)}/${todo.length} 条…`);
      const res = await chrome.runtime.sendMessage({ type: 'FDE_TRANSLATE', texts: batch, apiKey: opts.apiKey, model: opts.model });
      if (!res || !res.ok) throw new Error(res?.error || '翻译请求失败');
      (res.items || []).forEach(it => { if (it.src && it.zh) cache.set(it.src, it.zh); });
    }
    await saveCache();
    const out = new Map(); texts.forEach(t => { if (cache.has(t)) out.set(t, cache.get(t)); });
    return out;
  }

  // 翻译一组 donor：填充 d.zh = { fields: {字段原名: 中文值}, essay: 中文介绍 }
  async function translateDonors(donors, opts) {
    await loadCache();
    const pending = [];
    donors.forEach(d => {
      d.zh = { fields: {}, essay: '' };
      Object.entries(d.fields || {}).forEach(([k, v]) => {
        const r = translateValueByDict(k, v);
        d.zh.fields[k] = r.zh;
        if (!r.complete && opts.online) pending.push(v);
      });
      if (d.essay && opts.online) pending.push(d.essay);
    });
    if (opts.online && pending.length) {
      const map = await translateOnline(pending, opts);
      donors.forEach(d => {
        Object.entries(d.fields || {}).forEach(([k, v]) => { if (map.has(v)) d.zh.fields[k] = map.get(v); });
        if (d.essay && map.has(d.essay)) d.zh.essay = map.get(d.essay);
      });
    }
    return donors;
  }

  window.FdeTranslate = { translateField, translateValueByDict, translateDonors, FIELD };
})();
