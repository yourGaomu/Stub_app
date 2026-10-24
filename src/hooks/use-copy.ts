import { Clipboard } from "@capacitor/clipboard";
import { App } from "antd";
import { useCallback } from "react";

export function useCopy() {
  const { message } = App.useApp();

  return useCallback(
    async (text: string, label = "已复制到剪贴板") => {
      try {
        await Clipboard.write({ string: text });
        message.success(label);
      } catch {
        try {
          await navigator.clipboard.writeText(text);
          message.success(label);
        } catch {
          message.error("复制失败，请手动长按复制");
        }
      }
    },
    [message],
  );
}

export async function readClipboardText(): Promise<string> {
  try {
    const { value } = await Clipboard.read();
    return value || "";
  } catch {
    try {
      return await navigator.clipboard.readText();
    } catch {
      return "";
    }
  }
}
