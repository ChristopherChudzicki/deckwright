import {
  type RenderHookOptions,
  type RenderOptions,
  render as rtlRender,
  renderHook as rtlRenderHook,
} from "@testing-library/react";
import { type ReactElement, type ReactNode, StrictMode } from "react";

function render(ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) {
  return rtlRender(ui, { wrapper: StrictMode, ...options });
}

function renderHook<Result, Props>(
  callback: (props: Props) => Result,
  options?: RenderHookOptions<Props>,
) {
  const UserWrapper = options?.wrapper;
  const Wrapper = UserWrapper
    ? ({ children }: { children: ReactNode }) => (
        <StrictMode>
          <UserWrapper>{children}</UserWrapper>
        </StrictMode>
      )
    : StrictMode;
  return rtlRenderHook(callback, { ...options, wrapper: Wrapper });
}

export * from "@testing-library/react";
export { render, renderHook };
