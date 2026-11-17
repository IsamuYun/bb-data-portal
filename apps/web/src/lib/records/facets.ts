import { eq, gte, inArray, isNull, records, sql, type Availability, type CarrierStatus, type SQL } from "@bb/db";

/**
 * Cross-source donor facets for the records list. Cryobank and FairFax store the same keys but in different
 * vocabularies (`5'10" (178cm)` vs `5'10"(177 cm)`, `Bachelor` vs `BS/Biology`, `Fair` vs `Light`), and race lives
 * in `ethnicOrigin` on Cryobank but in `ancestry` on FairFax (whose `ethnicOrigin` is parents' nationality). Each
 * facet maps those raw values onto one shared set of buckets, evaluated in SQL so filtering and paging stay in the DB.
 */

export type FacetOption = { value: string; label: string };

/** Platforms whose race buckets come from the `ancestry` list rather than `ethnicOrigin`. */
const RACE_FROM_ANCESTRY = new Set(["fairfax"]);

const data = (key: string) => sql`(${records.data}->>${key})`;

/** Height in cm parsed from either source's text; null when missing or 0. */
export const heightCm = sql<number | null>`nullif(substring(${data("height")} from '(\\d+)\\s*cm'), '')::int`;

const caseOf = (expr: SQL, rules: [string, string][], fallback: string | null) =>
  sql.join(
    [sql`(case`, ...rules.map(([re, v]) => sql`when ${expr} ~* ${re} then ${v}`), fallback ? sql`when ${expr} is not null then ${fallback}` : sql``, sql`end)`],
    sql` `,
  );

export const EDUCATION: FacetOption[] = [
  { value: "highschool", label: "高中" },
  { value: "associate", label: "副学士/大专" },
  { value: "bachelor", label: "本科" },
  { value: "master", label: "硕士" },
  { value: "doctorate", label: "博士及以上（含 MD/JD）" },
  { value: "studying", label: "在读（未毕业）" },
  { value: "other", label: "其他/证书" },
];
// Order matters: "Pursuing BS" is studying, not bachelor; "MD, MPH" is doctorate, not master.
const educationBucket = caseOf(
  sql`trim(${data("educationLevel")})`,
  [
    ["^purs?u?ing", "studying"],
    ["^(postgraduate|ph\\.? ?d|doctor\\w*|juris|pharm\\.? ?d|md|jd|dds|dmd|dvm|edd|mbbs|do)\\M", "doctorate"],
    ["^(master|ms|ma|mba|mpa|mph|mfa|mis|me|meng|med|llm)\\M", "master"],
    ["^(bachelor|bs|ba|bba|bfa|bsba|bcom|bgs|bm|bme|bt|bed|barch|bsn|llb)\\M", "bachelor"],
    ["^(associates?|assoc|aa|as|aas)\\M", "associate"],
    ["high school|\\mged\\M", "highschool"],
  ],
  "other",
);

export const COMPLEXION: FacetOption[] = [
  { value: "light", label: "浅/白皙" },
  { value: "mediumLight", label: "中等偏浅" },
  { value: "medium", label: "中等" },
  { value: "mediumDark", label: "中等偏深" },
  { value: "dark", label: "深" },
];
const complexionBucket = caseOf(
  sql`trim(${data("complexion")})`,
  [
    ["^(very fair|fair|light)$", "light"],
    ["^(medium[ /-]?light|light[ /-]?medium)$", "mediumLight"],
    ["^(medium[ /-]?dark|dark[ /-]?medium)$", "mediumDark"],
    ["^(medium|olive)$", "medium"],
    ["^(very dark|dark)$", "dark"],
  ],
  null,
);

/** Race buckets match when the donor's race text mentions them, so a mixed donor matches each of their parts. */
export const RACE: (FacetOption & { re: string })[] = [
  { value: "white", label: "白人", re: "caucasian|\\mwhite\\M" },
  { value: "asian", label: "亚裔（含南亚）", re: "\\masian\\M|east indian" },
  { value: "latino", label: "拉丁裔", re: "hispanic|latin" },
  { value: "black", label: "黑人", re: "\\mblack\\M|african" },
  { value: "mideast", label: "中东", re: "middle eastern|arab" },
  { value: "native", label: "美洲原住民", re: "american indian|alaska native|native american" },
  // Cryobank lists every part comma-separated; FairFax says "Multi" (a multi-item ancestry list also has a comma).
  { value: "mixed", label: "混血", re: "mixed|multi|," },
];

export const EYE: (FacetOption & { re: string })[] = [
  { value: "brown", label: "棕色", re: "brown" },
  { value: "black", label: "黑色", re: "black" },
  { value: "blue", label: "蓝色", re: "blue" },
  { value: "green", label: "绿色", re: "green" },
  { value: "hazel", label: "淡褐色", re: "hazel" },
  { value: "grey", label: "灰色", re: "gr[ae]y" },
  { value: "amber", label: "琥珀色", re: "amber" },
];

export const CARRIER: (FacetOption & { value: CarrierStatus })[] = [
  { value: "none", label: "不携带致病基因（已检测）" },
  { value: "carrier", label: "携带者" },
  { value: "pending", label: "有报告，待人工整理" },
  { value: "untested", label: "无基因检测" },
];
export const CARRIER_LABEL: Record<CarrierStatus, string> = { none: "未检出", carrier: "携带者", pending: "待整理", untested: "无检测" };

/** 可用状态 filter: one status, or "unavailable" = sold out or delisted. */
export const AVAIL: FacetOption[] = [
  { value: "available", label: "可购买" },
  { value: "unavailable", label: "不可用（售罄或已下架）" },
  { value: "sold_out", label: "已售罄（试管数为 0）" },
  { value: "delisted", label: "已下架（来源页已不存在）" },
  { value: "unknown", label: "未知" },
];
export const AVAIL_LABEL: Record<Availability, string> = { available: "可购买", sold_out: "不可用·售罄", delisted: "不可用·已下架", unknown: "未知" };

/** 颜值 filter: a minimum score, or "unrated". */
export const LOOKS: FacetOption[] = [
  ...[9, 8, 7, 6, 5].map((n) => ({ value: String(n), label: `${n} 分及以上` })),
  { value: "unrated", label: "未评分" },
];

export type FacetFilters = { heightMin: number | null; heightMax: number | null; education: string; complexion: string; race: string; eye: string; carrier: string; looks: string; avail: string };

const pick = (v: string, opts: FacetOption[]) => (opts.some((o) => o.value === v) ? v : "");
const cm = (v: string) => {
  const n = Number(v);
  return v.trim() && Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

export function parseFacets(get: (k: string) => string): FacetFilters {
  return {
    heightMin: cm(get("hmin")),
    heightMax: cm(get("hmax")),
    education: pick(get("edu"), EDUCATION),
    complexion: pick(get("skin"), COMPLEXION),
    race: pick(get("race"), RACE),
    eye: pick(get("eye"), EYE),
    carrier: pick(get("gene"), CARRIER),
    looks: pick(get("looks"), LOOKS),
    avail: pick(get("avail"), AVAIL),
  };
}

/** Query-string form of the filters (for pagination links); empty values dropped by the caller. */
export function facetParams(f: FacetFilters): Record<string, string> {
  return {
    hmin: f.heightMin?.toString() ?? "",
    hmax: f.heightMax?.toString() ?? "",
    edu: f.education,
    skin: f.complexion,
    race: f.race,
    eye: f.eye,
    gene: f.carrier,
    looks: f.looks,
    avail: f.avail,
  };
}

export const hasFacets = (f: FacetFilters) => Object.values(facetParams(f)).some(Boolean);

/** Race text per record: `ancestry` for FairFax-style platforms, `ethnicOrigin` elsewhere. */
export function raceText(platforms: { id: string; slug: string }[]): SQL {
  const ids = platforms.filter((p) => RACE_FROM_ANCESTRY.has(p.slug)).map((p) => p.id);
  if (!ids.length) return data("ethnicOrigin");
  return sql`(case when ${inArray(records.platformId, ids)} then ${data("ancestry")} else ${data("ethnicOrigin")} end)`;
}

export function facetWhere(f: FacetFilters, platforms: { id: string; slug: string }[]): SQL[] {
  const w: SQL[] = [];
  if (f.heightMin != null) w.push(sql`${heightCm} >= ${f.heightMin}`);
  if (f.heightMax != null) w.push(sql`${heightCm} <= ${f.heightMax}`);
  if (f.education) w.push(sql`${educationBucket} = ${f.education}`);
  if (f.complexion) w.push(sql`${complexionBucket} = ${f.complexion}`);
  const race = RACE.find((o) => o.value === f.race);
  if (race) w.push(sql`${raceText(platforms)} ~* ${race.re}`);
  const eye = EYE.find((o) => o.value === f.eye);
  if (eye) w.push(sql`${data("eyeColor")} ~* ${eye.re}`);
  if (f.carrier) w.push(eq(records.carrierStatus, f.carrier as CarrierStatus));
  if (f.looks === "unrated") w.push(isNull(records.looks));
  else if (f.looks) w.push(gte(records.looks, Number(f.looks)));
  if (f.avail === "unavailable") w.push(inArray(records.availability, ["sold_out", "delisted"]));
  else if (f.avail) w.push(eq(records.availability, f.avail as Availability));
  return w;
}
