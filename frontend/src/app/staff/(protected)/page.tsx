"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function StaffHome() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/staff/front-desk");
  }, [router]);
  return null;
}
