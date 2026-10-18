import "@testing-library/jest-dom";
import { TextEncoder, TextDecoder } from "util";
import { Blob as NodeBlob, File as NodeFile } from "buffer";
import { webcrypto } from "crypto";

if (typeof global.TextEncoder === "undefined") {
  global.TextEncoder = TextEncoder;
}
if (typeof global.TextDecoder === "undefined") {
  global.TextDecoder = TextDecoder as typeof global.TextDecoder;
}

// jsdom's File/Blob don't implement arrayBuffer(); Node's buffer module does.
(global as any).Blob = NodeBlob;
(global as any).File = NodeFile;

// jsdom's window.crypto lacks .subtle; Node's webcrypto implements it.
// `crypto` is a getter-only accessor on jsdom's window, so a plain
// assignment silently no-ops — must redefine the property instead.
if (typeof global.crypto === "undefined" || !(global.crypto as any).subtle) {
  Object.defineProperty(global, "crypto", {
    value: webcrypto,
    configurable: true,
    writable: true,
  });
}
