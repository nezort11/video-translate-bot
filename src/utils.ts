export const getChatId = (id: string) => {
  return `-100${id}`;
};

export const escapeHtml = (unsafeHtml: string) => {
  return unsafeHtml
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
};

// https://github.com/TypeStrong/ts-node/discussions/1290
export const dynamicImport = new Function(
  "specifier",
  "return import(specifier)"
) as <T>(module: string) => Promise<T>;

export const importPTimeout = async () =>
  await dynamicImport<typeof import("p-timeout")>("p-timeout");

export const importPRetry = async () =>
  await dynamicImport<typeof import("p-retry")>("p-retry");
