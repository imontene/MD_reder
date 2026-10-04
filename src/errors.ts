import { ExitCode } from "./exit-codes.js";

/** An expected failure with a user-facing message and a specific exit code. */
export class MdRenderError extends Error {
  constructor(
    message: string,
    readonly exitCode: ExitCode,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class BrowserNotFoundError extends MdRenderError {
  constructor(message: string) {
    super(message, ExitCode.BrowserNotFound);
  }
}

export class RenderError extends MdRenderError {
  constructor(message: string) {
    super(message, ExitCode.Render);
  }
}
