"use client";

import { ApiReference } from "@scalar/api-reference";

export default function APIDocsPage() {
  return (
    <div className="h-screen w-full">
      {/* @ts-expect-error - ApiReference from @scalar/api-reference has complex typing issues */}
      <ApiReference
        spec={{
          url: "/api/openapi",
        }}
        configuration={{
          theme: "scalar",
          showSidebar: true,
          defaultHttpClient: {
            clientId: "default",
            supportedClients: ["curl", "javascript", "python"],
          },
          language: "zh-CN",
        }}
      />
    </div>
  );
}
