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
