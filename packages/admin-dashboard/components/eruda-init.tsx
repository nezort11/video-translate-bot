"use client";

import { useEffect } from "react";

export function ErudaInit() {
  useEffect(() => {
    // Only load eruda in development or if NEXT_PUBLIC_ENABLE_ERUDA is set
    if (
      process.env.NODE_ENV === "development" ||
      process.env.NEXT_PUBLIC_ENABLE_ERUDA === "true"
    ) {
      import("eruda").then((eruda) => eruda.default.init());
    }
  }, []);

  return null;
}

