/** Share pages carry a decryption key in their URL, so they're never tracked or reported. */
export const isSharePage = (path: string) => path.startsWith("/s/");
