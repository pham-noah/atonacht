/** "1 note", "2 notes". */
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
