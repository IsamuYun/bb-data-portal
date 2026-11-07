export const env = {
  get AUTH_SECRET() {
    const v = process.env.AUTH_SECRET;
    if (!v || v.length < 16) throw new Error("AUTH_SECRET must be set (>=16 chars)");
    return v;
  },
  get MEDIA_DIR() {
    return process.env.MEDIA_DIR ?? "./data/media";
  },
  get EXPORT_DIR() {
    return process.env.EXPORT_DIR ?? "./data/exports";
  },
  /** Folder holding the built extension zip(s); the newest one is offered for download. */
  get EXT_ZIP_DIR() {
    return process.env.EXT_ZIP_DIR ?? "../extension/dist";
  },
  get APP_URL() {
    return process.env.APP_URL ?? "http://localhost:3000";
  },
};
