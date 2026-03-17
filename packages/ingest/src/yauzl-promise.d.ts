declare module "yauzl-promise" {
  import { Readable } from "node:stream";

  export interface ZipEntry {
    filename: string;
    openReadStream(): Promise<Readable>;
  }

  export interface ZipFile extends AsyncIterable<ZipEntry> {
    close(): Promise<void>;
  }

  const yauzl: {
    open(path: string): Promise<ZipFile>;
  };

  export default yauzl;
}
