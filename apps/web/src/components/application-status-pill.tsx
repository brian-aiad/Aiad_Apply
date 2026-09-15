"use client";

import { useEffect, useState } from "react";
import { StatusPill } from "@/components/status-pill";

export const APPLICATION_STATUS_EVENT = "aiadapply:application-status";

export function ApplicationStatusPill({
  applicationId,
  initialStatus,
}: {
  applicationId: string;
  initialStatus: string;
}) {
  const [status, setStatus] = useState(initialStatus);

  useEffect(() => {
    const update = (event: Event) => {
      const detail = (event as CustomEvent<{ applicationId?: string; status?: string }>).detail;
      if (detail?.applicationId === applicationId && detail.status) setStatus(detail.status);
    };
    window.addEventListener(APPLICATION_STATUS_EVENT, update);
    return () => window.removeEventListener(APPLICATION_STATUS_EVENT, update);
  }, [applicationId]);

  return <StatusPill status={status} />;
}
