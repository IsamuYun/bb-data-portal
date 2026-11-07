import type { FieldRule, Recipe, RecipeStep } from "@bb/shared";
import type { FieldSchema } from "../schema";
import { cryobankFieldSchema } from "./cryobank";
import { dictionaryZh } from "./dictionary-zh";

/**
 * Fairfax Cryobank (fairfaxcryobank.com), ported from the standalone exporter in apps/extension/babiology.
 *
 * Records share the `records` table with every other source. Concepts both banks have use the cryobank key, so the
 * single-donor profile, translation dictionary and exports work unchanged; Fairfax-only attributes get their own key.
 * "Donor Brand" is never captured (exports must not reveal the source).
 */

/** Fairfax label → shared key. Definitions (label, type, translate mode) are taken from the cryobank schema. */
const SHARED_KEYS = [
  "donorNumber",
  "badges", // Donor Category: ID / Non-ID
  "height",
  "weight",
  "eyeColor",
  "hairColor", // Hair "Black/ Straight" → color
  "hairTexture", // … → texture
  "complexion", // Skin Tone
  "bloodType",
  "ancestry",
  "ethnicOrigin", // Ethnic Background
  "religion",
  "cmvStatus",
  "reportedPregnancies", // Pregnancy Reported
  "geneticTestType", // "Expanded Genetic Testing" marker
  "educationLevel", // Degree
  "occupation",
  "favoriteSubject",
  "hobbies", // Talents/Hobbies
  "about", // Get to know the donor
] as const;

const FAIRFAX_ONLY: FieldSchema = [
  { key: "availability", label: "库存状态", type: "string", translate: "dict" },
  { key: "photoMatching", label: "照片匹配", type: "string", translate: "dict" },
  { key: "ageRangeAtDonation", label: "捐献时年龄段", type: "string", translate: "none" },
  { key: "astrologicalSign", label: "星座", type: "string", translate: "dict" },
  { key: "favoritePet", label: "喜欢的宠物", type: "string", translate: "dict" },
  { key: "personalGoals", label: "个人目标", type: "string[]", translate: "dict" },
  { key: "interests", label: "兴趣", type: "string[]", translate: "dict" },
];

const PHOTO_KEYS = ["childhoodPhotos", "adulthoodPhotos"] as const;

/**
 * Raw captures: the page outline as a JSON array (see `pageToJson` in @bb/shared). Specific fields are derived from it
 * on the server later, so changing them never needs a re-collection. `records.data` is jsonb: adding a key needs no
 * migration, only an entry here.
 */
const RAW_CAPTURES: FieldSchema = [{ key: "medicalProfile", label: "病史档案（原始）", type: "json" }];

/** Derived on the server from `medicalProfile` (apps/web/src/lib/fairfax/medical.ts); same shapes as cryobank's. */
const MEDICAL_KEYS = ["healthRecord", "familyTable", "familyDiagnoses", "medicalPhrases"] as const;
const MEDICAL_OWN: FieldSchema = [
  { key: "medicalQA", label: "病史问答", type: "json" },
  { key: "familyBackground", label: "家族祖籍", type: "json" },
];
export const FAIRFAX_MEDICAL_FIELDS = [...MEDICAL_KEYS, ...MEDICAL_OWN.map((f) => f.key)];

/** Derived from the Genetic Testing PDF's summary page (apps/web/src/lib/fairfax/genetic.ts); carrier keys as cryobank's. */
const GENETIC_KEYS = ["jewishAncestry", "gtsPanel", "gtsCarriers", "gtsCarrierDiseases"] as const;
const GENETIC_OWN: FieldSchema = [
  { key: "geneticTests", label: "基因检测项目", type: "json" },
  { key: "geneticUpdated", label: "基因检测更新日期", type: "string", translate: "none" },
];
export const FAIRFAX_GENETIC_FIELDS = [...GENETIC_KEYS, ...GENETIC_OWN.map((f) => f.key)];

function pick(keys: readonly string[]): FieldSchema {
  return keys.map((k) => {
    const f = cryobankFieldSchema.find((x) => x.key === k);
    if (!f) throw new Error(`fairfax: shared key ${k} missing from the cryobank schema`);
    return f;
  });
}

export const fairfaxFieldSchema: FieldSchema = [...pick(SHARED_KEYS), ...FAIRFAX_ONLY, ...pick(MEDICAL_KEYS), ...MEDICAL_OWN, ...pick(GENETIC_KEYS), ...GENETIC_OWN, ...RAW_CAPTURES, ...pick(PHOTO_KEYS)];

/** The site's Photo Consent wording, kept next to the switch that agrees to it. */
export const FAIRFAX_PHOTO_CONSENT =
  "I agree to use these photographs exclusively for the purpose of selecting a donor. I agree not to share, distribute or otherwise make the photographs available in any manner, or through any medium (including without limitation email, social media or internet feeds) to any third party. I will not use the photographs to seek a donor’s identity or other personally identifying information.";

/** The site shows "-" for an unanswered question: treat it as empty. */
const NOT_DASH = "^(?!-$)[\\s\\S]+";
const label = (l: string) => ({ label: l, regex: NOT_DASH, trim: true });
const list = (l: string) => ({ label: l, regex: NOT_DASH, split: ",", trim: true });

/**
 * Corrections found on the first live capture (2026-11-06): "-" placeholders, "Black/ Straight" hair, and the essay
 * whose `.text` block starts with a "GET TO KNOW THE DONOR" heading. Applied to an existing recipe by the seed
 * (`withFairfaxV2`) so admin edits elsewhere are kept.
 */
const EXTRACT_FIXES: Record<string, FieldRule> = {
  hairColor: { label: "Hair", regex: "^([^/]+?)\\s*(?:/|$)", trim: true },
  hairTexture: { label: "Hair", regex: "/\\s*(.+)$", trim: true },
  about: { selector: ".foto .text p", all: true, join: "\n\n", trim: true },
};
const DASH_FIELDS = {
  availability: "Availability", height: "Height", weight: "Weight", eyeColor: "Eye Color", complexion: "Skin Tone", bloodType: "Blood Type",
  ethnicOrigin: "Ethnic Background", educationLevel: "Degree", occupation: "Occupation", reportedPregnancies: "Pregnancy Reported",
  photoMatching: "Photo Matching", cmvStatus: "CMV Status", ageRangeAtDonation: "Age Range at Donation", astrologicalSign: "Astrological Sign",
  favoriteSubject: "Favorite Subject", religion: "Religion", favoritePet: "Favorite Pet", hobbies: "Talents/Hobbies",
};
const DASH_LISTS = { badges: "Donor Category", ancestry: "Ancestry", interests: "Interests", personalGoals: "Personal Goals" };
export const fairfaxExtractFixes: Record<string, FieldRule> = {
  ...Object.fromEntries(Object.entries(DASH_FIELDS).map(([k, l]) => [k, label(l)])),
  ...Object.fromEntries(Object.entries(DASH_LISTS).map(([k, l]) => [k, list(l)])),
  ...EXTRACT_FIXES,
};

/**
 * Sidebar attachments behind a consent checkbox, downloaded as documents for the parsers written against these
 * samples later. `attachmentNames` records every attachment a donor lists, to see which ones the site actually has.
 */
const FILE_LINKS = "a[href*='.ashx'], a[href*='.pdf'], iframe[src], embed[src]";
/** Only the site's own files: download pages also embed third-party frames (Google Tag Manager's noscript iframe). */
export const FAIRFAX_SAME_SITE = "^https://(?:www\\.)?fairfaxcryobank\\.com/.+";
const sidebarLink = (name: string): FieldRule => ({ selector: `.sidebar_01 li:contains('${name}') a[href]`, attr: "href", trim: true });
const ATTACHMENT_RULES: Record<string, FieldRule> = {
  attachmentNames: { selector: ".sidebar_01 li .span-02", all: true, unique: true, trim: true },
  medicalProfileUrl: sidebarLink("Medical Profile"),
  geneticTestingUrl: sidebarLink("Genetic Testing"),
};
/** Media fields the reports are uploaded under (see `applyReport`). */
export const FAIRFAX_REPORT_FIELDS = { medicalProfileUrl: "medicalReport", geneticTestingUrl: "geneticReport" } as const;
/**
 * The Medical Profile is a web page (download.aspx?prid=9&did=…), not a file: its HTML is kept under this media field
 * and parsed on the server; the PDFs it links to still go to `medicalReport`.
 */
export const FAIRFAX_MEDICAL_PAGE = "medicalPage";

/** Open an attachment link, tick-and-submit its consent form if one is shown, and download what it serves. */
function reportSteps(urlField: keyof typeof FAIRFAX_REPORT_FIELDS): RecipeStep[] {
  const field = FAIRFAX_REPORT_FIELDS[urlField];
  return [
    {
      op: "fetchDocument",
      url: `{{data.${urlField}}}`,
      consent: { when: "form input[type=checkbox]", accepted: false },
      binaryInto: field,
      ...(urlField === "medicalProfileUrl" ? { snapshot: FAIRFAX_MEDICAL_PAGE, pageJson: "medicalProfile" } : {}),
      fields: { [field]: { selector: FILE_LINKS, attr: "src", all: true, unique: true, regex: FAIRFAX_SAME_SITE, trim: true } },
      optional: true,
    },
    { op: "downloadMedia", from: field, as: "doc" },
  ];
}

/** True once a recipe carries the 2026-11-06 corrections and the report downloads. */
export const hasFairfaxV2 = (r: Recipe) =>
  r.steps.some((s) => s.op === "extract" && "hairTexture" in s.fields && "geneticTestingUrl" in s.fields) &&
  r.steps.some((s) => s.op === "fetchDocument" && s.url.includes("geneticTestingUrl"));

/**
 * New version of `r`: corrected profile rules and the attachment links merged into its extract step, report download
 * steps added before `emit`. Everything else (consent switches, admin edits) is kept as is.
 */
export function withFairfaxV2(r: Recipe, version: number): Recipe {
  const steps = r.steps.map((s) => {
    if (s.op !== "extract" || !("donorNumber" in s.fields)) return s;
    const fields = { ...s.fields, ...fairfaxExtractFixes, ...ATTACHMENT_RULES };
    // Keep hairTexture right after hairColor so the stored JSON reads in page order.
    const ordered = Object.fromEntries(Object.entries(fields).flatMap(([k, v]) => (k === "hairTexture" ? [] : k === "hairColor" ? [[k, v], ["hairTexture", fields.hairTexture]] : [[k, v]])));
    return { ...s, fields: ordered };
  });
  const missing = (Object.keys(FAIRFAX_REPORT_FIELDS) as (keyof typeof FAIRFAX_REPORT_FIELDS)[]).filter(
    (k) => !steps.some((s) => s.op === "fetchDocument" && s.url.includes(k)),
  );
  const add = missing.flatMap(reportSteps);
  const emit = steps.findIndex((s) => s.op === "emit");
  return { ...r, version, steps: emit < 0 ? [...steps, ...add] : [...steps.slice(0, emit), ...add, ...steps.slice(emit)] };
}

/**
 * Search results page (searchresults.aspx, filters live in the site session): page through every result with the
 * site's own AJAX pager, collect the donor numbers and enqueue one profile job each. Ported from content.js
 * `collectAllDonors` (rewind to page 1, click "next" until inactive, the current-page marker changes per page).
 */
export const fairfaxListing: NonNullable<Recipe["listing"]> = {
  match: "^https://(www\\.)?fairfaxcryobank\\.com/search/searchresults\\.aspx",
  timeoutMs: 480000,
  steps: [
    { op: "navigate", url: "{{job.url}}" },
    { op: "assertNotMatch", urlPattern: "[Ll]ogin", reason: "auth_required" },
    { op: "waitFor", selector: ".rf01-col", timeoutMs: 20000 },
    {
      op: "paginate",
      fields: { donorNumbers: { selector: ".rf01-col a[href*='donorprofile']", attr: "href", all: true, unique: true, regex: "number=(\\d+)", trim: true } },
      prev: ".col-03 a.link.prev",
      next: ".col-03 a.link.next",
      disabled: ".inactive",
      changed: ".col-03 .link.here",
      maxPages: 200,
      timeoutMs: 15000,
      delayMs: 800,
    },
    { op: "enqueue", from: "donorNumbers", url: "https://fairfaxcryobank.com/search/donorprofile.aspx?number={{item}}" },
    { op: "emit" },
  ],
};

/**
 * Draft from the exporter's parser (content.js `parseProfile` / `fetchPhotoSet`); selectors still need a dry run
 * against the live, logged-in site. Profile attributes sit in three layouts (`.title-sub .row` .ts-01/.ts-02,
 * `table.height td` .title-block/.info, `ul.list-info li` .width/.text), all "Label:" + sibling value, which the
 * interpreter's `label` mode resolves.
 *
 * The Adult Child Photo Set sits behind the site's Photo Consent form. `consent.accepted` ships as false: the photo
 * set is then skipped (logged as a warning) until an admin who has read FAIRFAX_PHOTO_CONSENT sets it to true.
 */
export const fairfaxRecipeV1: Recipe = {
  platform: "fairfax",
  version: 1,
  match: "^https://(www\\.)?fairfaxcryobank\\.com/search/donorprofile\\.aspx\\?number=(\\d+)",
  settings: { delayMs: [3000, 8000], timeoutMs: 30000, maxRetries: 2 },
  steps: [
    { op: "navigate", url: "{{job.url}}" },
    { op: "assertNotMatch", urlPattern: "[Ll]ogin", reason: "auth_required" },
    { op: "waitFor", selector: ".title:contains('Donor Number')", timeoutMs: 15000 },
    {
      op: "extract",
      fields: {
        donorNumber: { selector: ".title:contains('Donor Number')", regex: "(\\d{3,6})", trim: true },
        badges: list("Donor Category"),
        availability: label("Availability"),
        height: label("Height"),
        weight: label("Weight"),
        eyeColor: label("Eye Color"),
        hairColor: EXTRACT_FIXES.hairColor,
        hairTexture: EXTRACT_FIXES.hairTexture,
        complexion: label("Skin Tone"),
        bloodType: label("Blood Type"),
        ancestry: list("Ancestry"),
        ethnicOrigin: label("Ethnic Background"),
        educationLevel: label("Degree"),
        occupation: label("Occupation"),
        interests: list("Interests"),
        reportedPregnancies: label("Pregnancy Reported"),
        photoMatching: label("Photo Matching"),
        cmvStatus: label("CMV Status"),
        ageRangeAtDonation: label("Age Range at Donation"),
        astrologicalSign: label("Astrological Sign"),
        favoriteSubject: label("Favorite Subject"),
        religion: label("Religion"),
        favoritePet: label("Favorite Pet"),
        personalGoals: list("Personal Goals"),
        hobbies: label("Talents/Hobbies"),
        about: EXTRACT_FIXES.about,
        geneticTestType: { selector: ".profile-sp:contains('Expanded Genetic Testing')", regex: "(Expanded Genetic Testing)", trim: true },
        childhoodPhotos: { selector: ".foto img", attr: "src", all: true, unique: true, trim: true },
        photoSetUrl: sidebarLink("Adult Child Photo Set"),
        ...ATTACHMENT_RULES,
      },
    },
    { op: "downloadMedia", from: "childhoodPhotos", as: "photo" },
    {
      op: "fetchDocument",
      url: "{{data.photoSetUrl}}",
      consent: { when: "input[name$='consent']", accepted: false, text: FAIRFAX_PHOTO_CONSENT },
      binaryInto: "adulthoodPhotos",
      fields: {
        // Every image / file link on the result page except the site chrome (logos, layout images).
        adulthoodPhotos: {
          selector: "img[src], a[href*='.ashx'], a[href*='.jpg'], a[href*='.jpeg'], a[href*='.png'], a[href*='.webp'], a[href*='.pdf']",
          attr: "src",
          all: true,
          unique: true,
          regex: "^https://(?:www\\.)?fairfaxcryobank\\.com/(?!.*(?:logo|images-new/)).+",
          trim: true,
        },
      },
      optional: true,
    },
    { op: "downloadMedia", from: "adulthoodPhotos", as: "photo" },
    ...reportSteps("medicalProfileUrl"),
    ...reportSteps("geneticTestingUrl"),
    { op: "emit" },
  ],
  listing: fairfaxListing,
};

/**
 * Chinese for the Fairfax vocabularies, from the exporter's built-in dictionary (translate.js), scoped per field.
 * Entries the shared dictionary already covers (globally or for that field) are left out so cryobank translations
 * do not change.
 */
const FAIRFAX_DICTIONARY: Record<string, Record<string, string>> = {
  badges: { ID: "开放身份 (ID)", "Non-ID": "匿名 (Non-ID)", Anonymous: "匿名", "ID Option": "可选开放身份", "Open ID": "开放身份" },
  availability: { Active: "有库存", Inactive: "无库存", Limited: "库存有限", "Sold Out": "已售罄", Available: "可购买", Unavailable: "不可购买" },
  photoMatching: { Yes: "是", No: "否" },
  eyeColor: { Amber: "琥珀色", "Blue-Green": "蓝绿色", "Blue/Green": "蓝绿色", "Gray-Blue": "灰蓝色", "Green/Brown": "绿棕色", Grey: "灰色" },
  hairColor: { "Dirty Blond": "深金色", Sandy: "沙色", Grey: "灰色", Bald: "光头" },
  hairTexture: { Kinky: "细卷", Fine: "细软", Thick: "浓密", Thin: "稀疏" },
  complexion: { Light: "浅色", Tan: "小麦色", "Light/Medium": "浅至中等", "Medium/Dark": "中等至深色" },
  ethnicOrigin: {
    "Multi": "混血", "Multi-Racial": "混血", Mixed: "混血", Latino: "拉丁裔", Hispanic: "西班牙裔", "African American": "非裔美国人", African: "非裔",
    Black: "黑人", "Middle Eastern": "中东裔", "East Indian": "印度裔", "South Asian": "南亚裔", "Native American": "美洲原住民", "Pacific Islander": "太平洋岛民",
    Jewish: "犹太裔", "Ashkenazi Jewish": "阿什肯纳兹犹太裔", "Sephardic Jewish": "塞法迪犹太裔",
  },
  religion: { "Non-denominational": "无宗派" },
  astrologicalSign: {
    Aries: "白羊座", Taurus: "金牛座", Gemini: "双子座", Cancer: "巨蟹座", Leo: "狮子座", Virgo: "处女座", Libra: "天秤座",
    Scorpio: "天蝎座", Sagittarius: "射手座", Capricorn: "摩羯座", Aquarius: "水瓶座", Pisces: "双鱼座",
  },
  favoritePet: { Dog: "狗", Cat: "猫", Bird: "鸟", Fish: "鱼", Reptile: "爬行动物", Horse: "马", Rabbit: "兔子", Hamster: "仓鼠", Turtle: "乌龟", Snake: "蛇", None: "无" },
  favoriteSubject: {
    Arts: "艺术", Art: "艺术", History: "历史", Languages: "语言", Psychology: "心理学", Technology: "技术", "Natural Science": "自然科学", Science: "科学",
    Math: "数学", Mathematics: "数学", Biology: "生物", Chemistry: "化学", Physics: "物理", Literature: "文学", "Social Studies": "社会研究",
    "Social Science": "社会科学", Business: "商业", Economics: "经济学", Philosophy: "哲学", Engineering: "工程", "Computer Science": "计算机科学",
    "Physical Education": "体育", Music: "音乐", Drama: "戏剧", Theater: "戏剧", Geography: "地理", "Political Science": "政治学",
  },
  interests: {
    Cooking: "烹饪", Film: "电影", Movies: "电影", Football: "橄榄球", Soccer: "足球", Golf: "高尔夫", Poker: "扑克", Running: "跑步",
    "Video Production": "视频制作", Writing: "写作", Reading: "阅读", Travel: "旅行", Traveling: "旅行", Hiking: "徒步", Camping: "露营",
    Basketball: "篮球", Baseball: "棒球", Tennis: "网球", Swimming: "游泳", Cycling: "骑行", Biking: "骑行", Skiing: "滑雪", Snowboarding: "单板滑雪",
    Surfing: "冲浪", Fishing: "钓鱼", Hunting: "狩猎", Gaming: "电子游戏", "Video Games": "电子游戏", Chess: "国际象棋", Photography: "摄影",
    Painting: "绘画", Drawing: "素描", Singing: "唱歌", Dancing: "舞蹈", Guitar: "吉他", Piano: "钢琴", Drums: "鼓", Theatre: "戏剧", Music: "音乐",
    Weightlifting: "举重", "Weight Lifting": "举重", Fitness: "健身", Yoga: "瑜伽", "Martial Arts": "武术", Boxing: "拳击", Wrestling: "摔跤",
    Volleyball: "排球", Hockey: "冰球", Lacrosse: "长曲棍球", Rugby: "英式橄榄球", Track: "田径", "Track and Field": "田径", "Rock Climbing": "攀岩",
    Gardening: "园艺", Woodworking: "木工", Crafts: "手工", Sculpture: "雕塑", Acting: "表演", Comedy: "喜剧", Volunteering: "志愿服务",
    Sports: "运动", Outdoors: "户外", Animals: "动物", Cars: "汽车", Motorcycles: "摩托车", Boating: "划船", Sailing: "帆船", Skateboarding: "滑板",
    Meditation: "冥想", Languages: "语言", Investing: "投资", Collecting: "收藏", "Board Games": "桌游", Puzzles: "解谜", Baking: "烘焙", Arts: "艺术",
  },
  personalGoals: {
    "Community Service": "社区服务", "Financial Security": "经济安全", "Further Education": "继续深造", Politics: "政治", Success: "成功",
    "To Be Happy": "幸福快乐", "To Help People": "帮助他人", "Improve Environment": "改善环境", "Marriage/Family": "婚姻/家庭", Marriage: "婚姻",
    Family: "家庭", "Religious Growth": "宗教成长", "Travel the World": "环游世界", Career: "事业", "Career Advancement": "事业发展",
    "Home Ownership": "拥有住房", Health: "健康", "Personal Growth": "个人成长", Fame: "名望", Wealth: "财富", Retirement: "退休",
    "Start a Business": "创业", "Own a Business": "创业",
  },
  educationLevel: {
    "Bachelor's": "学士", BA: "文学学士 (BA)", BS: "理学学士 (BS)", BBA: "工商管理学士", BFA: "美术学士", MA: "文学硕士 (MA)", MS: "理学硕士 (MS)",
    MBA: "工商管理硕士 (MBA)", MD: "医学博士 (MD)", JD: "法学博士 (JD)", "Associate's": "副学士", "High School Diploma": "高中文凭",
    "Some College": "大学肄业", "Master's": "硕士",
  },
};

/** Fairfax dictionary rows not already provided by the shared dictionary (same field, or global). */
export const fairfaxDictionaryZh: Record<string, Record<string, string>> = Object.fromEntries(
  Object.entries(FAIRFAX_DICTIONARY).map(([fieldKey, m]) => [
    fieldKey,
    Object.fromEntries(Object.entries(m).filter(([source]) => !(source in (dictionaryZh[fieldKey] ?? {})) && !(source in dictionaryZh[""]))),
  ]),
);
