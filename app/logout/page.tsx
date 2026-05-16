"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

export default function LogoutPage() {
  const [status, setStatus] = useState<"logging-out" | "success" | "error">(
    "logging-out",
  );
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    async function logout() {
      try {
        const res = await fetch("/api/auth/logout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });

        if (res.ok) {
          await queryClient.invalidateQueries({ queryKey: ["auth-me"] });
          setStatus("success");
          // Redirect to home page after a brief delay
          setTimeout(() => {
            router.push("/");
          }, 1500);
        } else {
          setStatus("error");
        }
      } catch {
        setStatus("error");
      }
    }

    logout();
  }, [router, queryClient]);

  return (
    <div
      style={{
        maxWidth: 400,
        margin: "auto",
        padding: 32,
        textAlign: "center",
      }}
    >
      {status === "logging-out" && (
        <>
          <h2>Logging out...</h2>
          <p>Please wait while we log you out.</p>
        </>
      )}

      {status === "success" && (
        <>
          <h2>Logged out successfully</h2>
          <p>You have been logged out. Redirecting to home page...</p>
        </>
      )}

      {status === "error" && (
        <>
          <h2>Error</h2>
          <p>There was an error logging you out. Please try again.</p>
          <button
            onClick={() => router.push("/")}
            style={{
              marginTop: 16,
              padding: "8px 16px",
              cursor: "pointer",
            }}
          >
            Go to Home
          </button>
        </>
      )}
    </div>
  );
}
