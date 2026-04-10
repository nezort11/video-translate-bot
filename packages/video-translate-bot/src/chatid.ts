export const getChatId = (id: string | number | undefined) => {
  if (typeof id === "number") return id;
  if (!id) return 0;
  // If it's already a full chat id (starts with -100)
  if (id.startsWith("-100")) return +id;
  // If it's a numeric id without -100 prefix, add it
  if (!isNaN(+id)) {
    return +`-100${id}`;
  }
  // Otherwise it might be a username or something else, return 0 or original if number
  return 0;
};
