declare module "buffer" {
  global {
    interface Buffer extends Buffer {
      // telegraf uses non-standard Buffer.`name` property
      name: string;
    }
  }
}
