import type { Recipe } from "@bb/shared";
import type { FieldSchema } from "../schema";

/** Local fixture pages served by the web app at /test-page/donor-N.html, used for the M2 end-to-end check. */
export const localtestFieldSchema: FieldSchema = [
  { key: "donorNumber", label: "编号", type: "string", translate: "none" },
  { key: "title", label: "标题", type: "string", translate: "llm" },
  { key: "height", label: "身高", type: "string", translate: "none" },
  { key: "eyeColor", label: "眼睛颜色", type: "string" },
  { key: "hairColor", label: "发色", type: "string" },
  { key: "bloodType", label: "血型", type: "string", translate: "none" },
  { key: "cmvStatus", label: "CMV", type: "string" },
  { key: "ancestry", label: "祖源", type: "string[]" },
  { key: "educationLevel", label: "学历", type: "string" },
  { key: "about", label: "简介", type: "text" },
  { key: "photos", label: "照片", type: "url" },
];

export const localtestRecipeV1: Recipe = {
  platform: "localtest",
  version: 1,
  match: "/test-page/donor-\\d+\\.html",
  settings: { delayMs: [500, 1500], timeoutMs: 20000, maxRetries: 1 },
  steps: [
    { op: "navigate", url: "{{job.url}}" },
    { op: "assertNotMatch", urlPattern: "/login", reason: "auth_required" },
    { op: "waitFor", selector: "h1", timeoutMs: 10000 },
    { op: "click", selector: "#more", optional: true },
    { op: "scroll", to: "bottom", times: 1, delayMs: 200 },
    {
      op: "extract",
      fields: {
        donorNumber: { selector: "h1", regex: "(\\d{3,6})", trim: true },
        title: { selector: "h1", regex: "·\\s*(.+)$", trim: true },
        height: { label: "Height", trim: true },
        eyeColor: { label: "Eye color", trim: true },
        hairColor: { label: "Hair color", trim: true },
        bloodType: { label: "Blood type", trim: true },
        cmvStatus: { label: "CMV", trim: true },
        ancestry: { label: "Ancestry", split: ",", trim: true },
        educationLevel: { label: "Education level", trim: true },
        about: { selector: "#about p", all: true, trim: true },
        photos: { selector: "img.donor-photo", attr: "src", all: true, trim: true },
      },
    },
    { op: "downloadMedia", from: "photos", as: "photo" },
    { op: "emit" },
  ],
};
