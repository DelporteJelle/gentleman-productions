"use client";

import { useEffect } from "react";
import { ErrorScreen } from "@/components/StateScreens/StateScreens";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <ErrorScreen message={error.message} onRetry={reset} />;
}
