import type { Recipe } from "@bb/shared";
import type { FieldSchema } from "../schema";

/** Column template for cryobank donor pages (public profile; photos need a logged-in Chrome). */
export const cryobankFieldSchema: FieldSchema = [
  {
    "key": "donorNumber",
    "label": "编号",
    "type": "string",
    "translate": "none"
  },
  {
    "key": "title",
    "label": "标题",
    "type": "string",
    "translate": "llm"
  },
  {
    "key": "badges",
    "label": "标签",
    "type": "string[]"
  },
  {
    "key": "height",
    "label": "身高",
    "type": "string",
    "translate": "none"
  },
  {
    "key": "weight",
    "label": "体重",
    "type": "string",
    "translate": "none"
  },
  {
    "key": "eyeColor",
    "label": "眼睛颜色",
    "type": "string"
  },
  {
    "key": "hairColor",
    "label": "发色",
    "type": "string"
  },
  {
    "key": "hairTexture",
    "label": "发质",
    "type": "string"
  },
  {
    "key": "complexion",
    "label": "肤色",
    "type": "string"
  },
  {
    "key": "bmi",
    "label": "BMI",
    "type": "number"
  },
  {
    "key": "ethnicOrigin",
    "label": "族裔",
    "type": "string"
  },
  {
    "key": "religion",
    "label": "宗教",
    "type": "string"
  },
  {
    "key": "ancestry",
    "label": "祖源",
    "type": "string[]"
  },
  {
    "key": "jewishAncestry",
    "label": "犹太血统",
    "type": "string"
  },
  {
    "key": "bloodType",
    "label": "血型",
    "type": "string",
    "translate": "none"
  },
  {
    "key": "cmvStatus",
    "label": "CMV 抗体",
    "type": "string"
  },
  {
    "key": "reportedPregnancies",
    "label": "已报告妊娠",
    "type": "string"
  },
  {
    "key": "geneticTestType",
    "label": "基因检测类型",
    "type": "string"
  },
  {
    "key": "educationLevel",
    "label": "学历",
    "type": "string"
  },
  {
    "key": "areaOfStudy",
    "label": "专业",
    "type": "string"
  },
  {
    "key": "priceIUI",
    "label": "IUI 价格",
    "type": "string"
  },
  {
    "key": "availableVials",
    "label": "可售数量",
    "type": "string",
    "translate": "none"
  },
  {
    "key": "jurisdictionNotes",
    "label": "地区限制",
    "type": "string[]"
  },
  {
    "key": "about",
    "label": "简介",
    "type": "text"
  },
  {
    "key": "gtsCarrierDiseases",
    "label": "携带者疾病",
    "type": "string[]",
    "translate": "llm"
  },
  {
    "key": "birthYear",
    "label": "出生年份",
    "type": "string",
    "translate": "none"
  },
  {
    "key": "medicalConsultDate",
    "label": "健康问询日期",
    "type": "string",
    "translate": "none"
  },
  {
    "key": "healthRecord",
    "label": "个人健康记录",
    "type": "json"
  },
  {
    "key": "familyTable",
    "label": "家族病史",
    "type": "json"
  },
  {
    "key": "riskTopics",
    "label": "风险提示",
    "type": "string[]",
    "translate": "dict"
  },
  {
    "key": "familyDiagnoses",
    "label": "家族病名",
    "type": "string[]",
    "translate": "dict"
  },
  {
    "key": "medicalPhrases",
    "label": "病史短句",
    "type": "string[]",
    "translate": "dict"
  },
  {
    "key": "gtsPanel",
    "label": "基因检测套餐",
    "type": "string",
    "translate": "none"
  },
  {
    "key": "gtsCarriers",
    "label": "携带者基因",
    "type": "json"
  },
  {
    "key": "hsYears",
    "label": "高中年限",
    "type": "string",
    "translate": "none"
  },
  {
    "key": "hsGpa",
    "label": "高中 GPA",
    "type": "string",
    "translate": "none"
  },
  {
    "key": "collegeYears",
    "label": "大学年限",
    "type": "string",
    "translate": "none"
  },
  {
    "key": "collegeGpa",
    "label": "大学 GPA",
    "type": "string",
    "translate": "none"
  },
  {
    "key": "majors",
    "label": "主修",
    "type": "string",
    "translate": "dict"
  },
  {
    "key": "minors",
    "label": "辅修",
    "type": "string",
    "translate": "dict"
  },
  {
    "key": "degrees",
    "label": "学位",
    "type": "string[]",
    "translate": "none"
  },
  {
    "key": "gradYears",
    "label": "研究生年限",
    "type": "string",
    "translate": "none"
  },
  {
    "key": "gradGpa",
    "label": "研究生 GPA",
    "type": "string",
    "translate": "none"
  },
  {
    "key": "gradFocus",
    "label": "研究生方向",
    "type": "string",
    "translate": "dict"
  },
  {
    "key": "otherDegrees",
    "label": "其他学位/证书",
    "type": "string",
    "translate": "dict"
  },
  {
    "key": "occupation",
    "label": "职业",
    "type": "string",
    "translate": "dict"
  },
  {
    "key": "pastJobs",
    "label": "工作经历",
    "type": "string",
    "translate": "dict"
  },
  {
    "key": "fullTimeStudent",
    "label": "全日制学生",
    "type": "string",
    "translate": "none"
  },
  {
    "key": "military",
    "label": "服役经历",
    "type": "string",
    "translate": "none"
  },
  {
    "key": "honors",
    "label": "学业荣誉",
    "type": "string",
    "translate": "dict"
  },
  {
    "key": "clubs",
    "label": "社团/协会",
    "type": "string",
    "translate": "dict"
  },
  {
    "key": "academicAwards",
    "label": "数学相关奖项",
    "type": "string",
    "translate": "dict"
  },
  {
    "key": "favoriteSubject",
    "label": "最喜欢的科目",
    "type": "string",
    "translate": "dict"
  },
  {
    "key": "mechanicalSkills",
    "label": "动手技能",
    "type": "string[]",
    "translate": "none"
  },
  {
    "key": "mechanicalOther",
    "label": "其他技能",
    "type": "string",
    "translate": "dict"
  },
  {
    "key": "mathSkills",
    "label": "数学水平",
    "type": "string",
    "translate": "none"
  },
  {
    "key": "athleticLevel",
    "label": "运动水平",
    "type": "string",
    "translate": "none"
  },
  {
    "key": "athleticAwards",
    "label": "运动荣誉",
    "type": "string",
    "translate": "dict"
  },
  {
    "key": "favoriteSport",
    "label": "最喜欢的运动",
    "type": "string",
    "translate": "dict"
  },
  {
    "key": "sportsPlayed",
    "label": "常玩的运动",
    "type": "string[]",
    "translate": "none"
  },
  {
    "key": "sportsOther",
    "label": "其他运动",
    "type": "string",
    "translate": "dict"
  },
  {
    "key": "languages",
    "label": "语言",
    "type": "string[]",
    "translate": "none"
  },
  {
    "key": "languagesOther",
    "label": "其他语言",
    "type": "string",
    "translate": "dict"
  },
  {
    "key": "hobbies",
    "label": "兴趣爱好",
    "type": "text",
    "translate": "llm"
  },
  {
    "key": "creativity",
    "label": "创意表达",
    "type": "text",
    "translate": "llm"
  },
  {
    "key": "favoriteFoods",
    "label": "喜欢的食物",
    "type": "text",
    "translate": "llm"
  },
  {
    "key": "favoriteAnimal",
    "label": "最喜欢的动物",
    "type": "text",
    "translate": "llm"
  },
  {
    "key": "travelWish",
    "label": "向往的旅行地",
    "type": "text",
    "translate": "llm"
  },
  {
    "key": "oneThing",
    "label": "想让大家知道的事",
    "type": "text",
    "translate": "llm"
  },
  {
    "key": "childhoodPhotos",
    "label": "童年照片",
    "type": "url"
  },
  {
    "key": "adulthoodPhotos",
    "label": "成年照片",
    "type": "url"
  }
];

/**
 * Confirmed against the live page in M3 (2026-10-31): the profile is Nuxt SSR; each attribute is
 * `div.item > p` (label) followed by `div.value`, which the interpreter's `label` mode resolves.
 * Photos (3 childhood + 3 adulthood) live in #donor-items-panel-photos as a carousel with cloned
 * slides, hence `unique`; they only render when the Chrome running the extension is logged in.
 */
export const cryobankRecipeV1: Recipe = {
  "platform": "cryobank",
  "version": 1,
  "match": "^https://www\\.cryobank\\.com/donor/(\\d+)",
  "settings": {
    "delayMs": [
      3000,
      8000
    ],
    "timeoutMs": 30000,
    "maxRetries": 2
  },
  "steps": [
    {
      "op": "navigate",
      "url": "{{job.url}}"
    },
    {
      "op": "assertNotMatch",
      "urlPattern": "/login",
      "reason": "auth_required"
    },
    {
      "op": "waitFor",
      "selector": "#donor-intro h4.donor-name",
      "timeoutMs": 15000
    },
    {
      "op": "click",
      "selector": "#donor-items-tab-photos",
      "optional": true
    },
    {
      "op": "sleep",
      "ms": 3000
    },
    {
      "op": "scroll",
      "to": "bottom",
      "times": 2,
      "delayMs": 500
    },
    {
      "op": "extract",
      "fields": {
        "donorNumber": {
          "selector": "#donor-intro .donor-info p.fw-bold",
          "regex": "(\\d{4,6})",
          "trim": true
        },
        "title": {
          "selector": "#donor-intro h4.donor-name",
          "trim": true
        },
        "badges": {
          "selector": "#donor-intro .donor-info .flex-wrap span",
          "all": true,
          "trim": true
        },
        "about": {
          "selector": "#donor-intro .donor-info .info p",
          "attr": "innerText",
          "trim": true
        },
        "height": {
          "label": "Height",
          "trim": true
        },
        "weight": {
          "label": "Weight",
          "trim": true
        },
        "eyeColor": {
          "label": "Eye color",
          "trim": true
        },
        "hairColor": {
          "label": "Hair color",
          "trim": true
        },
        "hairTexture": {
          "label": "Hair texture",
          "trim": true
        },
        "complexion": {
          "label": "Complexion",
          "trim": true
        },
        "bmi": {
          "label": "BMI",
          "trim": true
        },
        "ethnicOrigin": {
          "label": "Ethnic origin",
          "trim": true
        },
        "religion": {
          "label": "Religion",
          "trim": true
        },
        "ancestry": {
          "label": "Ancestry",
          "split": ",",
          "trim": true
        },
        "jewishAncestry": {
          "label": "Jewish ancestry",
          "trim": true
        },
        "bloodType": {
          "label": "Blood type",
          "trim": true
        },
        "cmvStatus": {
          "label": "CMV antibody",
          "trim": true
        },
        "reportedPregnancies": {
          "label": "Reported pregnancies",
          "trim": true
        },
        "geneticTestType": {
          "label": "Genetic test type",
          "trim": true
        },
        "educationLevel": {
          "label": "Education level",
          "trim": true
        },
        "areaOfStudy": {
          "label": "Area of study",
          "trim": true
        },
        "priceIUI": {
          "label": "Price",
          "trim": true
        },
        "availableVials": {
          "label": "Available",
          "trim": true
        },
        "jurisdictionNotes": {
          "selector": "#international-availability li",
          "all": true,
          "trim": true
        },
        "childhoodPhotos": {
          "selector": "#donor-items-panel-photos img[alt^='Childhood']",
          "attr": "src",
          "all": true,
          "unique": true,
          "trim": true
        },
        "adulthoodPhotos": {
          "selector": "#donor-items-panel-photos img[alt^='Adulthood']",
          "attr": "src",
          "all": true,
          "unique": true,
          "trim": true
        }
      }
    },
    {
      "op": "downloadMedia",
      "from": "childhoodPhotos",
      "as": "photo"
    },
    {
      "op": "downloadMedia",
      "from": "adulthoodPhotos",
      "as": "photo"
    },
    {
      "op": "emit"
    }
  ]
};

/**
 * Donor documents behind the profile's "View ..." buttons (2026-11-03). Each calls
 * `/api/signedUrl?resourceNo=<6-digit donor no>-<code>`, which returns a short-lived CloudFront URL of the PDF
 * (403 "User needs tier 2 account" when the Chrome is not logged in). The PDF is uploaded as a `doc` media field and
 * parsed on the server (apps/web/src/lib/gts, apps/web/src/lib/medical); the signed URL is not stored.
 *   GT → `gtsReport`      Genetic test summary → gtsPanel / gtsCarriers
 *   MH → `medicalReport`  Medical profile → birthYear, personalHealth, familyHistory, riskAssessment
 *   LP → `profileReport`  Extended donor profile (<no>LP.pdf): the social questionnaire → education, occupation,
 *                         skills, sports, languages, favourites (apps/web/src/lib/donor-profile)
 * All parsed by rules, no model. The personal essay (ES) was downloaded by v8 only and is retired.
 */
export const cryobankDocuments = [
  { code: "GT", field: "gtsReport" },
  { code: "MH", field: "medicalReport" },
  { code: "LP", field: "profileReport" },
] as const;

/** Document fields no longer downloaded; the seed derives a recipe version without their steps. */
export const retiredDocumentFields = ["essayReport"];

export function documentSteps(doc: { code: string; field: string }): Recipe["steps"] {
  return [
    { op: "fetchJson", url: `/api/signedUrl?resourceNo={{data.donorNumber|pad:6}}-${doc.code}`, pick: "data.0.signedUrl", into: doc.field, optional: true },
    { op: "downloadMedia", from: doc.field, as: "doc", drop: true },
  ];
}

/** Document fields a recipe already downloads. */
export const documentFieldsOf = (r: Recipe) => new Set(r.steps.flatMap((s) => (s.op === "fetchJson" ? [s.into] : [])));

/** Drop the steps of retired document fields. */
export function withoutDocumentSteps(r: Recipe, version: number, fields: readonly string[]): Recipe {
  const gone = new Set(fields);
  return { ...r, version, steps: r.steps.filter((s) => !((s.op === "fetchJson" && gone.has(s.into)) || (s.op === "downloadMedia" && gone.has(s.from)))) };
}

/** Insert the steps for `docs` right before `emit` (or at the end). */
export function withDocumentSteps(r: Recipe, version: number, docs: readonly { code: string; field: string }[]): Recipe {
  const add = docs.flatMap(documentSteps);
  const at = r.steps.findIndex((s) => s.op === "emit");
  const steps = at < 0 ? [...r.steps, ...add] : [...r.steps.slice(0, at), ...add, ...r.steps.slice(at)];
  return { ...r, version, steps };
}
