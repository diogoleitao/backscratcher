export class PortInUseError extends Error {
  constructor(readonly port: number) {
    super(`port ${port} is already in use`);
  }
}
